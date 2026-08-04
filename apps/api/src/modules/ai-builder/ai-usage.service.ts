import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  ImageContent,
  LlmOptions,
  LlmProvider,
  TokenUsage,
} from './providers/llm-provider.interface';

export interface UsageContext {
  tenantId: string;
  userId?: string | null;
  /** Logical operation, e.g. 'ai.generate', 'ai.refine', 'conversion.convert'. */
  operation: string;
  /**
   * The form this spend belongs to, when it already exists at call time
   * (refine/designer flows).
   */
  formId?: string | null;
  /**
   * Create-flows meter the LLM call BEFORE the form exists, so they pass an
   * array here to collect the ids of the rows written under this context and
   * then call `attachFormId` once the form has been created. Rows for a run
   * that never produces a form (e.g. a failed conversion) correctly stay
   * unattributed.
   */
  collectRowIds?: bigint[];
}

/**
 * Records LLM token usage (one row per provider call) and provides a metering
 * wrapper around a provider so every generate/generateWithImages call is
 * accounted for without the caller passing onUsage by hand.
 *
 * Metering is best-effort: a persistence failure is logged and swallowed so it
 * can never break the AI generation it measures (same contract as AuditService).
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    ctx: UsageContext,
    provider: string,
    usage: TokenUsage,
  ): Promise<bigint | null> {
    try {
      const row = await this.prisma.aiUsage.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId ?? null,
          formId: ctx.formId ?? null,
          provider,
          model: usage.model,
          operation: ctx.operation,
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens ?? 0,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
        select: { id: true },
      });
      ctx.collectRowIds?.push(row.id);
      return row.id;
    } catch (err) {
      this.logger.error(
        `Failed to record AI usage for ${provider}/${ctx.operation}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  /**
   * Attribute already-written usage rows to a form. Used by create-flows once
   * the form exists (see UsageContext.collectRowIds). Best-effort like
   * `record`: a failure must never fail the form creation it describes.
   */
  async attachFormId(rowIds: bigint[], formId: string): Promise<void> {
    if (rowIds.length === 0) return;
    try {
      await this.prisma.aiUsage.updateMany({
        where: { id: { in: rowIds } },
        data: { formId },
      });
    } catch (err) {
      this.logger.error(
        `Failed to attach form ${formId} to ${rowIds.length} AI usage row(s)`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Wrap a provider so each call injects an onUsage sink that persists a row.
   * The wrapper preserves `name` and the optional `generateWithImages` shape so
   * existing capability checks (`provider.generateWithImages`) still work.
   */
  meter(provider: LlmProvider, ctx: UsageContext): LlmProvider {
    const sink = (usage: TokenUsage) => {
      void this.record(ctx, provider.name, usage);
    };
    const withSink = (options?: LlmOptions): LlmOptions => ({
      ...options,
      onUsage: options?.onUsage
        ? (u) => {
            options.onUsage?.(u);
            sink(u);
          }
        : sink,
    });

    const wrapped: LlmProvider = {
      name: provider.name,
      generate: (prompt: string, systemPrompt: string, options?: LlmOptions) =>
        provider.generate(prompt, systemPrompt, withSink(options)),
    };

    if (provider.generateWithImages) {
      wrapped.generateWithImages = (
        prompt: string,
        images: ImageContent[],
        systemPrompt: string,
        options?: LlmOptions,
      ) => provider.generateWithImages!(prompt, images, systemPrompt, withSink(options));
    }

    return wrapped;
  }
}
