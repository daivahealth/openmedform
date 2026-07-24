import { Injectable, BadRequestException } from '@nestjs/common';
import { SchemaValidationService } from '../validation/schema-validation.service';

/**
 * Parses and normalizes the LLM's jsonforms-engine output into the four schema
 * artifacts plus conversion metadata, and enforces the non-negotiables:
 * - the Data Schema MUST compile under Ajv 2020-12 (rejected otherwise);
 * - uncertain elements surface as warnings (never silently dropped).
 *
 * Format-independent JSON extraction mirrors the Form.io SchemaAssembler concept
 * but produces the split schema shape instead of a Form.io component tree.
 */

export interface ConversionWarningData {
  type: string;
  message: string;
  binding?: string;
  sourcePage?: number;
  confidence?: number;
}

export interface AssembledJsonForms {
  dataSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
  printSchema: Record<string, unknown>;
  translations: Record<string, unknown>;
  conversionMetadata: Record<string, unknown>;
  /** Flattened field + form warnings for persistence into conversion_warning. */
  warnings: ConversionWarningData[];
}

const DEFAULT_PRINT_SCHEMA = {
  schemaVersion: '1.0',
  pageSize: 'A4',
  orientation: 'portrait',
  marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
  repeatHeader: true,
  printSafeControls: true,
};

@Injectable()
export class JsonFormsAssemblerService {
  constructor(private readonly validation: SchemaValidationService) {}

  assemble(rawOutput: string): AssembledJsonForms {
    const parsed = this.parseJson(rawOutput);

    const dataSchema = this.asObject(parsed.dataSchema);
    if (!dataSchema || Object.keys(dataSchema).length === 0) {
      throw new BadRequestException('AI output is missing a dataSchema');
    }

    const compileError = this.validation.checkCompiles(dataSchema);
    if (compileError) {
      throw new BadRequestException(
        `AI generated a Data Schema that does not compile: ${compileError}`,
      );
    }

    const uiSchema = this.normalizeUiSchema(parsed.uiSchema);
    this.ensureControlScopesResolve(uiSchema, dataSchema);
    const printSchema = this.asObject(parsed.printSchema) ?? { ...DEFAULT_PRINT_SCHEMA };
    const translations = this.normalizeTranslations(parsed.translations);
    const conversionMetadata = this.asObject(parsed.conversionMetadata) ?? {};

    return {
      dataSchema,
      uiSchema,
      printSchema,
      translations,
      conversionMetadata,
      warnings: this.extractWarnings(conversionMetadata),
    };
  }

  /** Collect field-level + form-level warnings into a flat, persistable list. */
  private extractWarnings(meta: Record<string, unknown>): ConversionWarningData[] {
    const out: ConversionWarningData[] = [];

    const fields = Array.isArray(meta.fields) ? meta.fields : [];
    for (const field of fields as Record<string, unknown>[]) {
      const binding = typeof field.binding === 'string' ? field.binding : undefined;
      const sourcePage = typeof field.sourcePage === 'number' ? field.sourcePage : undefined;
      const confidence = typeof field.confidence === 'number' ? field.confidence : undefined;
      const warnings = Array.isArray(field.warnings) ? field.warnings : [];
      for (const w of warnings as Record<string, unknown>[]) {
        out.push(this.toWarning(w, binding, sourcePage, confidence));
      }
    }

    const formWarnings = Array.isArray(meta.warnings) ? meta.warnings : [];
    for (const w of formWarnings as Record<string, unknown>[]) {
      out.push(this.toWarning(w));
    }
    return out;
  }

  private toWarning(
    w: Record<string, unknown>,
    fallbackBinding?: string,
    fallbackPage?: number,
    fallbackConfidence?: number,
  ): ConversionWarningData {
    return {
      type: typeof w.type === 'string' ? w.type : 'UNCLEAR_LABEL',
      message: typeof w.message === 'string' ? w.message : 'Unspecified conversion warning',
      binding: typeof w.binding === 'string' ? w.binding : fallbackBinding,
      sourcePage: typeof w.sourcePage === 'number' ? w.sourcePage : fallbackPage,
      confidence: typeof w.confidence === 'number' ? w.confidence : fallbackConfidence,
    };
  }

  private normalizeUiSchema(value: unknown): Record<string, unknown> {
    const ui = this.asObject(value);
    if (ui && ui.layout && typeof ui.layout === 'object') {
      return { schemaVersion: (ui.schemaVersion as string) ?? '1.0', layout: ui.layout };
    }
    // Some models return the root layout element directly; wrap it.
    if (ui && typeof ui.type === 'string') {
      return { schemaVersion: '1.0', layout: ui };
    }
    return { schemaVersion: '1.0', layout: { type: 'VerticalLayout', elements: [] } };
  }

  private normalizeTranslations(value: unknown): Record<string, unknown> {
    const t = this.asObject(value);
    if (t && t.entries && typeof t.entries === 'object') {
      return {
        defaultLanguage: (t.defaultLanguage as string) ?? 'en',
        languages: Array.isArray(t.languages) ? t.languages : ['en'],
        entries: t.entries,
      };
    }
    return { defaultLanguage: 'en', languages: ['en'], entries: {} };
  }

  /**
   * JSON Forms silently omits Controls whose schema pointer cannot be resolved.
   * Reject those AI outputs here instead of persisting a form with invisible
   * fields. Nested JSON Schema properties must include `/properties/` at every
   * object level.
   */
  private ensureControlScopesResolve(
    uiSchema: Record<string, unknown>,
    dataSchema: Record<string, unknown>,
  ): void {
    const visit = (element: unknown): void => {
      if (!element || typeof element !== 'object' || Array.isArray(element)) return;
      const ui = element as Record<string, unknown>;
      if (ui.type === 'Control' && typeof ui.scope === 'string') {
        if (!this.resolveLocalPointer(dataSchema, ui.scope)) {
          throw new BadRequestException(
            `AI output includes a Control scope that does not resolve in dataSchema: ${ui.scope}`,
          );
        }
      }
      if (Array.isArray(ui.elements)) ui.elements.forEach(visit);
    };

    visit(uiSchema.layout);
  }

  private resolveLocalPointer(
    root: Record<string, unknown>,
    pointer: string,
  ): Record<string, unknown> | undefined {
    if (!pointer.startsWith('#/')) return undefined;

    let node: unknown = root;
    for (const segment of pointer.slice(2).split('/')) {
      node = this.dereferenceLocal(root, node);
      if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
      node = (node as Record<string, unknown>)[
        segment.replace(/~1/g, '/').replace(/~0/g, '~')
      ];
    }
    node = this.dereferenceLocal(root, node);
    return node && typeof node === 'object' && !Array.isArray(node)
      ? (node as Record<string, unknown>)
      : undefined;
  }

  private dereferenceLocal(root: Record<string, unknown>, value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const ref = (value as Record<string, unknown>).$ref;
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return value;
    return this.resolveLocalPointer(root, ref) ?? value;
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  /** Extract the JSON object from raw LLM output (strips fences / prose). */
  private parseJson(raw: string): Record<string, unknown> {
    let cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/gi, '').replace(/```\s*$/gm, '').trim();
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      // Fall back to the outermost {...} span.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
        } catch {
          /* fall through */
        }
      }
      throw new BadRequestException('AI output was not valid JSON');
    }
  }
}
