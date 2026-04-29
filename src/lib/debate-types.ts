import type { ModelAnalysis, CouncilRole } from '@/components/features/ai-council-panel';

export type { ModelAnalysis, CouncilRole };

export interface DebateEntry {
  round: number;
  modelId: string;
  modelName: string;
  role: CouncilRole;
  analysis: ModelAnalysis;
}

export interface StopRuleEvaluation {
  unanimous: boolean;
  converged: boolean;
  chairJudgment: boolean;
  chairJudgmentRationale: string;
}

export interface AnalystDirectives {
  technical: string | null;
  fundamental: string | null;
  sentiment: string | null;
  contrarian: string | null;
  risk: string | null;
}

export interface ChairResponse {
  shouldStop: boolean;
  stopRuleEvaluation: StopRuleEvaluation;
  verdict: ModelAnalysis | null;
  analystDirectives: AnalystDirectives | null;
}

export interface AnalystDebateState {
  loading: boolean;
  rounds: Array<ModelAnalysis | null>;
  error: string | null;
}

export interface ChairRoundState {
  loading: boolean;
  stopRuleEvaluation: StopRuleEvaluation | null;
  analystDirectives: AnalystDirectives | null;
  chairJudgmentRationale: string | null;
}

export type DebatePhase = 'idle' | 'round' | 'chair' | 'verdict' | 'error';

export interface DebateState {
  phase: DebatePhase;
  currentRound: number;
  maxRounds: number;
  transcript: DebateEntry[];
  analystStates: Record<string, AnalystDebateState>;
  chairStates: ChairRoundState[];
  verdict: ModelAnalysis | null;
  stopReason: 'unanimous' | 'converged' | 'chair' | 'max_rounds' | null;
  dissenters: CouncilRole[];
  error: string | null;
}

export interface DebateAnalystModel {
  id: string;
  name: string;
  role: CouncilRole;
}

export interface StockDataPayload {
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  sharpeRatio: number;
  trend: string;
}
