// src/components/features/debate-theater.tsx

'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
  ChevronDown,
  ChevronUp,
  Check,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { COUNCIL_ROLE_LABELS } from './ai-council-panel';
import type { DebateState, DebateAnalystModel, ModelAnalysis, CouncilRole } from '@/lib/debate-types';

interface DebateTheaterProps {
  state: DebateState;
  analysts: DebateAnalystModel[];
  chairModelName: string;
  onGrantExtension: () => void;
}

function getPredictionLabel(p: string) {
  if (p === 'UP') return 'BUY';
  if (p === 'DOWN') return 'SELL';
  return 'HOLD';
}

function getPredictionColor(p: string) {
  if (p === 'UP') return 'text-green-400';
  if (p === 'DOWN') return 'text-red-400';
  return 'text-yellow-400';
}

function getScoreColor(score: number) {
  if (score >= 8) return 'text-green-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-red-400';
}

function PositionDelta({ prev, curr }: { prev: string; curr: string }) {
  if (!prev || prev === curr) return null;
  return (
    <span className="text-[9px] text-amber-400 font-semibold ml-1">
      {getPredictionLabel(prev)}→{getPredictionLabel(curr)}
    </span>
  );
}

function RoundSteps({ currentRound, maxRounds, phase }: { currentRound: number; maxRounds: number; phase: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: maxRounds }, (_, i) => i + 1).map(r => {
        const done = r < currentRound || phase === 'verdict';
        const active = r === currentRound && phase !== 'verdict';
        return (
          <div key={r} className="flex items-center gap-1">
            <div
              className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border',
                done
                  ? 'bg-purple-500/30 border-purple-500 text-purple-300'
                  : active
                  ? 'bg-purple-500/20 border-purple-500 text-purple-300 ring-1 ring-purple-500/50'
                  : 'bg-muted/20 border-border/40 text-muted-foreground',
              )}
            >
              {done ? <Check className="h-2.5 w-2.5" /> : r}
            </div>
            {r < maxRounds && (
              <div
                className={cn(
                  'h-px w-4',
                  r < currentRound || phase === 'verdict'
                    ? 'bg-purple-500/50'
                    : 'bg-border/30',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalystTile({
  analyst,
  analystState,
  displayRound,
  isActiveRound,
}: {
  analyst: DebateAnalystModel;
  analystState: DebateState['analystStates'][string];
  displayRound: number;
  isActiveRound: boolean;
}) {
  const roleInfo = COUNCIL_ROLE_LABELS[analyst.role as CouncilRole];
  const rounds = analystState?.rounds ?? [];
  const current = rounds[displayRound - 1] ?? null;
  const prev = displayRound >= 2 ? (rounds[displayRound - 2] ?? null) : null;

  const loading = isActiveRound && !!analystState?.loading;
  const error = isActiveRound ? (analystState?.error ?? null) : null;

  return (
    <div
      className={cn(
        'p-2.5 rounded-lg border transition-colors',
        loading
          ? 'border-purple-500/30 bg-purple-500/5'
          : error
          ? 'border-red-500/20 bg-red-500/5'
          : current
          ? 'border-border/40 bg-muted/10'
          : 'border-border/20 bg-muted/5',
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-foreground/80 truncate">
            {analyst.name.split(' ').slice(0, 2).join(' ')}
          </p>
          <p className={cn('text-[9px]', roleInfo?.color ?? 'text-muted-foreground')}>
            {roleInfo?.short ?? analyst.role}
          </p>
        </div>
        {loading && <Spinner size="sm" />}
        {!loading && current && (
          <Check className="h-3 w-3 text-green-400 shrink-0" />
        )}
        {error && (
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
        )}
      </div>

      {current && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-xs font-bold font-mono', getScoreColor(current.score))}>
            {current.score}
          </span>
          <span className={cn('text-[10px] font-semibold', getPredictionColor(current.prediction))}>
            {getPredictionLabel(current.prediction)}
          </span>
          <span className="text-[10px] text-muted-foreground">{current.confidence}%</span>
          {prev && <PositionDelta prev={prev.prediction} curr={current.prediction} />}
        </div>
      )}

      {!current && !loading && !error && (
        <p className="text-[10px] text-muted-foreground">Waiting…</p>
      )}
      {error && (
        <p className="text-[10px] text-red-400 truncate">{error}</p>
      )}
    </div>
  );
}

function ChairStrip({ chairState, round }: { chairState: DebateState['chairStates'][0]; round: number }) {
  const [open, setOpen] = useState(false);

  if (!chairState) return null;

  const rationale = chairState.chairJudgmentRationale;
  const directives = chairState.analystDirectives;
  const directiveCount = directives
    ? Object.values(directives).filter(Boolean).length
    : 0;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-300">
            Chair after Round {round}
          </span>
          {chairState.loading && <Spinner size="sm" />}
          {!chairState.loading && directiveCount > 0 && (
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 py-0">
              {directiveCount} directive{directiveCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {open && !chairState.loading && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {rationale && (
                <p className="text-xs text-amber-200/70 italic">{rationale}</p>
              )}
              {directives && directiveCount > 0 && (
                <div className="space-y-1">
                  {(Object.entries(directives) as [CouncilRole, string | null][])
                    .filter(([, d]) => d)
                    .map(([role, directive]) => (
                      <div key={role} className="flex gap-1.5">
                        <span
                          className={cn(
                            'text-[9px] font-semibold shrink-0 mt-0.5',
                            COUNCIL_ROLE_LABELS[role]?.color ?? 'text-muted-foreground',
                          )}
                        >
                          {COUNCIL_ROLE_LABELS[role]?.short ?? role}:
                        </span>
                        <p className="text-[11px] text-foreground/70">{directive}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VerdictCard({ verdict, stopReason, dissenters }: {
  verdict: ModelAnalysis;
  stopReason: DebateState['stopReason'];
  dissenters: CouncilRole[];
}) {
  const scoreColor = getScoreColor(verdict.score);
  const predColor = getPredictionColor(verdict.prediction);
  const predLabel = getPredictionLabel(verdict.prediction);

  const stopLabels: Record<NonNullable<DebateState['stopReason']>, string> = {
    unanimous: 'Unanimous',
    converged: 'Converged',
    chair: 'Chair Verdict',
    max_rounds: 'Final Round',
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-300">Council Verdict</span>
          {stopReason && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 py-0">
              {stopLabels[stopReason]}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className={cn('relative flex items-center justify-center w-12 h-12 rounded-full border-2',
            verdict.score >= 8 ? 'bg-green-500/20 border-green-500' : verdict.score >= 5 ? 'bg-yellow-500/20 border-yellow-500' : 'bg-red-500/20 border-red-500',
          )}>
            <span className={cn('text-lg font-bold font-mono', scoreColor)}>{verdict.score}</span>
            <span className={cn('absolute -bottom-1 text-[9px] font-medium', scoreColor)}>/10</span>
          </div>
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border',
            verdict.prediction === 'UP' ? 'bg-green-500/10 border-green-500/30' : verdict.prediction === 'DOWN' ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30',
          )}>
            {verdict.prediction === 'UP' ? <ArrowUpCircle className="h-4 w-4 text-green-400" /> : verdict.prediction === 'DOWN' ? <ArrowDownCircle className="h-4 w-4 text-red-400" /> : <Minus className="h-4 w-4 text-yellow-400" />}
            <span className={cn('text-base font-bold', predColor)}>{predLabel}</span>
          </div>
        </div>
      </div>

      <ul className="space-y-1 pl-3">
        {verdict.reasons.map((r, i) => (
          <li key={i} className="text-xs text-foreground/80 flex gap-2">
            <span className="text-amber-400 shrink-0">•</span>
            {r}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className={cn('p-2.5 rounded-lg border space-y-1',
          verdict.bottomFishing.recommended ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-muted/10 border-border/30',
        )}>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] font-semibold text-cyan-400">BUY ENTRY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono">
              {verdict.bottomFishing.targetPrice ? `$${verdict.bottomFishing.targetPrice.toFixed(2)}` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{verdict.bottomFishing.timing}</span>
          </div>
          {verdict.bottomFishing.rationale && (
            <p className="text-[10px] text-muted-foreground italic">{verdict.bottomFishing.rationale}</p>
          )}
        </div>
        <div className="p-2.5 rounded-lg border bg-green-500/5 border-green-500/20 space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400">SELL TARGET</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono text-green-400">
              ${verdict.priceTarget.targetPrice.toFixed(2)}
            </span>
            <span className="text-[10px] text-green-500/70">
              (+{verdict.priceTarget.expectedRise.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{verdict.priceTarget.timeframe}</span>
          </div>
          {verdict.priceTarget.exitStrategy && (
            <p className="text-[10px] text-muted-foreground italic">{verdict.priceTarget.exitStrategy}</p>
          )}
        </div>
      </div>

      {verdict.riskFactors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-xs font-medium">Risk Factors</span>
          </div>
          <ul className="pl-3 space-y-0.5">
            {verdict.riskFactors.map((f, i) => (
              <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                <span className="text-red-400 shrink-0">•</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dissenters.length > 0 && (
        <div className="pt-1 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-orange-400">Dissent:</span>{' '}
            {dissenters.map(r => COUNCIL_ROLE_LABELS[r]?.short ?? r).join(', ')} voted opposite
          </p>
        </div>
      )}
    </div>
  );
}

export function DebateTheater({ state, analysts, chairModelName, onGrantExtension }: DebateTheaterProps) {
  const { phase, currentRound, maxRounds, analystStates, chairStates, verdict, stopReason, dissenters, extensionRequested, extensionRationale } = state;
  const [extensionDismissed, setExtensionDismissed] = useState(false);
  // Reset dismissed flag whenever a new extension offer arrives
  const prevExtensionRef = useRef(false);
  if (extensionRequested && !prevExtensionRef.current) {
    setExtensionDismissed(false);
  }
  prevExtensionRef.current = extensionRequested;

  const roundsToShow = phase === 'idle' ? [] : Array.from(
    { length: currentRound },
    (_, i) => i + 1,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-foreground/80">Council Debate</span>
          <RoundSteps currentRound={currentRound} maxRounds={maxRounds} phase={phase} />
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] text-muted-foreground">
            Chair: {chairModelName.split('/').pop()?.split('-').slice(0, 2).join('-') ?? chairModelName}
          </span>
          {(phase === 'round' || phase === 'chair') && (
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
      </div>

      {/* Rounds */}
      {roundsToShow.map(round => {
        const chairState = chairStates[round - 1];
        const isCurrentRound = round === currentRound;
        const isComplete = round < currentRound || phase === 'verdict';

        return (
          <div key={round} className="space-y-2">
            {/* Round label */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Round {round}
              </span>
              <div className="flex-1 h-px bg-border/20" />
              <span className={cn(
                'text-[10px]',
                isComplete ? 'text-green-400' : isCurrentRound && phase === 'round' ? 'text-purple-400' : 'text-muted-foreground',
              )}>
                {isComplete ? 'complete' : phase === 'chair' && isCurrentRound ? 'chair evaluating…' : 'in progress'}
              </span>
            </div>

            {/* Analyst tiles — responsive grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {analysts.map(analyst => (
                <AnalystTile
                  key={analyst.id}
                  analyst={analyst}
                  analystState={analystStates[analyst.id]}
                  displayRound={round}
                  isActiveRound={round === currentRound && phase !== 'verdict'}
                />
              ))}
            </div>

            {/* Chair strip for this round */}
            {chairState && <ChairStrip chairState={chairState} round={round} />}
          </div>
        );
      })}

      {/* Verdict */}
      <AnimatePresence>
        {phase === 'verdict' && verdict && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <VerdictCard verdict={verdict} stopReason={stopReason} dissenters={dissenters} />

            {/* Extension prompt */}
            {extensionRequested && !extensionDismissed && (
              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <p className="text-xs font-medium text-purple-300">
                    Chair recommends more debate
                  </p>
                </div>
                {extensionRationale && (
                  <p className="text-[11px] text-foreground/60 italic pl-5">{extensionRationale}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onGrantExtension}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Give 2 more rounds
                  </button>
                  <button
                    onClick={() => setExtensionDismissed(true)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/20 hover:bg-muted/30 text-muted-foreground border border-border/30 transition-colors"
                  >
                    Summarize now
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {phase === 'error' && state.error && (
        <p className="text-sm text-red-400 text-center py-4">{state.error}</p>
      )}
    </div>
  );
}
