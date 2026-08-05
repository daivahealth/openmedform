import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface LoincCandidate {
  code: string;
  display: string;
  shortName?: string;
}

export type TerminologySystem = 'loinc' | 'icd10' | 'snomed';

export const SYSTEM_URIS: Record<TerminologySystem, string> = {
  loinc: 'http://loinc.org',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  snomed: 'http://snomed.info/sct',
};

export interface SystemAvailability {
  system: TerminologySystem;
  available: boolean;
  /** Why not, when unavailable — shown verbatim in the dictionary. */
  reason?: string;
  /** Loaded local codes, for the local-table systems. */
  loaded?: number;
}

/**
 * Search over the local LOINC slice (#135).
 *
 * Token-based rather than full-text-indexed on purpose: the table is loaded
 * from the official LOINC release whose RELATEDNAMES2 column carries the
 * abbreviations clinicians actually write on forms ("SpO2", "HR", "RR"), so a
 * simple any-token match over component/names/synonyms has the recall that
 * matters here. Ranking happens in JS over the bounded candidate set — no raw
 * SQL, per repo rules.
 */
@Injectable()
export class TerminologyService {
  private readonly logger = new Logger(TerminologyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async loincCount(): Promise<number> {
    return this.prisma.loincCode.count();
  }

  /**
   * Which terminology systems this tenant can use, and why not (#136).
   *
   * LOINC and ICD-10 are free (LOINC with attribution, CMS ICD-10-CM public
   * domain) — available to every tenant, gated only on data being loaded.
   * SNOMED CT is member-country licensed, so it needs BOTH an operator-
   * configured FHIR terminology server (SNOMED_FHIR_URL) AND a per-tenant
   * entitlement (tenant.settings.snomedEnabled), set by the operator for
   * tenants whose country/affiliate license covers them. The gate lives here,
   * server-side — the UI only reflects it.
   */
  async systemsForTenant(tenantId: string): Promise<SystemAvailability[]> {
    const [loinc, icd10, tenant] = await Promise.all([
      this.prisma.loincCode.count(),
      this.prisma.icd10Code.count(),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    ]);

    const snomedUrl = this.config.get<string>('SNOMED_FHIR_URL');
    const snomedEnabled =
      ((tenant?.settings ?? {}) as { snomedEnabled?: unknown }).snomedEnabled === true;

    return [
      {
        system: 'loinc',
        available: loinc > 0,
        loaded: loinc,
        ...(loinc === 0 ? { reason: 'No LOINC table loaded (scripts/import-loinc.ts).' } : {}),
      },
      {
        system: 'icd10',
        available: icd10 > 0,
        loaded: icd10,
        ...(icd10 === 0 ? { reason: 'No ICD-10 table loaded (scripts/import-icd10.ts).' } : {}),
      },
      {
        system: 'snomed',
        available: !!snomedUrl && snomedEnabled,
        ...(!snomedUrl
          ? { reason: 'No SNOMED terminology server configured (SNOMED_FHIR_URL).' }
          : !snomedEnabled
            ? {
                reason:
                  'SNOMED CT is not enabled for this organization. It is member-country licensed — the operator enables it per tenant once the license applies.',
              }
            : {}),
      },
    ];
  }

  /** True when this tenant may search/suggest SNOMED. */
  async snomedAvailable(tenantId: string): Promise<boolean> {
    const systems = await this.systemsForTenant(tenantId);
    return systems.find((s) => s.system === 'snomed')?.available === true;
  }

  /** Top ICD-10 candidates — same token search shape as LOINC. */
  async searchIcd10(query: string, limit = 8): Promise<LoincCandidate[]> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    if (/^[A-Za-z]\d{2}(\.\d{1,4})?$/.test(query.trim())) {
      const exact = await this.prisma.icd10Code.findUnique({
        where: { code: query.trim().toUpperCase() },
      });
      if (exact) return [{ code: exact.code, display: exact.title }];
    }

    const rows = await this.prisma.icd10Code.findMany({
      where: {
        OR: tokens.flatMap((token) => [
          { title: { contains: token, mode: 'insensitive' as const } },
          { shortName: { contains: token, mode: 'insensitive' as const } },
        ]),
      },
      take: 200,
    });

    return rows
      .map((row) => {
        const title = row.title.toLowerCase();
        const short = (row.shortName ?? '').toLowerCase();
        let score = 0;
        for (const token of tokens) {
          if (title.includes(token)) score += 2;
          else if (short.includes(token)) score += 1;
        }
        // Prefer non-billable (category) codes for form-level bindings? No —
        // prefer shorter titles on ties, same tie-break as LOINC.
        return { row, score: score - row.title.length / 1000 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row }) => ({ code: row.code, display: row.title }));
  }

