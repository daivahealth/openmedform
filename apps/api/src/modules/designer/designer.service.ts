import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import { AiUsageService } from '../ai-builder/ai-usage.service';
import type { ImageContent } from '../ai-builder/providers/llm-provider.interface';
import { JsonFormsAssemblerService, type AssembledJsonForms } from '../form-conversion/jsonforms-assembler.service';
import { assertConversionOutputComplete } from '../../common/utils/llm-output';
import {
  getJsonFormsRefineSystemPrompt,
  buildJsonFormsRefineUserPrompt,
  buildRefineDocument,
} from '../ai-builder/prompts/jsonforms-refine-prompt';
import {
  applyJsonPatch,
  JsonPatchError,
  type JsonPatchOperation,
} from '../../common/utils/json-patch';

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
      `Sending ${image ? 'image-guided ' : ''}refinement to ${provider.name} — quick edits land in seconds, full rewrites can take up to a minute...`,
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
    const generateOnce = (extraInstruction = '') =>
      image
        ? provider.generateWithImages!(
            userPrompt + extraInstruction,
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
        : provider.generate(
            userPrompt + extraInstruction,
            getJsonFormsRefineSystemPrompt(),
            generationOptions,
          );

    const raw = await generateOnce();

    progress('Parsing and validating the refined definition...');
    const assembled = await this.assembleRefinement(raw, current, progress, generateOnce);

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
      content: this.describeOutcome(assembled, savedVersion.version, !!latest.publishedAt),
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

  /**
   * Turn the model's response into validated artifacts, whichever mode it
   * chose (#130).
   *
   * PATCH mode: apply the RFC 6902 operations to the SAME document the prompt
   * showed the model (buildRefineDocument keeps the two aligned by
   * construction), then push the patched result through the assembler — so a
   * patched definition passes exactly the checks a re-emitted one passes:
   * Ajv compile, scope resolution, scoring re-derivation, warning extraction.
   * A patch is all-or-nothing; a half-applied edit cannot reach the database.
   *
   * FALLBACK: any patch failure — bad pointer, missing target, or a patched
   * result the assembler rejects — retries the SAME instruction once in FULL
   * mode before anything is reported. Worst case equals the old behaviour;
   * the user sees a progress line, never an error caused by patch shape.
   */
  private async assembleRefinement(
    raw: string,
    current: {
      dataSchema: unknown;
      uiSchema: unknown;
      printSchema: unknown;
      translations: unknown;
      conversionMetadata?: unknown;
    },
    progress: ProgressCallback,
    generateOnce: (extraInstruction: string) => Promise<string>,
  ): Promise<AssembledJsonForms> {
    const envelope = this.tryParsePatchEnvelope(raw);
    if (!envelope) {
      // FULL mode (or legacy shape). Truncation gets its specific message
      // before the assembler's generic invalid-JSON one.
      assertConversionOutputComplete(raw);
      return this.assembler.assemble(raw);
    }

    try {
      progress(`Applying ${envelope.operations.length} edit${envelope.operations.length === 1 ? '' : 's'}...`);
      const patched = applyJsonPatch(buildRefineDocument(current), envelope.operations) as Record<
        string,
        unknown
      >;
      return this.assembler.assemble(
        JSON.stringify({ ...patched, changeSummary: envelope.changeSummary }),
      );
    } catch (err) {
      // The fallback is an implementation detail: log the why, tell the user
      // only that we are taking the slower path.
      this.logger.warn(
        `Patch-mode refinement did not apply (${err instanceof JsonPatchError ? err.message : String(err)}); retrying in full mode`,
      );
      progress('The quick edit did not apply cleanly — redoing it as a full rewrite (slower)...');
      const rawRetry = await generateOnce(
        '\n\nIMPORTANT: Respond in FULL mode only — return the complete updated object with every artifact. Do NOT return an edit script.',
      );
      assertConversionOutputComplete(rawRetry);
      return this.assembler.assemble(rawRetry);
    }
  }

  /**
   * The patch envelope, or null for anything else — a full document, a legacy
   * response, or JSON too broken to parse (the full-mode path owns reporting
   * that properly).
   */
  private tryParsePatchEnvelope(
    raw: string,
  ): { operations: JsonPatchOperation[]; changeSummary?: string } | null {
    const trimmed = raw
      .replace(/```(?:json|JSON)?\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      const parsed = JSON.parse(trimmed) as {
        mode?: unknown;
        operations?: unknown;
        changeSummary?: unknown;
      };
      if (parsed.mode !== 'patch' || !Array.isArray(parsed.operations)) return null;
      return {
        operations: parsed.operations as JsonPatchOperation[],
        changeSummary:
          typeof parsed.changeSummary === 'string' && parsed.changeSummary.trim()
            ? parsed.changeSummary
            : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * The assistant's side of the exchange: the model's own account of what it
   * changed (it is asked for a changeSummary), then the factual state — which
   * draft version, whether it forked — and the warnings THEMSELVES rather
   * than a count. "2 warnings to review" with no way to read them was worse
   * than saying nothing.
   */
  private describeOutcome(
    assembled: AssembledJsonForms,
    version: number,
    forked: boolean,
  ): string {
    const parts: string[] = [];

    parts.push(
      assembled.changeSummary ??
        // Terse model or older cached prompt: fall back to a factual line.
        'Applied your change to the draft.',
    );

    parts.push(`Saved to draft version ${version}${forked ? ' (forked from the published version)' : ''}.`);

    if (assembled.warnings.length > 0) {
      const MAX_SHOWN = 5;
      const shown = assembled.warnings
        .slice(0, MAX_SHOWN)
        .map((w) => `⚠ ${w.message}${w.binding ? ` (${w.binding})` : ''}`);
      const more = assembled.warnings.length - shown.length;
      if (more > 0) shown.push(`…and ${more} more.`);
      parts.push(shown.join('\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Set, replace, or clear the terminology bindings on one Control (or one of
   * its answer options) — the dictionary panel's approve / remove / manual-add
   * write path (#134).
   *
   * Same immutability rule as refine: a draft is edited in place, a published
   * version forks a new draft. Deliberately NOT an LLM call — approval is a
   * click, and the audit row names the human who clicked it.
   */
  async updateCoding(
    tenantId: string,
    formId: string,
    input: {
      scope: string;
      /** Present -> bind the enum option with this stored code, not the field. */
      optionCode?: string;
      /** The complete new binding list; empty clears. */
      coding: Array<{
        system: string;
        code: string;
        display?: string;
        source: 'ai' | 'human';
        confidence?: number;
        verified: boolean;
      }>;
    },
    ipAddress?: string | null,
    userId?: string,
  ) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!form) throw new NotFoundException(`Form ${formId} not found`);
    const latest = form.versions[0];
    if (!latest?.uiSchema) throw new BadRequestException('Form has no definition to code');

    const uiSchema = structuredClone(latest.uiSchema) as Record<string, unknown>;
    const control = this.findControlByScope(
      (uiSchema.layout ?? uiSchema) as Record<string, unknown>,
      input.scope,
    );
    if (!control) {
      throw new BadRequestException(`No control with scope "${input.scope}" exists on this form`);
    }

    const options = (control.options ??= {}) as Record<string, unknown>;
    const omf = (options.omf ??= {}) as Record<string, unknown>;
    if (input.optionCode !== undefined) {
      const optionCoding = (omf.optionCoding ??= {}) as Record<string, unknown>;
      if (input.coding.length === 0) delete optionCoding[input.optionCode];
      else optionCoding[input.optionCode] = input.coding;
      if (Object.keys(optionCoding).length === 0) delete omf.optionCoding;
    } else {
      if (input.coding.length === 0) delete omf.coding;
      else omf.coding = input.coding;
    }

    const versionData = { uiSchema: uiSchema as unknown as Prisma.InputJsonValue };
    const savedVersion = latest.publishedAt
      ? await this.prisma.formVersion.create({
          data: {
            formId: form.id,
            version: latest.version + 1,
            dataSchema: latest.dataSchema as Prisma.InputJsonValue,
            printSchema: latest.printSchema as Prisma.InputJsonValue,
            translations: latest.translations as Prisma.InputJsonValue,
            conversionMetadata: latest.conversionMetadata as Prisma.InputJsonValue,
            scoringRules: latest.scoringRules as Prisma.InputJsonValue,
            ...versionData,
          },
        })
      : await this.prisma.formVersion.update({ where: { id: latest.id }, data: versionData });

    await this.prisma.form.update({
      where: { id: form.id },
      data: { currentVersionId: savedVersion.id },
    });

    await this.audit.record({
      tenantId,
      userId,
      ipAddress,
      action: 'form.coding.update',
      resourceType: 'form_version',
      resourceId: savedVersion.id,
      details: {
        formId: form.id,
        scope: input.scope,
        optionCode: input.optionCode ?? null,
        codes: input.coding.map((c) => `${c.system}|${c.code}|${c.verified ? 'verified' : 'unverified'}`),
        forkedNewDraft: !!latest.publishedAt,
      },
    });

    return { version: savedVersion.version, uiSchema };
  }

  /** Depth-first search for the Control carrying a scope. */
  private findControlByScope(
    node: Record<string, unknown>,
    scope: string,
  ): Record<string, unknown> | null {
    if (node.type === 'Control' && node.scope === scope) return node;
    const children = node.elements;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object') {
          const found = this.findControlByScope(child as Record<string, unknown>, scope);
          if (found) return found;
        }
      }
    }
    return null;
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
