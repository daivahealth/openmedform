import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface LoincCandidate {
  code: string;
  display: string;
  shortName?: string;
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

  constructor(private readonly prisma: PrismaService) {}

  async loincCount(): Promise<number> {
    return this.prisma.loincCode.count();
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
