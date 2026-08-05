import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ProviderRegistry } from '../ai-builder/providers/provider-registry';
import { AiUsageService } from '../ai-builder/ai-usage.service';
import { TerminologyService, type LoincCandidate } from './terminology.service';

/** A field (or answer option) the suggestion pass considers. */
interface SuggestTarget {
  scope: string;
  optionCode?: string;
  label: string;
  candidates: LoincCandidate[];
}

/** Suggestions below this confidence are not written — reviewer-fatigue control. */
const CONFIDENCE_FLOOR = 0.5;
/** Candidates offered to the model per field. */
const CANDIDATES_PER_FIELD = 6;
/** Fields per suggestion run — one batched LLM call, bounded. */
const MAX_TARGETS = 60;

const LOINC_SYSTEM = 'http://loinc.org';

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
    const uiSchema = structuredClone(latest.uiSchema) as Record<string, unknown>;
    const targets = await this.collectTargets(uiSchema);
    if (targets.length === 0) {
      return { suggested: 0, considered: 0, skipped: 'every field is already mapped or had no candidates' };
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
        system: LOINC_SYSTEM,
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

  /** Every uncoded field/option with at least one LOINC candidate. */
  private async collectTargets(uiSchema: Record<string, unknown>): Promise<SuggestTarget[]> {
    const targets: SuggestTarget[] = [];

    const visit = async (node: unknown): Promise<void> => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        if (Array.isArray(node)) for (const child of node) await visit(child);
        return;
      }
      const el = node as Record<string, unknown>;
      const omf = ((el.options as Record<string, unknown>)?.omf ?? {}) as Record<string, unknown>;

      if (el.type === 'Control' && typeof el.scope === 'string' && targets.length < MAX_TARGETS) {
        const label = typeof el.label === 'string' ? el.label : lastSegment(el.scope);
        const hasCoding = Array.isArray(omf.coding) && omf.coding.length > 0;
        if (!hasCoding && label) {
          const candidates = await this.terminology.searchLoinc(label, CANDIDATES_PER_FIELD);
          if (candidates.length > 0) targets.push({ scope: el.scope, label, candidates });
        }
      }

      if (Array.isArray(el.elements)) for (const child of el.elements) await visit(child);
    };

    await visit((uiSchema.layout ?? uiSchema) as Record<string, unknown>);
    return targets;
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
      'You map clinical form fields to LOINC codes. For EVERY field you are shown, choose the single best ' +
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
    omf.coding = [coding];
  }
}

function targetKey(t: { scope: string; optionCode?: string }): string {
  return t.optionCode ? `${t.scope}::${t.optionCode}` : t.scope;
}

function lastSegment(scope: string): string {
  return scope.split('/').pop() ?? '';
}
