import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import { AiUsageService } from '../ai-builder/ai-usage.service';
import type { ImageContent } from '../ai-builder/providers/llm-provider.interface';
import { JsonFormsAssemblerService } from '../form-conversion/jsonforms-assembler.service';
import { assertConversionOutputComplete } from '../../common/utils/llm-output';
import {
  getJsonFormsRefineSystemPrompt,
  buildJsonFormsRefineUserPrompt,
} from '../ai-builder/prompts/jsonforms-refine-prompt';

export type ProgressCallback = (message: string) => void;

interface RefinementImage {
  buffer: Buffer;
  mimeType: ImageContent['mediaType'];
}

/**
 * Prompt-based designer for the jsonforms engine: a reviewer refines the
 * Data/UI/Print schemas with natural language (no drag-and-drop). Reuses the
 * provider abstraction and the conversion assembler (so the refined Data Schema
 * is Ajv-compile-checked). Edits to an unpublished draft update it in place;
 * refining a published version forks a new draft (immutability — see
 * docs/architecture/DATA-MODEL.md).
 */
/**
 * The same budget conversion gets. Refinement is the more demanding of the two:
 * conversion emits a definition from a document, whereas refine must re-emit
 * the ENTIRE existing definition to change one label in it.
 */
const REFINE_MAX_TOKENS = 32768;

@Injectable()
export class DesignerService {
  private readonly logger = new Logger(DesignerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly aiUsage: AiUsageService,
    private readonly assembler: JsonFormsAssemblerService,
  ) {}

  async refine(
    tenantId: string,
    formId: string,
    instruction: string,
    providerName?: string,
    onProgress?: ProgressCallback,
    ipAddress?: string | null,
    userId?: string,
    image?: RefinementImage,
  ) {
    const progress = onProgress ?? (() => {});

    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!form) throw new NotFoundException(`Form ${formId} not found`);

    const latest = form.versions[0];
    if (!latest) {
      throw new BadRequestException('Form has no version to refine');
    }

    // The user's side of the exchange, written as soon as ownership is
    // established (never before — a NotFound above must leave no trace). The
    // assistant's side lands when the outcome is known: recordOutcome below on
    // success, or the controller's recordFailure with the user-safe error.
    await this.recordMessage(tenantId, formId, {
      role: 'USER',
      content: instruction,
      hadImage: !!image,
      createdById: userId,
    });

    progress('Loading provider and current form definition...');
    const providerSet = await this.providerRegistry.getProvidersForTenant(tenantId);
    const baseProvider = this.providerRegistry.getProvider(providerSet, providerName);
    if (!baseProvider) throw new BadRequestException('No AI providers are configured');
    const provider = this.aiUsage.meter(baseProvider, {
      tenantId,
      userId,
      operation: 'designer.refine',
      formId,
    });
    if (image && !provider.generateWithImages) {
      throw new BadRequestException(
        `Provider "${provider.name}" does not support image-based refinement.`,
      );
    }

    const current = {
      dataSchema: latest.dataSchema ?? {},
      uiSchema: latest.uiSchema ?? {},
      printSchema: latest.printSchema ?? {},
      translations: latest.translations ?? {},
      conversionMetadata: latest.conversionMetadata ?? {},
    };

    progress(
      `Sending ${image ? 'image-guided ' : ''}refinement to ${provider.name} — this may take 30–60 seconds...`,
    );
    const userPrompt =
      buildJsonFormsRefineUserPrompt(current, instruction) +
      (image
        ? '\n\nThe user attached an image as a visual reference. Compare it with the current definition and apply only the requested correction.'
        : '');
    // The SAME budget conversion gets, not half of it. Refinement is the more
    // demanding of the two: conversion emits a definition from a document,
    // whereas refine must re-emit the ENTIRE existing definition — dataSchema,
    // uiSchema, printSchema, translations and metadata — to change one label in
    // it. On a large chart 16k ran out mid-object, and the truncated result
    // surfaced as a vague "AI output was not valid JSON".
    const generationOptions = {
      temperature: 0.2,
      maxTokens: REFINE_MAX_TOKENS,
      jsonMode: true,
    };
    const raw = image
      ? await provider.generateWithImages!(
          userPrompt,
          [
            {
              type: 'image',
              mediaType: image.mimeType,
              data: image.buffer.toString('base64'),
            },
          ],
          getJsonFormsRefineSystemPrompt(),
          generationOptions,
        )
      : await provider.generate(
          userPrompt,
          getJsonFormsRefineSystemPrompt(),
          generationOptions,
        );

