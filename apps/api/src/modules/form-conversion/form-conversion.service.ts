import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type FormEngine } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AiBuilderService } from '../ai-builder/ai-builder.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import type { ImageContent } from '../ai-builder/providers/llm-provider.interface';
import { getPdfToJsonFormsPrompt } from '../ai-builder/prompts/pdf-to-jsonforms-prompt';
import { extractPdfText, renderPdfPagesToImages } from '../../common/utils/pdf-render';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';

// Keep typical multi-page clinical forms visually grounded without sending an
// unbounded number of high-resolution images to a provider.
const MAX_VISION_PAGES = 4;

export interface ConversionInput {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  engineTarget: FormEngine;
  providerName?: string;
  instructions?: string;
}

/**
 * AI PDF/image → form conversion pipeline (Phase 6), engine-targeted.
 *
 * A ConversionJob row tracks each run (PENDING → RUNNING → REVIEW | FAILED) so
 * status can be polled; the actual conversion runs in the background (a
 * lightweight fire-and-forget — no external queue). The author chooses the
 * target engine: FORMIO reuses the existing AiBuilderService; JSONFORMS emits
 * the separated Data/UI/Print schemas + translations with per-field confidence
 * and warnings, which are persisted so uncertain elements are never lost.
 */
@Injectable()
export class FormConversionService {
  private readonly logger = new Logger(FormConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiBuilder: AiBuilderService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly assembler: JsonFormsAssemblerService,
  ) {}

  /** Create the job and kick off conversion in the background. */
  async startConversion(
    tenantId: string,
    userId: string,
    input: ConversionInput,
    ipAddress?: string | null,
  ) {
    const job = await this.prisma.conversionJob.create({
      data: {
        tenantId,
        status: 'PENDING',
        engineTarget: input.engineTarget,
        provider: input.providerName ?? null,
        sourceFileName: input.fileName,
        createdById: userId,
      },
    });

    // Fire-and-forget: the HTTP request returns the job immediately; the client
    // polls getJob() for status. Errors are captured onto the job row.
    void this.run(job.id, tenantId, userId, input, ipAddress);

    return job;
  }

  async getJob(tenantId: string, id: string) {
    const job = await this.prisma.conversionJob.findFirst({
      where: { id, tenantId },
      include: { warnings: true },
    });
    if (!job) throw new NotFoundException(`Conversion job ${id} not found`);
    return job;
  }

  /**
   * Accept a reviewed conversion: promote the generated draft form from REVIEW
   * to DRAFT (ready for normal editing/publishing) and mark the job COMPLETED.
   */
  async acceptJob(tenantId: string, userId: string, id: string, ipAddress?: string | null) {
    const job = await this.prisma.conversionJob.findFirst({ where: { id, tenantId } });
    if (!job) throw new NotFoundException(`Conversion job ${id} not found`);
    if (job.status !== 'REVIEW' || !job.formId) {
      throw new NotFoundException('Job is not in a reviewable state');
    }

    await this.prisma.$transaction([
      this.prisma.form.update({ where: { id: job.formId }, data: { status: 'DRAFT' } }),
      this.prisma.conversionJob.update({ where: { id: job.id }, data: { status: 'COMPLETED' } }),
    ]);

    await this.audit.record({
      tenantId,
      userId,
      ipAddress,
      action: 'ai.convert.accept',
      resourceType: 'conversion_job',
      resourceId: job.id,
      details: { formId: job.formId },
    });

    return { accepted: true, formId: job.formId };
  }