  /**
   * SNOMED CT search via a FHIR terminology server's ValueSet/$expand with a
   * text filter — the operation Snowstorm, Ontoserver and the public tx
   * servers all support. The caller enforces the tenant gate; this only talks
   * to the configured server. Failures degrade to an empty list: terminology
   * search is an aid, and a down tx server must not break the dictionary.
   */
  async searchSnomed(query: string, limit = 8): Promise<LoincCandidate[]> {
    const base = this.config.get<string>('SNOMED_FHIR_URL');
    if (!base || query.trim().length < 2) return [];

    const url =
      `${base.replace(/\/$/, '')}/ValueSet/$expand` +
      `?url=${encodeURIComponent('http://snomed.info/sct?fhir_vs')}` +
      `&filter=${encodeURIComponent(query.trim())}` +
      `&count=${limit}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/fhir+json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        this.logger.warn(`SNOMED $expand returned ${response.status}`);
        return [];
      }
      const body = (await response.json()) as {
        expansion?: { contains?: Array<{ code?: string; display?: string }> };
      };
      return (body.expansion?.contains ?? [])
        .filter((c) => typeof c.code === 'string')
        .slice(0, limit)
        .map((c) => ({ code: c.code as string, display: c.display ?? '' }));
    } catch (err) {
      this.logger.warn(`SNOMED $expand failed: ${String(err)}`);
      return [];
    }
  }

  /**
   * Top-N LOINC candidates for a free-text query (a field label, or what a
   * user typed into the dictionary search box).
   */
  async searchLoinc(query: string, limit = 8): Promise<LoincCandidate[]> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    // An exact code lookup ("8867-4") short-circuits the text search.
    if (/^\d{1,7}-\d$/.test(query.trim())) {
      const exact = await this.prisma.loincCode.findUnique({ where: { code: query.trim() } });
      if (exact) {
        return [
          {
            code: exact.code,
            display: exact.longCommonName,
            ...(exact.shortName ? { shortName: exact.shortName } : {}),
          },
        ];
      }
    }

    const rows = await this.prisma.loincCode.findMany({
      where: {
        OR: tokens.flatMap((token) => [
          { component: { contains: token, mode: 'insensitive' as const } },
          { longCommonName: { contains: token, mode: 'insensitive' as const } },
          { shortName: { contains: token, mode: 'insensitive' as const } },
          { relatedNames: { contains: token, mode: 'insensitive' as const } },
        ]),
      },
      take: 200,
    });

    return rows
      .map((row) => ({ row, score: scoreRow(tokens, row) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row }) => ({
        code: row.code,
        display: row.longCommonName,
        ...(row.shortName ? { shortName: row.shortName } : {}),
      }));
  }
}

/** Lowercased word tokens, stopwords and unit noise dropped. */
const STOPWORDS = new Set([
  'the', 'of', 'in', 'on', 'a', 'an', 'and', 'or', 'for', 'to', 'by', 'with',
  'please', 'specify', 'other', 'others', 'value', 'level', 'score',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%/]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .slice(0, 8);
}

/**
 * More matched tokens beats fewer; a match in component/shortName (the term
 * itself) beats one buried in the synonym list; shorter names win ties so
 * "Heart rate" outranks "Heart rate 10 hour mean".
 */
function scoreRow(
  tokens: string[],
  row: { component: string; longCommonName: string; shortName: string | null; relatedNames: string | null },
): number {
  const component = row.component.toLowerCase();
  const long = row.longCommonName.toLowerCase();
  const short = (row.shortName ?? '').toLowerCase();
  const related = (row.relatedNames ?? '').toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (component.includes(token) || short.includes(token)) score += 3;
    else if (long.includes(token)) score += 2;
    else if (related.includes(token)) score += 1;
  }
  return score - row.longCommonName.length / 1000;
}
