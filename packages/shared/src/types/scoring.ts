export interface ScoringRuleSum {
  type: 'sum';
  items: Array<{ field: string; points: number }>;
}

export interface ScoringRuleThreshold {
  type: 'threshold';
  scoreField: string;
  thresholds: Array<{ max: number; label: string }>;
}

export type ScoringRule = ScoringRuleSum | ScoringRuleThreshold;

export interface ScoringRules {
  [key: string]: ScoringRule;
}

export interface ScoringResult {
  scores: Record<string, number>;
  riskLevel: string | null;
}
