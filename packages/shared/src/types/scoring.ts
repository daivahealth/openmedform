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
