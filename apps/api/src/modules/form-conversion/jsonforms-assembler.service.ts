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
  /**
   * Authoritative scoring rules derived from the UI schema's `options.omf.points`
   * (+ any scoreSummary `options.omf.bands`). Stored on the form version and
   * recomputed server-side on submission completion — the client total is a
   * display aid only. Empty when the form has no scored controls.
   */
  scoringRules: Record<string, unknown>;
  /** Flattened field + form warnings for persistence into conversion_warning. */
  warnings: ConversionWarningData[];
  /**
   * The model's own plain-language account of what it changed (refine flow
   * asks for this; conversion does not). Optional — an older cached prompt or
   * a terse model yields none, and callers fall back to a factual line.
   */
  changeSummary?: string;
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

    // Models occasionally emit a local `$ref` to a `$defs` entry they never
    // defined (e.g. "#/$defs/age"), which makes Ajv refuse to compile the WHOLE
    // schema. Rather than hard-fail an otherwise good multi-section form, strip
    // the dangling refs (the field then validates permissively) and surface a
    // warning so the reviewer can tighten it.
    const repairedRefs = this.repairDanglingRefs(dataSchema);
    const repairedRequired = this.repairMisplacedRequired(dataSchema);

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

    const warnings = this.extractWarnings(conversionMetadata);
    for (const path of repairedRequired) {
      warnings.push({
        type: 'UNCERTAIN_FIELD_BINDING',
        message:
          `Moved a "required" list out of "properties" at ${path} (the AI nested it one level ` +
          'too deep, which would have made the whole schema invalid). Check that the right ' +
          'fields are marked mandatory.',
      });
    }
    for (const ref of repairedRefs) {
      warnings.push({
        type: 'UNCERTAIN_FIELD_BINDING',
        message: `Removed an unresolved schema reference "${ref}" (the AI referenced a $def it did not define). The affected field now validates permissively — review its type/constraints.`,
      });
    }
    warnings.push(...this.validateOmfControlConfig(uiSchema, dataSchema));

    // Free text destined for a chat bubble — bounded so a rambling model
    // cannot turn the transcript into a wall.
    const changeSummary =
      typeof parsed.changeSummary === 'string' && parsed.changeSummary.trim()
        ? parsed.changeSummary.trim().slice(0, 2000)
        : undefined;

    return {
      dataSchema,
      uiSchema,
      printSchema,
      translations,
      conversionMetadata,
      scoringRules: this.deriveScoringRules(uiSchema),
      warnings,
      ...(changeSummary ? { changeSummary } : {}),
    };
  }

  /**
   * Move a `required` list that the model nested INSIDE `properties` back out to
   * where it belongs, as a sibling of it.
   *
   * Observed on a real conversion:
   *
   *   { type: 'object',
   *     properties: { site: {...}, side: {...}, required: ['site'] } }   // wrong
   *
   * Every value inside `properties` must be a schema, so an array there makes
   * Ajv refuse to compile the WHOLE document — one misplaced keyword loses an
   * otherwise good multi-section form. The author's intent is unambiguous, so
   * the fix is to relocate it rather than to reject.
   *
   * A field genuinely NAMED "required" is left alone: that would be a schema
   * (an object or boolean), not an array of strings. The array test is what
   * separates the two, so this cannot silently delete a real field.
   *
   * Returns the JSON-pointer-ish paths repaired, for the reviewer's warnings.
   */
  private repairMisplacedRequired(root: Record<string, unknown>): string[] {
    const repaired: string[] = [];

    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((entry, i) => walk(entry, `${path}/${i}`));
        return;
      }
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;

      const properties = obj.properties;
      if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
        const props = properties as Record<string, unknown>;
        const misplaced = props.required;
        const isNameList =
          Array.isArray(misplaced) && misplaced.every((entry) => typeof entry === 'string');

        if (isNameList) {
          delete props.required;
          const names = misplaced as string[];
          // Merge rather than overwrite: a correct sibling `required` may also
          // exist, and dropping either list would silently relax validation.
          const existing = Array.isArray(obj.required) ? (obj.required as unknown[]) : [];
          const merged = [...new Set([...existing.filter((e) => typeof e === 'string'), ...names])];
          // Only keep names that are actually declared, so the relocation cannot
          // introduce a required property that does not exist.
          obj.required = merged.filter((name) => name in props);
          if ((obj.required as string[]).length === 0) delete obj.required;
          repaired.push(path || '#');
        }
      }

      for (const [key, value] of Object.entries(obj)) walk(value, `${path}/${key}`);
    };

    walk(root, '');
    return repaired;
  }

  /**
   * Strip local `$ref`s whose target does not exist in the schema. Returns the
   * list of removed (unique) ref pointers. Deleting only the `$ref` keyword keeps
   * any sibling keywords; a node left empty (`{}`) accepts any value, which is a
   * safe permissive fallback for a draft under review.
   */
  private repairDanglingRefs(root: Record<string, unknown>): string[] {
    const removed = new Set<string>();

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const ref = obj.$ref;
      if (typeof ref === 'string' && ref.startsWith('#/') && !this.resolveLocalPointer(root, ref)) {
        delete obj.$ref;
        removed.add(ref);
      }
      for (const value of Object.values(obj)) walk(value);
    };

    walk(root);
    return [...removed];
  }

  /**
   * Derive the authoritative scoring rules from the UI schema, reading the same
   * `options.omf.points` / `options.omf.optionPoints` the renderer scores from
   * (single source of truth, so the live client total and the stored score
   * can't diverge). Produces:
   *   - `totalScore` — a `sum` over every scored Control's data path;
   *   - `riskLevel` — a `threshold` mapping the total to a band, when a
   *     scoreSummary element declares `options.omf.bands`.
   * Mirrors form-core's `collectScoreItems`/`stratify`; kept in the CJS backend
   * because form-core ships ESM-only (same precedent as SchemaValidationService).
   */
  deriveScoringRules(uiSchema: Record<string, unknown>): Record<string, unknown> {
    const root = (uiSchema.layout as Record<string, unknown>) ?? uiSchema;
    const items: Array<{
      field: string;
      points?: number;
      optionPoints?: Record<string, number>;
    }> = [];
    let bands: Array<Record<string, unknown>> | undefined;

    const visit = (el: unknown): void => {
      if (!el || typeof el !== 'object' || Array.isArray(el)) return;
      const node = el as Record<string, unknown>;
      const omf = ((node.options as Record<string, unknown>)?.omf ?? {}) as Record<string, unknown>;
      const scope = node.scope;
      if (typeof scope === 'string') {
        // A scored single-select prices each option; a tick-box row has one
        // number. Never both — optionPoints wins if a generator emits both.
        const optionPoints = this.readOptionPoints(omf.optionPoints);
        if (optionPoints) {
          items.push({ field: this.scopeToDataPath(scope), optionPoints });
        } else if (typeof omf.points === 'number') {
          items.push({ field: this.scopeToDataPath(scope), points: omf.points });
        }
      }
      if (omf.control === 'scoreSummary' && Array.isArray(omf.bands)) {
        bands = omf.bands as Array<Record<string, unknown>>;
      }
      if (Array.isArray(node.elements)) node.elements.forEach(visit);
    };
    visit(root);

    if (items.length === 0) return {};

    const rules: Record<string, unknown> = {
      totalScore: { type: 'sum', items },
    };
    if (bands?.length) {
      // The scoring engine's threshold picks the first band (ascending by `max`)
      // whose `max >= total`; the open-ended top band gets a large ceiling.
      const thresholds = bands
        .map((b) => ({
          max: typeof b.maxScore === 'number' ? b.maxScore : 999999,
          label: typeof b.label === 'string' ? b.label : 'Unknown',
          color: typeof b.color === 'string' ? b.color : undefined,
        }))
        .sort((a, b) => a.max - b.max);
      rules.riskLevel = { type: 'threshold', scoreField: 'totalScore', thresholds };
    }
    return rules;
  }

  /**
   * A code→points map, keeping only numeric entries. A generator that emits
   * `{ YES: "25" }` or an array gets no scoring rather than a NaN total.
   */
  private readOptionPoints(value: unknown): Record<string, number> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out: Record<string, number> = {};
    for (const [code, points] of Object.entries(value as Record<string, unknown>)) {
      if (typeof points === 'number' && Number.isFinite(points)) out[code] = points;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  /**
   * JSON Forms scope → dotted data path: keep every other segment (the property
   * names), dropping the `properties`/`items` keyword segments.
   * `#/properties/age/properties/age75plus` → `age.age75plus`.
   */
  private scopeToDataPath(scope: string): string {
    const segments = scope
      .replace(/^#/, '')
      .split('/')
      .filter((s) => s.length > 0);
    const out: string[] = [];
    for (let i = 1; i < segments.length; i += 2) {
      out.push(segments[i].replace(/~1/g, '/').replace(/~0/g, '~'));
    }
    return out.join('.');
  }

  /**
   * Flag omf controls that arrived without the config they draw from.
   *
   * A config-driven control (scoringMatrix, checklistMatrix, vitalSignsChart,
   * colorCodedGrid, clinicalReferenceTable, recordTable) takes its rows/columns
   * from `options.omf`, not from the data schema — so when the AI omits that
   * config, the control renders an EMPTY shell and the paper's content is
   * silently lost. That is exactly how a transfer form's infection-control
   * checkboxes vanished (an enum array labelled `checklistMatrix` with no
   * rows/columns). Enum-driven controls (radio, checkboxGroup) have the mirror
   * failure: a schema with no options renders no inputs.
   *
   * Warnings, not rejections: a half-configured control loses one section,
   * while a hard failure loses the whole form. The reviewer sees each finding
   * against its binding and can regenerate or fix just that control.
   */
  private validateOmfControlConfig(
    uiSchema: Record<string, unknown>,
    dataSchema: Record<string, unknown>,
  ): ConversionWarningData[] {
    const warnings: ConversionWarningData[] = [];
    const filled = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
    const hasOptions = (schema?: Record<string, unknown>): boolean =>
      !!schema && (filled(schema.enum) || filled(schema.oneOf));
    const isOptionArray = (schema?: Record<string, unknown>): boolean => {
      if (!schema || schema.type !== 'array') return false;
      const items = schema.items;
      return (
        !!items &&
        typeof items === 'object' &&
        !Array.isArray(items) &&
        hasOptions(items as Record<string, unknown>)
      );
    };

    const visit = (el: unknown): void => {
      if (!el || typeof el !== 'object' || Array.isArray(el)) return;
      const node = el as Record<string, unknown>;
      const omf = ((node.options as Record<string, unknown>)?.omf ?? {}) as Record<
        string,
        unknown
      >;
      const control = typeof omf.control === 'string' ? omf.control : undefined;
      const scope = typeof node.scope === 'string' ? node.scope : undefined;
      const field = scope ? this.resolveLocalPointer(dataSchema, scope) : undefined;
      const warn = (message: string): void => {
        warnings.push({ type: 'MISSING_CONTROL_CONFIG', message, binding: scope });
      };

      switch (control) {
        case 'scoringMatrix': {
          const domains = omf.domains;
          if (!filled(domains)) {
            warn(
              'scoringMatrix has no omf.domains — the scoring grid renders empty and every risk-factor row is lost. Populate omf.domains[].items or regenerate this section.',
            );
          } else {
            const empty = (domains as Record<string, unknown>[]).filter(
              (d) => !filled(d?.items),
            ).length;
            if (empty > 0) {
              warn(
                `scoringMatrix has ${empty} domain(s) with no items — those domains render as empty boxes and their risk-factor rows are lost.`,
              );
            }
          }
          break;
        }
        case 'checklistMatrix': {
          if (!filled(omf.rows) || !filled(omf.columns)) {
            if (isOptionArray(field)) {
              warn(
                'checklistMatrix without omf.rows/omf.columns on an option array — the renderers fall back to a checkboxGroup, which is what this field should be authored as (omf.control "checkboxGroup").',
              );
            } else {
              warn(
                'checklistMatrix has no omf.rows/omf.columns — the grid renders with no checkboxes. Supply both, or use checkboxGroup for a flat multi-select.',
              );
            }
          }
          break;
        }
        case 'vitalSignsChart':
          if (!filled(omf.columns)) {
            warn('vitalSignsChart has no omf.columns — the chart renders with no parameters.');
          }
          break;
        case 'colorCodedGrid':
          if (!filled(omf.rows)) {
            warn('colorCodedGrid has no omf.rows — the reference grid renders empty.');
          }
          break;
        case 'clinicalReferenceTable':
          if (!filled(omf.headers) || !filled(omf.rows)) {
            warn(
              'clinicalReferenceTable is missing omf.headers or omf.rows — the reference table renders empty.',
            );
          }
          break;
        case 'recordTable': {
          const rt = omf.recordTable as Record<string, unknown> | undefined;
          if (!rt || typeof rt !== 'object' || !filled(rt.columns)) {
            warn(
              'recordTable has no omf.recordTable.columns — the log renders without summary columns. Define one { label, path } per source column.',
            );
          }
          break;
        }
        case 'checkboxGroup':
          if (!isOptionArray(field)) {
            warn(
              'checkboxGroup must bind an array whose items carry enum/oneOf options — with none, it renders no checkboxes.',
            );
          }
          break;
        case 'radio':
          if (!hasOptions(field)) {
            warn(
              'radio bound to a schema with no enum/oneOf — it renders no options. Add a oneOf of coded options with titles.',
            );
          }
          break;
      }

      if (Array.isArray(node.elements)) node.elements.forEach(visit);
    };

    visit((uiSchema.layout as Record<string, unknown>) ?? uiSchema);
    return warnings;
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
