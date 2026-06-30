import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ProviderRegistry } from './providers/provider-registry';
import { SchemaAssemblerService } from './schema-assembler.service';
import { SchemaValidatorService } from './schema-validator.service';
import { SchemaPreviewRendererService } from './schema-preview-renderer.service';
import { getSystemPrompt } from './prompts/system-prompt';
import { getComponentCatalog } from './prompts/component-catalog';
import { getPdfToFormPrompt } from './prompts/pdf-to-form-prompt';
import { ImageContent } from './providers/llm-provider.interface';

const execFileAsync = promisify(execFile);
const MAX_PDF_VISION_PAGES = 2;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export type ProgressCallback = (message: string) => void;

@Injectable()
export class AiBuilderService {
  private readonly logger = new Logger(AiBuilderService.name);

  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly assembler: SchemaAssemblerService,
    private readonly validator: SchemaValidatorService,
    private readonly previewRenderer: SchemaPreviewRendererService,
  ) {}

  async generate(
    tenantId: string,
    prompt: string,
    providerName?: string,
    category?: string,
    onProgress?: ProgressCallback,
  ): Promise<{ schema: Record<string, unknown>; provider: string }> {
    const progress = onProgress ?? (() => {});

    progress('Loading AI provider configuration...');
    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(
      providerSet,
      providerName,
    );

    if (!provider) {
      throw new BadRequestException(
        providerName
          ? `Provider "${providerName}" is not configured`
          : 'No AI providers are configured. Add a provider in Settings > AI Providers.',
      );
    }

    progress('Building system prompt and component catalog...');
    const systemPrompt = this.buildSystemPrompt(category);
    const userPrompt = `Create a clinical form based on this description:\n\n${prompt}`;

    this.logger.log(`Generating form with provider: ${provider.name}`);
    progress(`Sending request to ${provider.name} — this may take 30–60 seconds...`);

    const rawOutput = await provider.generate(userPrompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 8192,
      jsonMode: true,
    });

    progress('Received AI response, parsing JSON schema...');
    const schema = this.assembler.assemble(rawOutput);

    progress('Validating form schema structure...');
    this.ensureValidSchema(schema, 'Schema validation errors');

    progress('Form schema generated successfully');
    return { schema, provider: provider.name };
  }

  async refine(
    tenantId: string,
    currentSchema: Record<string, unknown>,
    instruction: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    providerName?: string,
    onProgress?: ProgressCallback,
  ): Promise<{ schema: Record<string, unknown>; provider: string; changeSummary?: string }> {
    const progress = onProgress ?? (() => {});

    progress('Loading AI provider configuration...');
    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(
      providerSet,
      providerName,
    );

    if (!provider) {
      throw new BadRequestException('No AI providers are configured');
    }

    progress('Preparing form context and conversation history...');
    const systemPrompt = this.buildSystemPrompt();

    let userPrompt = '';
    if (conversationHistory?.length) {
      progress(`Including ${conversationHistory.length} previous messages for context...`);
      userPrompt += 'Previous conversation:\n';
      for (const msg of conversationHistory) {
        userPrompt += `${msg.role}: ${msg.content}\n`;
      }
      userPrompt += '\n';
    }
    userPrompt += `Current form schema:\n${JSON.stringify(currentSchema, null, 2)}\n\n`;
    userPrompt += `User instruction:\n${instruction}\n\n`;
    userPrompt += 'IMPORTANT: Only modify what the user explicitly asked for. Do not change layout, styles, CSS classes, column widths, component order, or any other properties unless the user specifically requested those changes. Preserve every existing property on untouched components exactly as-is.\n\n';
    userPrompt += 'Return the complete updated form schema as JSON.';

    this.logger.log(`Refining form with provider: ${provider.name}`);
    progress(`Sending refinement request to ${provider.name} — this may take 30–60 seconds...`);

    const rawOutput = await provider.generate(userPrompt, systemPrompt, {
      temperature: 0.2,
      maxTokens: 16384,
      jsonMode: true,
    });

    progress('Received AI response, parsing JSON schema...');
    this.logger.debug(`Raw AI output length: ${rawOutput.length}, first 500 chars: ${rawOutput.substring(0, 500)}`);
    this.logger.debug(`Raw AI output last 500 chars: ${rawOutput.substring(Math.max(0, rawOutput.length - 500))}`);
    const schema = this.assembler.assemble(rawOutput);

    progress('Validating updated form schema...');
    this.ensureValidSchema(schema, 'Refinement validation errors');

    const changeSummary = this.diffSchemas(currentSchema, schema);
    progress('Schema refinement complete');
    return { schema, provider: provider.name, changeSummary };
  }

  async refineWithImage(
    tenantId: string,
    currentSchema: Record<string, unknown>,
    instruction: string,
    imageBuffer: Buffer,
    mimeType: string,
    conversationHistory?: Array<{ role: string; content: string }>,
    providerName?: string,
    onProgress?: ProgressCallback,
  ): Promise<{ schema: Record<string, unknown>; provider: string; changeSummary?: string }> {
    const progress = onProgress ?? (() => {});

    if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only PNG, JPEG, WebP, or GIF images are accepted for chat refinement',
      );
    }

    progress('Loading AI provider configuration...');
    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(
      providerSet,
      providerName,
    );

    if (!provider) {
      throw new BadRequestException('No AI providers are configured');
    }

    if (!provider.generateWithImages) {
      throw new BadRequestException(
        `Provider "${provider.name}" does not support image-based refinement.`,
      );
    }

    progress('Encoding image and preparing form context...');
    const systemPrompt = this.buildSystemPrompt();

    let userPrompt = '';
    if (conversationHistory?.length) {
      progress(`Including ${conversationHistory.length} previous messages for context...`);
      userPrompt += 'Previous conversation:\n';
      for (const msg of conversationHistory) {
        userPrompt += `${msg.role}: ${msg.content}\n`;
      }
      userPrompt += '\n';
    }
    userPrompt += `Current form schema:\n${JSON.stringify(currentSchema, null, 2)}\n\n`;
    userPrompt += `The user attached an image as visual reference for this correction request.\nInstruction:\n${instruction}\n\n`;
    userPrompt += 'IMPORTANT: Only modify what the user explicitly asked for. Do not change layout, styles, CSS classes, column widths, component order, or any other properties unless the user specifically requested those changes. Preserve every existing property on untouched components exactly as-is.\n\n';
    userPrompt +=
      'Compare the attached image with the current schema and return the complete corrected Form.io schema as JSON.';

    this.logger.log(`Refining form with image using provider: ${provider.name}`);
    progress(`Sending image + schema to ${provider.name} for visual analysis — this may take 30–60 seconds...`);

    const rawOutput = await provider.generateWithImages(
      userPrompt,
      [
        {
          type: 'image',
          mediaType: mimeType as ImageContent['mediaType'],
          data: imageBuffer.toString('base64'),
        },
      ],
      systemPrompt,
      { temperature: 0.2, maxTokens: 16384, jsonMode: true },
    );

    progress('Received AI response, parsing JSON schema...');
    const schema = this.assembler.assemble(rawOutput);

    progress('Validating corrected form schema...');
    this.ensureValidSchema(schema, 'Image refinement validation errors');

    const changeSummary = this.diffSchemas(currentSchema, schema);
    progress('Image-based refinement complete');
    return { schema, provider: provider.name, changeSummary };
  }

  async generateFromPdf(
    tenantId: string,
    pdfBuffer: Buffer,
    providerName?: string,
    additionalInstructions?: string,
  ): Promise<{ schema: Record<string, unknown>; provider: string }> {
    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(
      providerSet,
      providerName,
    );

    if (!provider) {
      throw new BadRequestException(
        providerName
          ? `Provider "${providerName}" is not configured`
          : 'No AI providers are configured. Add a provider in Settings > AI Providers.',
      );
    }

    const systemPrompt = this.buildPdfSystemPrompt();

    const pdf = new PDFParse({ data: pdfBuffer });
    const textResult = await pdf.getText();
    const extractedText = textResult.text;
    const numPages = textResult.total;
    await pdf.destroy();

    const renderedPageImages = provider.generateWithImages
      ? await this.renderPdfPagesToImages(pdfBuffer, MAX_PDF_VISION_PAGES)
      : [];
    const generatePdfDocumentVision =
      provider.name === 'claude' ? provider.generateWithImages : undefined;
    const generateImageVision =
      renderedPageImages.length > 0 ? provider.generateWithImages : undefined;

    if (
      (!extractedText || extractedText.trim().length < 20) &&
      !generatePdfDocumentVision &&
      !generateImageVision
    ) {
      throw new BadRequestException(
        'Could not extract meaningful text from the PDF. Use a text-based PDF, select a vision-capable provider, or add OCR support.',
      );
    }

    this.logger.log(
      `Extracted ${extractedText.length} chars from PDF (${numPages} pages)`,
    );

    let rawOutput: string;

    if (generateImageVision) {
      const images: ImageContent[] = renderedPageImages.map((data) => ({
        type: 'image',
        mediaType: 'image/png',
        data,
      }));
      const textForReference = extractedText?.trim()
        ? extractedText.substring(0, 8000)
        : 'No reliable embedded text was extracted. Use the attached page images for layout and field recognition.';
      let userPrompt = `Convert this clinical form PDF into a formio.js JSON schema. The PDF has ${numPages} page(s); ${images.length} page image(s) are attached for visual layout analysis.\n\nExtracted text for reference:\n${textForReference}`;
      if (additionalInstructions) {
        userPrompt += `\n\nAdditional instructions: ${additionalInstructions}`;
      }

      this.logger.log(
        `Generating form from PDF page images using provider: ${provider.name}`,
      );
      rawOutput = await generateImageVision.bind(provider)(
        userPrompt,
        images,
        systemPrompt,
        { temperature: 0.2, maxTokens: 16384, jsonMode: true },
      );
    } else if (generatePdfDocumentVision) {
      const pdfBase64 = pdfBuffer.toString('base64');
      const images: ImageContent[] = [
        { type: 'image', mediaType: 'application/pdf', data: pdfBase64 },
      ];

      const textForReference = extractedText?.trim()
        ? extractedText.substring(0, 8000)
        : 'No reliable embedded text was extracted. Use the attached PDF document for layout and field recognition.';
      let userPrompt = `Convert this clinical form PDF into a formio.js JSON schema. The PDF has ${numPages} page(s).\n\nExtracted text for reference:\n${textForReference}`;
      if (additionalInstructions) {
        userPrompt += `\n\nAdditional instructions: ${additionalInstructions}`;
      }

      this.logger.log(
        `Generating form from PDF with vision using provider: ${provider.name}`,
      );
      rawOutput = await generatePdfDocumentVision.bind(provider)(
        userPrompt,
        images,
        systemPrompt,
        { temperature: 0.2, maxTokens: 16384, jsonMode: true },
      );
    } else {
      let userPrompt = `Convert this clinical form into a formio.js JSON schema.\n\nExtracted text from the PDF (${numPages} pages):\n\n${extractedText}`;
      if (additionalInstructions) {
        userPrompt += `\n\nAdditional instructions: ${additionalInstructions}`;
      }

      this.logger.log(
        `Generating form from PDF text with provider: ${provider.name}`,
      );
      rawOutput = await provider.generate(userPrompt, systemPrompt, {
        temperature: 0.2,
        maxTokens: 16384,
        jsonMode: true,
      });
    }

    let schema = this.assembler.assemble(rawOutput);
    this.ensureValidSchema(schema, 'PDF schema validation errors');

    if (generateImageVision && renderedPageImages.length > 0) {
      schema = await this.repairSchemaWithVisualQa(
        provider,
        generateImageVision.bind(provider),
        schema,
        renderedPageImages[0],
        systemPrompt,
        extractedText,
      );
    }

    return { schema, provider: provider.name };
  }

  async generateFromImage(
    tenantId: string,
    imageBuffer: Buffer,
    mimeType: string,
    providerName?: string,
    additionalInstructions?: string,
  ): Promise<{ schema: Record<string, unknown>; provider: string }> {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Only PNG, JPEG, WebP, or GIF images are accepted');
    }

    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    const provider = this.providerRegistry.getProvider(
      providerSet,
      providerName,
    );

    if (!provider) {
      throw new BadRequestException(
        providerName
          ? `Provider "${providerName}" is not configured`
          : 'No AI providers are configured. Add a provider in Settings > AI Providers.',
      );
    }

    if (!provider.generateWithImages) {
      throw new BadRequestException(
        `Provider "${provider.name}" does not support image-based form generation.`,
      );
    }

    const systemPrompt = this.buildPdfSystemPrompt();
    const image = imageBuffer.toString('base64');
    let userPrompt =
      'Convert this clinical form image into a Form.io JSON schema. Use visual layout analysis to identify sections, field labels, repeated charts, reference tables, scoring guides, and signature blocks.';
    if (additionalInstructions) {
      userPrompt += `\n\nAdditional instructions: ${additionalInstructions}`;
    }

    this.logger.log(
      `Generating form from image using provider: ${provider.name}`,
    );
    const generateWithImages = provider.generateWithImages.bind(provider);
    const rawOutput = await generateWithImages(
      userPrompt,
      [{ type: 'image', mediaType: mimeType as ImageContent['mediaType'], data: image }],
      systemPrompt,
      { temperature: 0.2, maxTokens: 16384, jsonMode: true },
    );

    let schema = this.assembler.assemble(rawOutput);
    this.ensureValidSchema(schema, 'Image schema validation errors');

    schema = await this.repairSchemaWithVisualQa(
      provider,
      generateWithImages,
      schema,
      image,
      systemPrompt,
      '',
    );

    return { schema, provider: provider.name };
  }

  async listProviders(tenantId: string): Promise<string[]> {
    const providerSet =
      await this.providerRegistry.getProvidersForTenant(tenantId);
    return this.providerRegistry.listProviderNames(providerSet);
  }

  private buildSystemPrompt(category?: string): string {
    let prompt = getSystemPrompt();
    prompt += '\n\n' + getComponentCatalog();
    if (category) {
      prompt += `\n\nThe form should be categorized as: ${category}`;
    }
    return prompt;
  }

  private buildPdfSystemPrompt(): string {
    let prompt = getPdfToFormPrompt();
    prompt += '\n\n' + getComponentCatalog();
    return prompt;
  }

  private ensureValidSchema(
    schema: Record<string, unknown>,
    context: string,
  ): void {
    const validation = this.validator.validate(schema);

    if (!validation.valid) {
      const message = validation.errors.join(', ');
      this.logger.warn(`${context}: ${message}`);
      throw new BadRequestException(
        `AI generated an invalid Form.io schema: ${message}`,
      );
    }
  }

  private diffSchemas(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): string {
    const beforeComps = this.flattenComponents(
      (before.components as Record<string, unknown>[]) ?? [],
    );
    const afterComps = this.flattenComponents(
      (after.components as Record<string, unknown>[]) ?? [],
    );

    const beforeKeys = new Map(beforeComps.map((c) => [c.key as string, c]));
    const afterKeys = new Map(afterComps.map((c) => [c.key as string, c]));

    const changes: string[] = [];

    for (const [key, comp] of afterKeys) {
      if (!beforeKeys.has(key)) {
        changes.push(`• Added: "${comp.label || key}" (${comp.type})`);
      }
    }

    for (const [key, comp] of beforeKeys) {
      if (!afterKeys.has(key)) {
        changes.push(`• Removed: "${comp.label || key}" (${comp.type})`);
      }
    }

    for (const [key, afterComp] of afterKeys) {
      const beforeComp = beforeKeys.get(key);
      if (!beforeComp) continue;

      const modified: string[] = [];
      for (const prop of Object.keys(afterComp)) {
        if (prop === 'key') continue;
        const bVal = JSON.stringify(beforeComp[prop]);
        const aVal = JSON.stringify(afterComp[prop]);
        if (bVal !== aVal) {
          modified.push(prop);
        }
      }
      for (const prop of Object.keys(beforeComp)) {
        if (prop === 'key' || prop in afterComp) continue;
        modified.push(prop);
      }
      if (modified.length > 0) {
        changes.push(
          `• Modified "${afterComp.label || key}": ${modified.join(', ')}`,
        );
      }
    }

    if (changes.length === 0) {
      return 'No visible changes detected.';
    }

    return changes.join('\n');
  }

  private flattenComponents(
    components: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue;
      result.push(comp);
      if (Array.isArray(comp.components)) {
        result.push(
          ...this.flattenComponents(
            comp.components as Record<string, unknown>[],
          ),
        );
      }
      if (Array.isArray(comp.columns)) {
        for (const col of comp.columns as Record<string, unknown>[]) {
          if (col && Array.isArray(col.components)) {
            result.push(
              ...this.flattenComponents(
                col.components as Record<string, unknown>[],
              ),
            );
          }
        }
      }
    }
    return result;
  }

  private async renderPdfPagesToImages(
    pdfBuffer: Buffer,
    maxPages: number,
  ): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), 'openmedform-pdf-'));
    const pdfPath = join(dir, 'source.pdf');
    const outputPrefix = join(dir, 'page');

    try {
      await writeFile(pdfPath, pdfBuffer);
      await execFileAsync('pdftoppm', [
        '-png',
        '-r',
        '150',
        '-f',
        '1',
        '-l',
        String(maxPages),
        pdfPath,
        outputPrefix,
      ]);

      const files = (await readdir(dir))
        .filter((file) => file.startsWith('page-') && file.endsWith('.png'))
        .sort();

      const images: string[] = [];
      for (const file of files.slice(0, maxPages)) {
        const image = await readFile(join(dir, file));
        images.push(image.toString('base64'));
      }

      return images;
    } catch (error) {
      this.logger.warn(
        `PDF page image rendering unavailable; falling back to text extraction. ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async repairSchemaWithVisualQa(
    provider: { name: string },
    generateWithImages: (
      prompt: string,
      images: ImageContent[],
      systemPrompt: string,
      options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
    ) => Promise<string>,
    schema: Record<string, unknown>,
    sourcePageImage: string,
    systemPrompt: string,
    extractedText: string,
  ): Promise<Record<string, unknown>> {
    try {
      const previewImage = this.previewRenderer.renderToPngBase64(schema);
      const prompt = `You are performing visual QA for a PDF-to-Form.io conversion.

Image 1 is the source PDF page. Image 2 is a server-rendered preview of the generated OpenMedForm schema.

Compare the source and preview for structural mismatches:
- missing major sections
- wrong component choice, especially chart/log/table forms
- missing reference tables or escalation instructions
- patient header fields that should be excluded unless explicitly required
- duplicate submit buttons or nested submit buttons

Extracted PDF text for reference:
${extractedText.substring(0, 8000)}

Current schema:
${JSON.stringify(schema)}

Return the complete corrected Form.io schema as valid JSON only. If the schema is already appropriate, return it unchanged.`;

      this.logger.log(
        `Running visual QA repair pass using provider: ${provider.name}`,
      );
      const rawOutput = await generateWithImages(
        prompt,
        [
          { type: 'image', mediaType: 'image/png', data: sourcePageImage },
          { type: 'image', mediaType: 'image/png', data: previewImage },
        ],
        systemPrompt,
        { temperature: 0.1, maxTokens: 16384, jsonMode: true },
      );

      const repaired = this.assembler.assemble(rawOutput);
      this.ensureValidSchema(repaired, 'Visual QA schema validation errors');
      return repaired;
    } catch (error) {
      this.logger.warn(
        `Visual QA repair pass failed; keeping initial schema. ${error instanceof Error ? error.message : String(error)}`,
      );
      return schema;
    }
  }
}