    progress('Parsing and validating the refined definition...');
    // Conversion has always run this; refine never did, so a model that ran out
    // of room mid-object reached the parser as mangled JSON and produced "AI
    // output was not valid JSON" — true, but it names neither the cause nor
    // anything the author can act on.
    assertConversionOutputComplete(raw);
    const assembled = this.assembler.assemble(raw);

    // NOTE: no `engine` field. It was dropped from FormVersion with the Form.io
    // removal (ADR-004) — JSON Forms is the only engine — and passing it here
    // made Prisma reject EVERY refine with "Unknown argument `engine`". The
    // identically-named literal in FormService.versionPayload is a different
    // thing: it is frozen into the content hash and must stay.
    const versionData = {
      dataSchema: assembled.dataSchema as unknown as Prisma.InputJsonValue,
      uiSchema: assembled.uiSchema as unknown as Prisma.InputJsonValue,
      printSchema: assembled.printSchema as unknown as Prisma.InputJsonValue,
      translations: assembled.translations as unknown as Prisma.InputJsonValue,
      conversionMetadata: assembled.conversionMetadata as unknown as Prisma.InputJsonValue,
      // Re-derive so scoring stays in sync when refinement adds/removes scored
      // items — the stored authoritative rules never drift from the UI schema.
      scoringRules: assembled.scoringRules as unknown as Prisma.InputJsonValue,
    };

    // Immutability: only an unpublished draft is edited in place.
    const savedVersion = latest.publishedAt
      ? await this.prisma.formVersion.create({
          data: { formId: form.id, version: latest.version + 1, ...versionData },
        })
      : await this.prisma.formVersion.update({
          where: { id: latest.id },
          data: versionData,
        });

    await this.prisma.form.update({
      where: { id: form.id },
      data: { currentVersionId: savedVersion.id },
    });

    await this.audit.record({
      tenantId,
      userId,
      ipAddress,
      action: 'form.designer.refine',
      resourceType: 'form_version',
      resourceId: savedVersion.id,
      details: { formId: form.id, version: savedVersion.version, forkedNewDraft: !!latest.publishedAt },
    });

    await this.recordMessage(tenantId, formId, {
      role: 'ASSISTANT',
      content:
        `Applied to draft version ${savedVersion.version}` +
        (latest.publishedAt ? ' (forked from the published version)' : '') +
        (assembled.warnings.length > 0
          ? `, with ${assembled.warnings.length} warning${assembled.warnings.length === 1 ? '' : 's'} to review`
          : '') +
        '.',
      createdById: userId,
    });

    progress('Refinement complete');
    return {
      provider: provider.name,
      version: savedVersion.version,
      dataSchema: assembled.dataSchema,
      uiSchema: assembled.uiSchema,
      printSchema: assembled.printSchema,
      translations: assembled.translations,
      conversionMetadata: assembled.conversionMetadata,
      warnings: assembled.warnings,
    };
  }

  /** The refine conversation for a form, oldest first, tenant-scoped. */
  async listMessages(tenantId: string, formId: string) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      select: { id: true },
    });
    if (!form) throw new NotFoundException(`Form ${formId} not found`);

    return this.prisma.formAiMessage.findMany({
      where: { tenantId, formId },
      orderBy: { createdAt: 'asc' },
      // A bound, not pagination: at ~2 rows per refinement this is hundreds of
      // refinements before anything is trimmed, and it is the OLDEST that drop.
      take: -400,
      select: {
        id: true,
        role: true,
        content: true,
        status: true,
        hadImage: true,
        createdAt: true,
      },
    });
  }

  /**
   * Record a failed refinement against the conversation, with the SAME
   * user-safe message the SSE stream sent — the transcript must tell the same
   * story the user watched. Ownership is re-checked because the controller
   * calls this from its error path, where nothing else vouches for the id.
   */
  async recordFailure(tenantId: string, formId: string, message: string, userId?: string) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      select: { id: true },
    });
    if (!form) return;
    await this.recordMessage(tenantId, formId, {
      role: 'ASSISTANT',
      content: message,
      status: 'ERROR',
      createdById: userId,
    });
  }

  /** Best-effort write: losing a chat row must never fail a refinement. */
  private async recordMessage(
    tenantId: string,
    formId: string,
    message: {
      role: 'USER' | 'ASSISTANT';
      content: string;
      status?: 'OK' | 'ERROR';
      hadImage?: boolean;
      createdById?: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.formAiMessage.create({
        data: {
          tenantId,
          formId,
          role: message.role,
          content: message.content,
          status: message.status ?? 'OK',
          hadImage: message.hadImage ?? false,
          createdById: message.createdById ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Could not record ${message.role} chat message: ${String(err)}`);
    }
  }
}
