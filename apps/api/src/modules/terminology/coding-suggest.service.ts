import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import { AiUsageService } from '../ai-builder/ai-usage.service';
import {
  SYSTEM_URIS,
  TerminologyService,
  type LoincCandidate,
  type TerminologySystem,
} from './terminology.service';

/** A field (or answer option) the suggestion pass considers. */
interface SuggestTarget {
  scope: string;
  optionCode?: string;
  label: string;
  /** Which terminology this target's candidates came from. */
  system: TerminologySystem;
  candidates: LoincCandidate[];
}

/** Suggestions below this confidence are not written — reviewer-fatigue control. */
const CONFIDENCE_FLOOR = 0.5;
/** Candidates offered to the model per field. */
const CANDIDATES_PER_FIELD = 6;
/** Fields per suggestion run — one batched LLM call, bounded. */
const MAX_TARGETS = 60;



/**
 * The retrieve-then-select suggestion pass (#135).
 *
 * The hallucination control this whole feature hinges on: the model NEVER
 * produces a code. The local LOINC table produces candidates; the model's only
 * powers are choosing one of them per field or declining. A fabricated code is
 * structurally impossible — anything it returns that is not in the offered
 * candidate list is dropped.
 *
 * One batched call per form, not one per field: labels plus candidates for a
 * whole form fit comfortably in one prompt, and #128's economics apply.
 * Suggestions land as `source: 'ai', verified: false` for the dictionary's
 * Approve flow, and NEVER overwrite an existing binding — human work is not a
 * suggestion target.
 */
@Injectable()
export class CodingSuggestService {
  private readonly logger = new Logger(CodingSuggestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly aiUsage: AiUsageService,
    private readonly terminology: TerminologyService,
  ) {}

