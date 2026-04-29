import type { DebateEntry, ModelAnalysis, CouncilRole } from './debate-types';

export function checkUnanimous(entries: DebateEntry[]): boolean {
  if (entries.length === 0) return false;
  const preds = entries.map(e => e.analysis.prediction);
  return preds.every(p => p === preds[0]);
}

export function checkConverged(entries: DebateEntry[], threshold = 15): boolean {
  if (entries.length < 2) return false;
  const confidences = entries.map(e => e.analysis.confidence);
  return Math.max(...confidences) - Math.min(...confidences) < threshold;
}

export function computeDissenters(
  entries: DebateEntry[],
  verdict: ModelAnalysis,
): CouncilRole[] {
  return entries
    .filter(e => e.analysis.prediction !== verdict.prediction)
    .map(e => e.role);
}

export function buildTranscriptText(transcript: DebateEntry[]): string {
  const byRound = transcript.reduce<Record<number, DebateEntry[]>>((acc, e) => {
    if (!acc[e.round]) acc[e.round] = [];
    acc[e.round].push(e);
    return acc;
  }, {});

  return Object.entries(byRound)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([round, entries]) => {
      const lines = entries.map(
        e =>
          `[${e.role.toUpperCase()} - ${e.modelName}]\nScore: ${e.analysis.score}/10 | ${e.analysis.prediction} (${e.analysis.confidence}% conf)\nReasons: ${e.analysis.reasons.join('; ')}\nRisks: ${e.analysis.riskFactors.join('; ')}`,
      );
      return `=== ROUND ${round} ===\n${lines.join('\n\n')}`;
    })
    .join('\n\n');
}

export function averageAnalyses(
  analyses: ModelAnalysis[],
  currentPrice: number,
): ModelAnalysis {
  const n = analyses.length;
  const avgScore = Math.round(analyses.reduce((s, a) => s + a.score, 0) / n);
  const avgConf = Math.round(analyses.reduce((s, a) => s + a.confidence, 0) / n);
  const votes: Record<string, number> = { UP: 0, DOWN: 0, HOLD: 0 };
  analyses.forEach(a => { votes[a.prediction] = (votes[a.prediction] ?? 0) + 1; });
  const prediction = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  const avgTarget =
    analyses.reduce((s, a) => s + (a.priceTarget.targetPrice || currentPrice), 0) / n;
  const avgRise =
    analyses.reduce((s, a) => s + (a.priceTarget.expectedRise || 0), 0) / n;
  const avgEntry =
    analyses.reduce((s, a) => s + (a.bottomFishing.targetPrice || currentPrice), 0) / n;
  return {
    score: avgScore,
    prediction,
    confidence: avgConf,
    reasons: [...new Set(analyses.flatMap(a => a.reasons))].slice(0, 3),
    bottomFishing: {
      recommended: analyses.filter(a => a.bottomFishing.recommended).length > n / 2,
      targetPrice: avgEntry,
      timing: 'Consensus timing',
      rationale: 'Council average — debate did not reach Chair verdict',
    },
    priceTarget: {
      expectedRise: avgRise,
      targetPrice: avgTarget,
      timeframe: 'Consensus timeframe',
      exitStrategy: 'Monitor council consensus',
    },
    riskFactors: [...new Set(analyses.flatMap(a => a.riskFactors))].slice(0, 3),
  };
}
