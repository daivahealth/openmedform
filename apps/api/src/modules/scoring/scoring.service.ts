import { Injectable, Logger } from '@nestjs/common';

export interface ScoringRuleSum {
  type: 'sum';
  items: Array<{ field: string; points: number }>;
}

export interface ScoringRuleWeightedSum {
  type: 'weighted-sum';
  items: Array<{ field: string; weight: number }>;
}

export interface ScoringRuleThreshold {
  type: 'threshold';
  scoreField: string;
  thresholds: Array<{ max: number; label: string; color?: string }>;
}

export interface ScoringRuleCount {
  type: 'count';
  fields: string[];
}

export type ScoringRule =
  | ScoringRuleSum
  | ScoringRuleWeightedSum
  | ScoringRuleThreshold
  | ScoringRuleCount;

export type ScoringRules = Record<string, ScoringRule>;

export interface ScoringResult {
  scores: Record<string, number | string>;
  riskLevel?: string;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  calculate(
    rules: ScoringRules,
    data: Record<string, unknown>,
  ): ScoringResult {
    const scores: Record<string, number | string> = {};
    let riskLevel: string | undefined;

    const sortedKeys = this.topologicalSort(rules);

    for (const key of sortedKeys) {
      const rule = rules[key];
      switch (rule.type) {
        case 'sum':
          scores[key] = this.calculateSum(rule, data);
          break;
        case 'weighted-sum':
          scores[key] = this.calculateWeightedSum(rule, data);
          break;
        case 'count':
          scores[key] = this.calculateCount(rule, data);
          break;
        case 'threshold':
          scores[key] = this.calculateThreshold(rule, scores);
          if (!riskLevel) {
            riskLevel = scores[key] as string;
          }
          break;
      }
    }

    return { scores, riskLevel };
  }

  extractRulesFromSchema(schema: Record<string, unknown>): ScoringRules {
    const rules: ScoringRules = {};
    const components = (schema.components ?? []) as Record<string, unknown>[];
    this.walkComponents(components, rules);
    return rules;
  }

  private walkComponents(
    components: Record<string, unknown>[],
    rules: ScoringRules,
  ): void {
    for (const comp of components) {
      if (comp.type === 'scoringMatrix' && comp.key) {
        const key = comp.key as string;
        const domains = (comp.domains ?? []) as Array<{
          items: Array<{ field: string; points: number }>;
        }>;
        const items: ScoringRuleSum['items'] = [];
        for (const domain of domains) {
          for (const item of domain.items ?? []) {
            if (item.field && typeof item.points === 'number') {
              items.push({ field: item.field, points: item.points });
            }
          }
        }
        if (items.length > 0) {
          rules[key] = { type: 'sum', items };
        }
      }

      if (comp.type === 'riskStratification' && comp.key) {
        const key = comp.key as string;
        const scoreField = comp.scoreField as string;
        const thresholds = (comp.thresholds ?? []) as ScoringRuleThreshold['thresholds'];
        if (scoreField && thresholds.length > 0) {
          rules[key] = { type: 'threshold', scoreField, thresholds };
        }
      }

      if (comp.scoring && comp.key) {
        const scoring = comp.scoring as Record<string, unknown>;
        const key = comp.key as string;
        if (scoring.type === 'sum' && Array.isArray(scoring.items)) {
          rules[key] = {
            type: 'sum',
            items: scoring.items as ScoringRuleSum['items'],
          };
        } else if (
          scoring.type === 'weighted-sum' &&
          Array.isArray(scoring.items)
        ) {
          rules[key] = {
            type: 'weighted-sum',
            items: scoring.items as ScoringRuleWeightedSum['items'],
          };
        } else if (scoring.type === 'threshold' && scoring.scoreField) {
          rules[key] = {
            type: 'threshold',
            scoreField: scoring.scoreField as string,
            thresholds:
              (scoring.thresholds as ScoringRuleThreshold['thresholds']) ?? [],
          };
        } else if (scoring.type === 'count' && Array.isArray(scoring.fields)) {
          rules[key] = {
            type: 'count',
            fields: scoring.fields as string[],
          };
        }
      }

      if (Array.isArray(comp.components)) {
        this.walkComponents(
          comp.components as Record<string, unknown>[],
          rules,
        );
      }
      if (Array.isArray(comp.columns)) {
        for (const col of comp.columns as Array<{
          components?: Record<string, unknown>[];
        }>) {
          if (Array.isArray(col.components)) {
            this.walkComponents(col.components, rules);
          }
        }
      }
      if (Array.isArray(comp.rows)) {
        for (const row of comp.rows as Array<
          Array<{ components?: Record<string, unknown>[] }>
        >) {
          for (const cell of row) {
            if (Array.isArray(cell.components)) {
              this.walkComponents(cell.components, rules);
            }
          }
        }
      }
    }
  }

  private calculateSum(
    rule: ScoringRuleSum,
    data: Record<string, unknown>,
  ): number {
    let total = 0;
    for (const item of rule.items) {
      const value = this.resolveField(data, item.field);
      if (value === true || value === 1 || value === '1' || value === 'yes') {
        total += item.points;
      } else if (typeof value === 'number' && value > 0) {
        total += item.points;
      }
    }
    return total;
  }

  private calculateWeightedSum(
    rule: ScoringRuleWeightedSum,
    data: Record<string, unknown>,
  ): number {
    let total = 0;
    for (const item of rule.items) {
      const value = this.resolveField(data, item.field);
      if (typeof value === 'number') {
        total += value * item.weight;
      }
    }
    return total;
  }

  private calculateCount(
    rule: ScoringRuleCount,
    data: Record<string, unknown>,
  ): number {
    let count = 0;
    for (const field of rule.fields) {
      const value = this.resolveField(data, field);
      if (value === true || value === 1 || value === '1' || value === 'yes') {
        count++;
      }
    }
    return count;
  }

  private calculateThreshold(
    rule: ScoringRuleThreshold,
    scores: Record<string, number | string>,
  ): string {
    const scoreValue = scores[rule.scoreField];
    if (typeof scoreValue !== 'number') {
      return 'Unknown';
    }
    const sorted = [...rule.thresholds].sort((a, b) => a.max - b.max);
    for (const threshold of sorted) {
      if (scoreValue <= threshold.max) {
        return threshold.label;
      }
    }
    return sorted.length > 0 ? sorted[sorted.length - 1].label : 'Unknown';
  }

  private resolveField(
    data: Record<string, unknown>,
    fieldPath: string,
  ): unknown {
    const parts = fieldPath.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private topologicalSort(rules: ScoringRules): string[] {
    const keys = Object.keys(rules);
    const deps = new Map<string, string[]>();
    for (const key of keys) {
      const rule = rules[key];
      if (rule.type === 'threshold' && keys.includes(rule.scoreField)) {
        deps.set(key, [rule.scoreField]);
      } else {
        deps.set(key, []);
      }
    }

    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (key: string) => {
      if (visited.has(key)) return;
      if (visiting.has(key)) {
        this.logger.warn(`Circular dependency in scoring rules at ${key}`);
        return;
      }
      visiting.add(key);
      for (const dep of deps.get(key) ?? []) {
        visit(dep);
      }
      visiting.delete(key);
      visited.add(key);
      sorted.push(key);
    };

    for (const key of keys) {
      visit(key);
    }
    return sorted;
  }
}
