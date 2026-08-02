import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import { AiUsageService } from '../ai-builder/ai-usage.service';
import type { ImageContent } from '../ai-builder/providers/llm-provider.interface';
import { JsonFormsAssemblerService } from '../form-conversion/jsonforms-assembler.service';
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
@Injectable()
export class DesignerService {
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
    const generationOptions = { temperature: 0.2, maxTokens: 16384, jsonMode: true };
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
}
