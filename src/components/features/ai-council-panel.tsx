'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface ModelAnalysis {
  score: number;
  prediction: string;
  confidence: number;
  reasons: string[];
  bottomFishing: {
    recommended: boolean;
    targetPrice: number | null;
    timing: string;
    rationale: string;
  };
  priceTarget: {
    expectedRise: number;
    targetPrice: number;
    timeframe: string;
    exitStrategy: string;
  };
  riskFactors: string[];
}

export interface CouncilResult {
  modelId: string;
  modelName: string;
  analysis: ModelAnalysis | null;
  loading: boolean;
  error: string | null;
}

interface AiCouncilPanelProps {
  results: CouncilResult[];
  summaryAnalysis: ModelAnalysis | null;
  summaryLoading: boolean;
  summaryError: string | null;
}

function getPredictionLabel(prediction: string) {
  if (prediction === 'UP') return 'BUY';
  if (prediction === 'DOWN') return 'SELL';
  return 'HOLD';
}

function getPredictionColor(prediction: string) {
  if (prediction === 'UP') return 'text-green-500';
  if (prediction === 'DOWN') return 'text-red-500';
  return 'text-yellow-500';
}

function getScoreColorClass(score: number) {
  if (score >= 8) return 'text-green-500';
  if (score >= 5) return 'text-yellow-500';
  return 'text-red-500';
}