  async suggestForForm(
    tenantId: string,
    formId: string,
    options?: { providerName?: string; ipAddress?: string | null; userId?: string },
  ): Promise<{ suggested: number; considered: number; skipped: string }> {
    if ((await this.terminology.loincCount()) === 0) {
      throw new BadRequestException(
        'No LOINC codes are loaded on this server. Load the LOINC table first ' +
          '(see docs/features/CLINICAL-TERMINOLOGY.md) — suggestions only ever ' +
          'choose among real codes from that table.',
      );
    }

    const form = await this.prisma.form.findFirst({
      where: { id: formId, tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!form) throw new NotFoundException(`Form ${formId} not found`);
    const latest = form.versions[0];
    if (!latest?.uiSchema) throw new BadRequestException('Form has no definition to code');

    const providerSet = await this.providerRegistry.getProvidersForTenant(tenantId);
    const baseProvider = this.providerRegistry.getProvider(providerSet, options?.providerName);
    if (!baseProvider) throw new BadRequestException('No AI providers are configured');
    const provider = this.aiUsage.meter(baseProvider, {
      tenantId,
      userId: options?.userId,
      operation: 'coding.suggest',
      formId,
    });

    // Uncoded fields only — human and prior-AI work is never overwritten.
    // Fields get LOINC candidates; enum ANSWER OPTIONS are qualitative
    // concepts, so they get SNOMED — but only when the tenant's licensing
    // gate is open (#136).
    const snomedOk = await this.terminology.snomedAvailable(tenantId);
    const uiSchema = structuredClone(latest.uiSchema) as Record<string, unknown>;
    const { targets, uncodedFields } = await this.collectTargets(
      uiSchema,
      latest.dataSchema,
      snomedOk,
    );
    if (targets.length === 0) {
      // Two opposite situations used to share one message. "Everything is
      // mapped" means the user is done; "nothing matched" means a data gap
      // they can act on — say which one it is.
      return {
        suggested: 0,
        considered: 0,
        skipped:
          uncodedFields === 0
            ? 'every field already has a code — nothing left to suggest'
            : `no candidates matched any of the ${uncodedFields} uncoded field${
                uncodedFields === 1 ? '' : 's'
              } — the loaded terminology tables may be too small (see docs/features/CLINICAL-TERMINOLOGY.md)`,
      };
    }

    const selections = await this.selectAmongCandidates(provider, targets);

    let suggested = 0;
    for (const target of targets) {
      const choice = selections.get(targetKey(target));
      if (!choice || choice.confidence < CONFIDENCE_FLOOR) continue;
      // Structural guarantee: the choice must be one of the offered candidates.
      const candidate = target.candidates.find((c) => c.code === choice.code);
      if (!candidate) continue;

      this.writeCoding(uiSchema, target, {
        system: SYSTEM_URIS[target.system],
        code: candidate.code,
        display: candidate.display,
        source: 'ai',
        confidence: choice.confidence,
        verified: false,
      });
      suggested += 1;
    }

    if (suggested > 0) {
      // Suggestions are metadata on the DRAFT; a published latest version means
      // there is nothing safely writable, so require a draft.
      if (latest.publishedAt) {
        throw new BadRequestException(
          'The latest version is published. Open a draft first (any refine or coding edit forks one), then suggest.',
        );
      }
      await this.prisma.formVersion.update({
        where: { id: latest.id },
        data: { uiSchema: uiSchema as never },
      });
      await this.audit.record({
        tenantId,
        userId: options?.userId,
        ipAddress: options?.ipAddress,
        action: 'form.coding.suggest',
        resourceType: 'form_version',
        resourceId: latest.id,
        details: { formId, suggested, considered: targets.length },
      });
    }

    return { suggested, considered: targets.length, skipped: '' };
  }

  /**
   * Every uncoded field/option with at least one candidate, plus how many
   * uncoded fields were seen at all — the difference between "all done" and
   * "nothing matched" in the caller's skip message.
   */
  private async collectTargets(
    uiSchema: Record<string, unknown>,
    dataSchema: unknown,
    snomedOk: boolean,
  ): Promise<{ targets: SuggestTarget[]; uncodedFields: number }> {
    const targets: SuggestTarget[] = [];
    let uncodedFields = 0;

    const visit = async (node: unknown): Promise<void> => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        if (Array.isArray(node)) for (const child of node) await visit(child);
        return;
      }
      const el = node as Record<string, unknown>;
      const omf = ((el.options as Record<string, unknown>)?.omf ?? {}) as Record<string, unknown>;

      if (el.type === 'Control' && typeof el.scope === 'string' && targets.length < MAX_TARGETS) {
        // Same resolution order as form-core's collectCodedItems (the
        // dictionary panel): explicit UI label, then the dataSchema title,
        // then the property key. AI-generated forms carry their human titles
        // only in the dataSchema, so searching the raw key ("heartRate")
        // found nothing and the whole pass silently skipped (#156).
        const label =
          (typeof el.label === 'string' && el.label) ||
          schemaTitleAt(dataSchema, el.scope) ||
          lastSegment(el.scope);
        const hasCoding = Array.isArray(omf.coding) && omf.coding.length > 0;
        if (!hasCoding && label) {
          uncodedFields += 1;
          const candidates = await this.terminology.searchLoinc(label, CANDIDATES_PER_FIELD);
          if (candidates.length > 0)
            targets.push({ scope: el.scope, label, system: 'loinc', candidates });
        }

        if (snomedOk) {
          const optionCoding = (omf.optionCoding ?? {}) as Record<string, unknown>;
          for (const option of enumOptionsOf(dataSchema, el.scope, omf)) {
            if (targets.length >= MAX_TARGETS) break;
            const bound = Array.isArray(optionCoding[option.code]) &&
              (optionCoding[option.code] as unknown[]).length > 0;
            if (bound) continue;
            const candidates = await this.terminology.searchSnomed(
              option.label,
              CANDIDATES_PER_FIELD,
            );
            if (candidates.length > 0) {
              targets.push({
                scope: el.scope,
                optionCode: option.code,
                label: `${label}: ${option.label}`,
                system: 'snomed',
                candidates,
              });
            }
          }
        }
      }

      if (Array.isArray(el.elements)) for (const child of el.elements) await visit(child);
    };

    await visit((uiSchema.layout ?? uiSchema) as Record<string, unknown>);
    return { targets, uncodedFields };
  }