  async listJobs(tenantId: string) {
    return this.prisma.conversionJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { warnings: true } } },
    });
  }

  private async run(
    jobId: string,
    tenantId: string,
    userId: string,
    input: ConversionInput,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.conversionJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING' },
    });

    try {
      const { formId, pageCount, warningCount } =
        input.engineTarget === 'JSONFORMS'
          ? await this.convertToJsonForms(tenantId, userId, jobId, input)
          : await this.convertToFormio(tenantId, userId, input);

      await this.prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'REVIEW',
          formId,
          pageCount: pageCount ?? null,
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        tenantId,
        userId,
        ipAddress,
        action: 'ai.convert',
        resourceType: 'conversion_job',
        resourceId: jobId,
        details: { engine: input.engineTarget, formId, warnings: warningCount },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Conversion job ${jobId} failed: ${message}`);
      await this.prisma.conversionJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message, completedAt: new Date() },
      });
      await this.audit.record({
        tenantId,
        userId,
        ipAddress,
        action: 'ai.convert.failed',
        resourceType: 'conversion_job',
        resourceId: jobId,
        details: { engine: input.engineTarget, error: message },
      });
    }
  }

  private async convertToFormio(
    tenantId: string,
    userId: string,
    input: ConversionInput,
  ): Promise<{ formId: string; pageCount?: number; warningCount: number }> {
    const result =
      input.mimeType === 'application/pdf'
        ? await this.aiBuilder.generateFromPdf(
            tenantId,
            input.fileBuffer,
            input.providerName,
            input.instructions,
          )
        : await this.aiBuilder.generateFromImage(
            tenantId,
            input.fileBuffer,
            input.mimeType,
            input.providerName,
            input.instructions,
          );

    const form = await this.createDraftForm(tenantId, userId, input.fileName, {
      engine: 'FORMIO',
      schema: result.schema as unknown as Prisma.InputJsonValue,
    });
    return { formId: form.id, warningCount: 0 };
  }

  private async convertToJsonForms(
    tenantId: string,
    userId: string,
    jobId: string,
    input: ConversionInput,
  ): Promise<{ formId: string; pageCount?: number; warningCount: number }> {
    const providerSet = await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(providerSet, input.providerName);
    if (!provider) {
      throw new Error('No AI providers are configured');
    }

    const systemPrompt = getPdfToJsonFormsPrompt();
    let pageCount: number | undefined;
    let rawOutput: string;

    if (input.mimeType === 'application/pdf') {
      const { text, pageCount: pages } = await extractPdfText(input.fileBuffer);
      pageCount = pages;
      const pageImages = provider.generateWithImages
        ? await renderPdfPagesToImages(input.fileBuffer, MAX_VISION_PAGES)
        : [];
      // Keep enough embedded text that later pages/sections aren't cut off on a
      // multi-page form (the page images remain the layout authority).
      const reference = text.trim()
        ? text.substring(0, 24000)
        : 'No reliable embedded text; rely on the attached page images.';
      let userPrompt = `Convert this clinical form PDF (${pages} page(s)) into the jsonforms engine format.\n\nExtracted text for reference:\n${reference}`;
      if (input.instructions) userPrompt += `\n\nAdditional instructions: ${input.instructions}`;

      if (provider.generateWithImages && pageImages.length > 0) {
        userPrompt += `\n\nVisual source pages: ${pageImages.length} rendered page image(s) are attached in page order (image 1 = PDF page 1). Use each image as the authority for that page's layout. The form may use a different layout on each page; infer it from the source instead of applying a fixed column arrangement.`;
        const images: ImageContent[] = pageImages.map((data) => ({
          type: 'image',
          mediaType: 'image/png',
          data,
        }));
        rawOutput = await provider.generateWithImages(userPrompt, images, systemPrompt, {
          temperature: 0.2,
          maxTokens: 16384,
          jsonMode: true,
        });
      } else {
        userPrompt += '\n\nNo page image is available. Preserve the extracted-text reading order in a conservative single-column layout unless the text itself provides unambiguous layout evidence; add an UNCERTAIN_SECTION_BOUNDARY warning for layout guesses.';
        rawOutput = await provider.generate(userPrompt, systemPrompt, {
          temperature: 0.2,
          maxTokens: 16384,
          jsonMode: true,
        });
      }
    } else {
      if (!provider.generateWithImages) {
        throw new Error(`Provider "${provider.name}" does not support image conversion`);
      }
      const userPrompt =
        'Convert this clinical form image into the jsonforms engine format.' +
        (input.instructions ? `\n\nAdditional instructions: ${input.instructions}` : '');
      rawOutput = await provider.generateWithImages(
        userPrompt,
        [
          {
            type: 'image',
            mediaType: input.mimeType as ImageContent['mediaType'],
            data: input.fileBuffer.toString('base64'),
          },
        ],
        systemPrompt,
        { temperature: 0.2, maxTokens: 16384, jsonMode: true },
      );
    }

    const assembled = this.assembler.assemble(rawOutput);

    const form = await this.createDraftForm(tenantId, userId, input.fileName, {
      engine: 'JSONFORMS',
      dataSchema: assembled.dataSchema as unknown as Prisma.InputJsonValue,
      uiSchema: assembled.uiSchema as unknown as Prisma.InputJsonValue,
      printSchema: assembled.printSchema as unknown as Prisma.InputJsonValue,
      translations: assembled.translations as unknown as Prisma.InputJsonValue,
      conversionMetadata: assembled.conversionMetadata as unknown as Prisma.InputJsonValue,
      scoringRules: assembled.scoringRules as unknown as Prisma.InputJsonValue,
    });

    if (assembled.warnings.length > 0) {
      await this.prisma.conversionWarning.createMany({
        data: assembled.warnings.map((w) => ({
          conversionJobId: jobId,
          type: w.type,
          message: w.message,
          binding: w.binding ?? null,
          sourcePage: w.sourcePage ?? null,
          confidence: w.confidence ?? null,
        })),
      });
    }

    return { formId: form.id, pageCount, warningCount: assembled.warnings.length };
  }

  /** Create a REVIEW-status draft form + its v1 version for the chosen engine. */
  private async createDraftForm(
    tenantId: string,
    userId: string,
    fileName: string,
    versionData: Prisma.FormVersionUncheckedCreateWithoutFormInput,
  ) {
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'Converted form';
    const slug = `${this.toSlug(baseName)}-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: baseName,
          slug,
          status: 'REVIEW',
          createdById: userId,
        },
      });
      const version = await tx.formVersion.create({
        data: { formId: form.id, version: 1, ...versionData },
      });
      return tx.form.update({
        where: { id: form.id },
        data: { currentVersionId: version.id },
      });
    });
  }

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80) || 'form';
  }
}
