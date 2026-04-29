// src/hooks/useDebate.ts

'use client';

import { useState, useCallback, useRef } from 'react';
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
const EXTENSION_ROUNDS = 2;

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
  extensionRequested: false,
  extensionRationale: null,
  error: null,
};

export function useDebate() {
  const [state, setState] = useState<DebateState>(INITIAL_STATE);

  // Refs so grantExtension can access current values without stale closure
  const runParamsRef = useRef<{
    analysts: DebateAnalystModel[];
    stockData: StockDataPayload;
    symbol: string;
    chairModelId: string;
  } | null>(null);
  const transcriptRef = useRef<DebateEntry[]>([]);
  const directivesRef = useRef<AnalystDirectives | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    transcriptRef.current = [];
    directivesRef.current = null;
  }, []);

  const runRoundsFrom = useCallback(
    async (
      analysts: DebateAnalystModel[],
      stockData: StockDataPayload,
      symbol: string,
      chairModelId: string,
      fromRound: number,
      toRound: number,
    ) => {
      for (let round = fromRound; round <= toRound; round++) {
        const transcript = transcriptRef.current;
        const currentDirectives = directivesRef.current;

        setState(prev => ({
          ...prev,
          phase: 'round',
          currentRound: round,
          maxRounds: toRound,
          extensionRequested: false,
          extensionRationale: null,
          analystStates: Object.fromEntries(
            analysts.map(a => [
              a.id,
              { ...prev.analystStates[a.id], loading: true, error: null },
            ]),
          ),
        }));

        const roundEntries: DebateEntry[] = [];
        await Promise.all(
          analysts.map(async analyst => {
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
          }),
        );

        if (roundEntries.length === 0) {
          setState(prev => ({
            ...prev,
            phase: 'error',
            error: 'All analysts failed in this round',
          }));
          return;
        }

        const newTranscript = [...transcript, ...roundEntries];
        transcriptRef.current = newTranscript;
        setState(prev => ({ ...prev, transcript: newTranscript }));

        const latestRoundEntries = newTranscript.filter(e => e.round === round);
        const isUnanimous = checkUnanimous(latestRoundEntries);
        const isConverged = checkConverged(latestRoundEntries);

        if (isUnanimous || isConverged) {
          const verdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(newTranscript, verdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict,
            stopReason: isUnanimous ? 'unanimous' : 'converged',
            dissenters,
            extensionRequested: false,
            extensionRationale: null,
          }));
          return;
        }

        const forced = round === toRound;
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
              transcript: newTranscript,
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
            const dissenters = computeDissenters(newTranscript, chairData.verdict);
            const extensionRequested = forced && !!chairData.requestExtension;
            setState(prev => ({
              ...prev,
              phase: 'verdict',
              verdict: chairData.verdict,
              stopReason: forced
                ? 'max_rounds'
                : chairData.stopRuleEvaluation?.unanimous
                ? 'unanimous'
                : chairData.stopRuleEvaluation?.converged
                ? 'converged'
                : 'chair',
              dissenters,
              extensionRequested,
              extensionRationale: extensionRequested
                ? (chairData.extensionRationale ?? null)
                : null,
            }));
            return;
          }

          // Chair returned shouldStop:false or missing verdict at forced round — use average fallback
          if (forced) {
            const fallbackVerdict = averageAnalyses(
              latestRoundEntries.map(e => e.analysis),
              stockData.currentPrice,
            );
            const dissenters = computeDissenters(newTranscript, fallbackVerdict);
            const extensionRequested = !!chairData.requestExtension;
            setState(prev => ({
              ...prev,
              phase: 'verdict',
              verdict: fallbackVerdict,
              stopReason: 'max_rounds',
              dissenters,
              extensionRequested,
              extensionRationale: extensionRequested ? (chairData.extensionRationale ?? null) : null,
            }));
            return;
          }

          directivesRef.current = chairData.analystDirectives;
          setState(prev => ({ ...prev, phase: 'round' }));
        } catch (err) {
          const fallbackVerdict = averageAnalyses(
            latestRoundEntries.map(e => e.analysis),
            stockData.currentPrice,
          );
          const dissenters = computeDissenters(newTranscript, fallbackVerdict);
          setState(prev => ({
            ...prev,
            phase: 'verdict',
            verdict: fallbackVerdict,
            stopReason: 'max_rounds',
            dissenters,
            extensionRequested: false,
            extensionRationale: null,
            chairStates: prev.chairStates.map((s, i) =>
              i === prev.chairStates.length - 1 ? { ...s, loading: false } : s,
            ),
          }));
          console.error('Chair failed, using fallback:', err);
          return;
        }
      }

      // Loop exhausted without verdict (chair never stopped at forced round) — average fallback
      const lastEntries = transcriptRef.current.filter(e => e.round === toRound);
      if (lastEntries.length > 0) {
        const fallback = averageAnalyses(lastEntries.map(e => e.analysis), stockData.currentPrice);
        setState(prev => ({
          ...prev,
          phase: 'verdict',
          verdict: fallback,
          stopReason: 'max_rounds',
          dissenters: computeDissenters(transcriptRef.current, fallback),
          extensionRequested: false,
          extensionRationale: null,
        }));
      }
    },
    [],
  );

  const runDebate = useCallback(
    async (
      analysts: DebateAnalystModel[],
      stockData: StockDataPayload,
      symbol: string,
      chairModelId: string,
    ) => {
      if (analysts.length === 0) return;

      runParamsRef.current = { analysts, stockData, symbol, chairModelId };
      transcriptRef.current = [];
      directivesRef.current = null;

      const initialAnalystStates = Object.fromEntries(
        analysts.map(a => [a.id, { loading: false, rounds: [], error: null }]),
      );

      setState({
        ...INITIAL_STATE,
        phase: 'round',
        currentRound: 1,
        maxRounds: MAX_ROUNDS,
        analystStates: initialAnalystStates,
      });

      await runRoundsFrom(analysts, stockData, symbol, chairModelId, 1, MAX_ROUNDS);
    },
    [runRoundsFrom],
  );

  const grantExtension = useCallback(async () => {
    if (!runParamsRef.current) return;
    const { analysts, stockData, symbol, chairModelId } = runParamsRef.current;

    setState(prev => ({
      ...prev,
      extensionRequested: false,
      extensionRationale: null,
      verdict: null,
      phase: 'round',
    }));

    const fromRound = transcriptRef.current.reduce((max, e) => Math.max(max, e.round), 0) + 1;
    const toRound = fromRound + EXTENSION_ROUNDS - 1;
    directivesRef.current = null;

    await runRoundsFrom(analysts, stockData, symbol, chairModelId, fromRound, toRound);
  }, [runRoundsFrom]);

  return { state, runDebate, grantExtension, reset };
}