  /**
   * One batched call: for each field, its label and its candidates; the model
   * answers with a code FROM THE LIST or null, plus confidence.
   */
  private async selectAmongCandidates(
    provider: { generate(p: string, s: string, o?: object): Promise<string> },
    targets: SuggestTarget[],
  ): Promise<Map<string, { code: string; confidence: number }>> {
    const systemPrompt =
      'You map clinical form fields and answer options to standard terminology codes. For EVERY item you are shown, choose the single best ' +
      'candidate FROM ITS OWN CANDIDATE LIST, or null if none of the candidates genuinely means what the ' +
      'field asks. You cannot propose codes that are not listed. Be conservative: a wrong code on clinical ' +
      'data is worse than none — prefer null over a stretch. Respond with JSON only: ' +
      '{"selections":[{"key":"<key>","code":"<code or null>","confidence":<0..1>}]}';

    // "json" must appear in the user message too — OpenAI's json_object mode
    // rejects the request otherwise (the same quirk as issue #99).
    const userPrompt =
      'Choose codes for these fields and respond with the JSON shape from the instructions.\n' +
      'Fields and their candidates:\n' +
      JSON.stringify(
        targets.map((t) => ({
          key: targetKey(t),
          fieldLabel: t.label,
          candidates: t.candidates.map((c) => ({ code: c.code, name: c.display })),
        })),
        null,
        1,
      );

    let raw: string;
    try {
      raw = await provider.generate(userPrompt, systemPrompt, {
        temperature: 0,
        maxTokens: 8192,
        jsonMode: true,
      });
    } catch (err) {
      // Provider errors carry SDK internals; log them, surface something safe.
      this.logger.error(`Coding suggestion call failed: ${String(err)}`);
      throw new BadRequestException(
        'The AI provider rejected the suggestion request. Nothing was changed — try again.',
      );
    }

    const out = new Map<string, { code: string; confidence: number }>();
    try {
      const parsed = JSON.parse(raw.replace(/```(?:json)?/gi, '').trim()) as {
        selections?: Array<{ key?: unknown; code?: unknown; confidence?: unknown }>;
      };
      for (const s of parsed.selections ?? []) {
        if (typeof s.key === 'string' && typeof s.code === 'string' && s.code) {
          out.set(s.key, {
            code: s.code,
            confidence: typeof s.confidence === 'number' ? s.confidence : 0,
          });
        }
      }
    } catch (err) {
      // A malformed selection response yields zero suggestions, never an error
      // surfaced to the user — the pass is best-effort by design.
      this.logger.warn(`Could not parse coding selections: ${String(err)}`);
    }
    return out;
  }

  private writeCoding(
    uiSchema: Record<string, unknown>,
    target: SuggestTarget,
    coding: Record<string, unknown>,
  ): void {
    const find = (node: unknown): Record<string, unknown> | null => {
      if (!node || typeof node !== 'object') return null;
      const el = node as Record<string, unknown>;
      if (el.type === 'Control' && el.scope === target.scope) return el;
      if (Array.isArray(el.elements)) {
        for (const child of el.elements) {
          const found = find(child);
          if (found) return found;
        }
      }
      return null;
    };
    const control = find((uiSchema.layout ?? uiSchema) as Record<string, unknown>);
    if (!control) return;
    const options = (control.options ??= {}) as Record<string, unknown>;
    const omf = (options.omf ??= {}) as Record<string, unknown>;
    if (target.optionCode !== undefined) {
      const optionCoding = (omf.optionCoding ??= {}) as Record<string, unknown>;
      optionCoding[target.optionCode] = [coding];
    } else {
      omf.coding = [coding];
    }
  }
}

function targetKey(t: { scope: string; optionCode?: string }): string {
  return t.optionCode ? `${t.scope}::${t.optionCode}` : t.scope;
}

function lastSegment(scope: string): string {
  return scope.split('/').pop() ?? '';
}

interface SchemaNode {
  title?: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  enum?: unknown[];
  oneOf?: Array<{ const?: unknown; title?: string }>;
}

/** The dataSchema node a control scope points at, or undefined. */
function schemaNodeAt(dataSchema: unknown, scope: string): SchemaNode | undefined {
  let node = dataSchema as SchemaNode | undefined;
  if (!node || !scope.startsWith('#/')) return undefined;
  for (const segment of scope.slice(2).split('/')) {
    if (!node) return undefined;
    if (segment === 'properties') continue;
    if (segment === 'items') {
      node = node.items as SchemaNode;
      continue;
    }
    node = (node.properties as Record<string, SchemaNode> | undefined)?.[segment];
  }
  return node;
}

/** The dataSchema title of a control's field, or '' when it has none. */
function schemaTitleAt(dataSchema: unknown, scope: string): string {
  const title = schemaNodeAt(dataSchema, scope)?.title;
  return typeof title === 'string' ? title : '';
}

/** The enum options of a control, label-resolved: oneOf titles > optionLabels > code. */
function enumOptionsOf(
  dataSchema: unknown,
  scope: string,
  omf: Record<string, unknown>,
): Array<{ code: string; label: string }> {
  const node = schemaNodeAt(dataSchema, scope);
  if (!node) return [];

  const labels = (omf.optionLabels ?? {}) as Record<string, string>;
  if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
    return node.oneOf
      .filter((o) => typeof o?.const === 'string' || typeof o?.const === 'number')
      .map((o) => ({ code: String(o.const), label: o.title || labels[String(o.const)] || String(o.const) }));
  }
  if (Array.isArray(node.enum)) {
    return node.enum
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => ({ code: String(v), label: labels[String(v)] || String(v) }));
  }
  return [];
}