function AnalysisContent({ analysis }: { analysis: ModelAnalysis }) {
  const predLabel = getPredictionLabel(analysis.prediction);
  const predColor = getPredictionColor(analysis.prediction);
  const scoreColor = getScoreColorClass(analysis.score);

  return (
    <div className="space-y-4">
      {/* Score + prediction header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'relative flex items-center justify-center w-16 h-16 rounded-full border-2',
              analysis.score >= 8
                ? 'bg-green-500/20 border-green-500'
                : analysis.score >= 5
                  ? 'bg-yellow-500/20 border-yellow-500'
                  : 'bg-red-500/20 border-red-500',
            )}
          >
            <span className={cn('text-2xl font-bold font-mono', scoreColor)}>
              {analysis.score}
            </span>
            <span
              className={cn(
                'absolute -bottom-1 text-xs font-medium',
                scoreColor,
              )}
            >
              /10
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Score</p>
            <p className={cn('text-sm font-semibold', scoreColor)}>
              {analysis.score >= 8
                ? 'Strong Buy'
                : analysis.score >= 5
                  ? 'Hold/Neutral'
                  : 'Caution'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
              analysis.prediction === 'UP'
                ? 'bg-green-500/10 border-green-500/30'
                : analysis.prediction === 'DOWN'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-yellow-500/10 border-yellow-500/30',
            )}
          >
            {analysis.prediction === 'UP' ? (
              <ArrowUpCircle className="h-4 w-4 text-green-500" />
            ) : analysis.prediction === 'DOWN' ? (
              <ArrowDownCircle className="h-4 w-4 text-red-500" />
            ) : (
              <Minus className="h-4 w-4 text-yellow-500" />
            )}
            <span className={cn('text-base font-bold', predColor)}>
              {predLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {analysis.confidence}% confidence
          </p>
        </div>
      </div>

      {/* Reasons */}
      <ul className="space-y-1.5 pl-3">
        {analysis.reasons.map((r, i) => (
          <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
            <span className="text-purple-400 mt-0.5 shrink-0">•</span>
            {r}
          </li>
        ))}
      </ul>

      {/* BUY / SELL cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          className={cn(
            'p-3 rounded-lg border space-y-1.5',
            analysis.bottomFishing.recommended
              ? 'bg-cyan-500/5 border-cyan-500/20'
              : 'bg-muted/20 border-border/30',
          )}
        >
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400">
              BUY STRATEGY
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Entry:</span>
            <span className="text-xs font-mono font-medium">
              {analysis.bottomFishing.targetPrice
                ? `$${analysis.bottomFishing.targetPrice.toFixed(2)}`
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Timing:</span>
            <span className="text-xs">{analysis.bottomFishing.timing}</span>
          </div>
          {analysis.bottomFishing.rationale && (
            <p className="text-[11px] text-muted-foreground italic">
              {analysis.bottomFishing.rationale}
            </p>
          )}
        </div>

        <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-green-400" />
            <span className="text-xs font-semibold text-green-400">
              SELL STRATEGY
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Target:</span>
            <span className="text-xs font-mono font-medium text-green-400">
              ${analysis.priceTarget.targetPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-green-500/70">
              (+{analysis.priceTarget.expectedRise.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">In:</span>
            <span className="text-xs">{analysis.priceTarget.timeframe}</span>
          </div>
          {analysis.priceTarget.exitStrategy && (
            <p className="text-[11px] text-muted-foreground italic">
              {analysis.priceTarget.exitStrategy}
            </p>
          )}
        </div>
      </div>

      {/* Risks */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-red-400" />
          <span className="text-xs font-medium">Risk Factors</span>
        </div>
        <ul className="pl-3 space-y-0.5">
          {analysis.riskFactors.map((f, i) => (
            <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
              <span className="text-red-400 shrink-0">•</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AiCouncilPanel({
  results,
  summaryAnalysis,
  summaryLoading,
  summaryError,
}: AiCouncilPanelProps) {
  const [activeTab, setActiveTab] = useState(results[0]?.modelId ?? 'summary');

  const effectiveTab =
    activeTab === 'summary' || results.find(r => r.modelId === activeTab)
      ? activeTab
      : (results[0]?.modelId ?? 'summary');

  const activeResult = results.find(r => r.modelId === effectiveTab);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="relative flex gap-0.5 border-b border-white/10 overflow-x-auto pb-0">
        {results.map(r => (
          <button
            key={r.modelId}
            onClick={() => setActiveTab(r.modelId)}
            className={cn(
              'relative px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              effectiveTab === r.modelId
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70',
            )}
          >
            {effectiveTab === r.modelId && (
              <motion.div
                layoutId="council-tab-indicator"
                className="absolute inset-0 bg-purple-500/10 border-b-2 border-purple-500 rounded-t"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {r.loading && <Spinner size="sm" />}
              {r.error && <AlertTriangle className="h-3 w-3 text-red-400" />}
              {!r.loading && !r.error && r.analysis && (
                <>
                  <span
                    className={cn(
                      'font-bold',
                      getScoreColorClass(r.analysis.score),
                    )}
                  >
                    {r.analysis.score}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold',
                      getPredictionColor(r.analysis.prediction),
                    )}
                  >
                    {getPredictionLabel(r.analysis.prediction)}
                  </span>
                </>
              )}
              {r.modelName.split(' ').slice(0, 2).join(' ')}
            </span>
          </button>
        ))}

        {/* Summary tab */}
        {(summaryAnalysis || summaryLoading) && (
          <button
            onClick={() => setActiveTab('summary')}
            className={cn(
              'relative px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              effectiveTab === 'summary'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70',
            )}
          >
            {effectiveTab === 'summary' && (
              <motion.div
                layoutId="council-tab-indicator"
                className="absolute inset-0 bg-amber-500/10 border-b-2 border-amber-500 rounded-t"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-400" />
              {summaryLoading && <Spinner size="sm" />}
              {summaryAnalysis && !summaryLoading && (
                <>
                  <span
                    className={cn(
                      'font-bold',
                      getScoreColorClass(summaryAnalysis.score),
                    )}
                  >
                    {summaryAnalysis.score}
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-semibold',
                      getPredictionColor(summaryAnalysis.prediction),
                    )}
                  >
                    {getPredictionLabel(summaryAnalysis.prediction)}
                  </span>
                </>
              )}
              Council
            </span>
          </button>
        )}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {/* Per-model tab */}
          {effectiveTab !== 'summary' && activeResult && (
            <>
              {activeResult.loading && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Spinner size="sm" />
                  <span className="text-sm">
                    Analyzing with {activeResult.modelName}...
                  </span>
                </div>
              )}
              {activeResult.error && (
                <div className="py-4 text-center text-sm text-red-400">
                  {activeResult.error}
                </div>
              )}
              {activeResult.analysis && (
                <AnalysisContent analysis={activeResult.analysis} />
              )}
            </>
          )}

          {/* Summary tab */}
          {effectiveTab === 'summary' && (
            <>
              {summaryLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Spinner size="sm" />
                  <span className="text-sm">Synthesizing council opinion...</span>
                </div>
              )}
              {summaryError && (
                <p className="py-4 text-center text-sm text-red-400">
                  {summaryError}
                </p>
              )}
              {summaryAnalysis && !summaryLoading && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500/30 text-amber-400"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Council Consensus
                    </Badge>
                  </div>
                  <AnalysisContent analysis={summaryAnalysis} />
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
