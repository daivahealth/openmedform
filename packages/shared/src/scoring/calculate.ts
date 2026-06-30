import type {
  ScoringRules,
  ScoringRuleSum,
  ScoringRuleWeightedSum,
  ScoringRuleThreshold,
  ScoringRuleCount,
  ScoringResult,
} from '../types/scoring';

export function calculateScores(
  rules: ScoringRules,
  data: Record<string, unknown>,
): ScoringResult {
  const scores: Record<string, number | string> = {};
  let riskLevel: string | undefined;

  const sortedKeys = topologicalSort(rules);

  for (const key of sortedKeys) {
    const rule = rules[key];
    switch (rule.type) {
      case 'sum':
        scores[key] = calculateSum(rule, data);
        break;
      case 'weighted-sum':
        scores[key] = calculateWeightedSum(rule, data);
        break;
      case 'count':
        scores[key] = calculateCount(rule, data);
        break;
      case 'threshold':
        scores[key] = calculateThreshold(rule, scores);
        if (!riskLevel) {
          riskLevel = scores[key] as string;
        }
        break;
    }
  }

  return { scores, riskLevel };
}

function resolveField(
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

function calculateSum(
  rule: ScoringRuleSum,
  data: Record<string, unknown>,
): number {
  let total = 0;
  for (const item of rule.items) {
    const value = resolveField(data, item.field);
    if (value === true || value === 1 || value === '1' || value === 'yes') {
      total += item.points;
    } else if (typeof value === 'number' && value > 0) {
      total += item.points;
    }
  }
  return total;
}

function calculateWeightedSum(
  rule: ScoringRuleWeightedSum,
  data: Record<string, unknown>,
): number {
  let total = 0;
  for (const item of rule.items) {
    const value = resolveField(data, item.field);
    if (typeof value === 'number') {
      total += value * item.weight;
    }
  }
  return total;
}

function calculateCount(
  rule: ScoringRuleCount,
  data: Record<string, unknown>,
): number {
  let count = 0;
  for (const field of rule.fields) {
    const value = resolveField(data, field);
    if (value === true || value === 1 || value === '1' || value === 'yes') {
      count++;
    }
  }
  return count;
}

function calculateThreshold(
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

function topologicalSort(rules: ScoringRules): string[] {
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
    if (visiting.has(key)) return;
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
