// src/hooks/useDebate.ts

'use client';

import { useState, useCallback } from 'react';
import type {
  DebateState,
  DebateAnalystModel,
  DebateEntry,
  ModelAnalysis,
  AnalystDirectives,
  CouncilRole,
  StockDataPayload,
} from '@/lib/debate-types';
import {
  checkUnanimous,
  checkConverged,
  computeDissenters,
  averageAnalyses,
} from '@/lib/debate-utils';

const MAX_ROUNDS = 3;

const INITIAL_STATE: DebateState = {
  phase: 'idle',
  currentRound: 0,
  maxRounds: MAX_ROUNDS,
  transcript: [],
  analystStates: {},
  chairStates: [],
  verdict: null,
  stopReason: null,
  dissenters: [],
  error: null,
};

export function useDebate() {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const runDebate = useCallback(
    async (
      analysts: DebateAnalystModel[],
      stockData: StockDataPayload,
      symbol: string,
      chairModelId: string,
    ) => {
      if (analysts.length === 0) return;

      const initialAnalystStates = Object.fromEntries(
        analysts.map(a => [a.id, { loading: false, rounds: [], error: null }]),
      );

      setState({
        ...INITIAL_STATE,
        phase: 'round',
        currentRound: 1,
        analystStates: initialAnalystStates,
      });

      let transcript: DebateEntry[] = [];
      let currentDirectives: AnalystDirectives | null = null;

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        // Mark all analysts loading for this round
        setState(prev => ({
          ...prev,
          phase: 'round',
          currentRound: round,
          analystStates: Object.fromEntries(
            analysts.map(a => [
              a.id,
              { ...prev.analystStates[a.id], loading: true, error: null },
            ]),
          ),
        }));

        // Fan-out analyst calls in parallel
        const roundEntries: DebateEntry[] = [];
        const analystPromises = analysts.map(async analyst => {
          const directive = currentDirectives
            ? currentDirectives[analyst.role as CouncilRole]
            : null;
          try {
            const res = await fetch('/api/ai/debate-round', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol,
                model: analyst.id,
                councilRole: analyst.role,
                round,
                directive,
                transcript,
                stockData,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Analysis failed');

            const analysis = data.analysis as ModelAnalysis;
            const entry: DebateEntry = {
              round,
              modelId: analyst.id,
              modelName: analyst.name,
              role: analyst.role,
              analysis,
            };
            roundEntries.push(entry);

            setState(prev => ({
              ...prev,
              analystStates: {
                ...prev.analystStates,
                [analyst.id]: {
                  loading: false,
                  rounds: [...(prev.analystStates[analyst.id]?.rounds ?? []), analysis],
                  error: null,
                },
              },
            }));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setState(prev => ({
              ...prev,
              analystStates: {
                ...prev.analystStates,
                [analyst.id]: {
                  ...(prev.analystStates[analyst.id] ?? { rounds: [] }),
                  loading: false,
                  error: msg,
                },
              },
            }));
          }
        });

        await Promise.all(analystPromises);

        if (roundEntries.length === 0) {
          setState(prev => ({
            ...prev,
            phase: 'error',
            error: 'All analysts failed in this round',
          }));
          return;
        }

        transcript = [...transcript, ...roundEntries];

        setState(prev => ({
          ...prev,
          transcript,
        }));

        // Fast-path stop checks
        const latestRoundEntries = transcript.filter(e => e.round === round);
        const isUnanimous = checkUnanimous(latestRoundEntries);
        const isConverged = checkConverged(latestRoundEntries);

        if (isUnanimous || isConverged) {
          const verdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(transcript, verdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict,
            stopReason: isUnanimous ? 'unanimous' : 'converged',
            dissenters,
          }));
          return;
        }

        // Call Chair
        const forced = round === MAX_ROUNDS;
        setState(prev => ({
          ...prev,
          phase: 'chair',
          chairStates: [
            ...prev.chairStates,
            { loading: true, stopRuleEvaluation: null, analystDirectives: null, chairJudgmentRationale: null },
          ],
        }));

        try {
          const chairRes = await fetch('/api/ai/chair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol,
              currentPrice: stockData.currentPrice,
              transcript,
              round,
              chairModelId,
              forced,
            }),
          });
          const chairData = await chairRes.json();
          if (!chairRes.ok) throw new Error(chairData.message || 'Chair failed');

          const chairRoundState = {
            loading: false,
            stopRuleEvaluation: chairData.stopRuleEvaluation,
            analystDirectives: chairData.analystDirectives,
            chairJudgmentRationale: chairData.stopRuleEvaluation?.chairJudgmentRationale ?? null,
          };

          setState(prev => ({
            ...prev,
            chairStates: [...prev.chairStates.slice(0, -1), chairRoundState],
          }));

          if (chairData.shouldStop && chairData.verdict) {
            const dissenters = computeDissenters(transcript, chairData.verdict);
            setState(prev => ({
              ...prev,
              phase: 'verdict',
              verdict: chairData.verdict,
              stopReason: forced ? 'max_rounds' : (chairData.stopRuleEvaluation?.unanimous ? 'unanimous' : chairData.stopRuleEvaluation?.converged ? 'converged' : 'chair'),
              dissenters,
            }));
            return;
          }

          currentDirectives = chairData.analystDirectives;
          setState(prev => ({ ...prev, phase: 'round' }));
        } catch (err) {
          // Chair failed — fall back to averaging last round
          const fallbackVerdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(transcript, fallbackVerdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict: fallbackVerdict,
            stopReason: 'max_rounds',
            dissenters,
            chairStates: prev.chairStates.map((s, i) =>
              i === prev.chairStates.length - 1
                ? { ...s, loading: false }
                : s,
            ),
          }));
          console.error('Chair failed, using fallback:', err);
          return;
        }
      }

      // Exhausted max rounds without Chair verdict (shouldn't happen but guard)
      const lastRoundEntries = transcript.filter(e => e.round === MAX_ROUNDS);
      if (lastRoundEntries.length > 0) {
        const fallback = averageAnalyses(
          lastRoundEntries.map(e => e.analysis),
          stockData.currentPrice,
        );
        setState(prev => ({
          ...prev,
          phase: 'verdict',
          verdict: fallback,
          stopReason: 'max_rounds',
          dissenters: computeDissenters(transcript, fallback),
        }));
      }
    },
    [],
  );

  return { state, runDebate, reset };
}
