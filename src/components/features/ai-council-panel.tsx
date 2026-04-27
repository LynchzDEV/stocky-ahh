// src/components/features/ai-council-panel.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Target, Clock, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ModelAnalysis {
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
  summary: string | null;
  summaryLoading: boolean;
  summaryError: string | null;
}

export function AiCouncilPanel({ results, summary, summaryLoading, summaryError }: AiCouncilPanelProps) {
  const [activeTab, setActiveTab] = useState(results[0]?.modelId ?? "");

  const activeResult = results.find((r) => r.modelId === activeTab);

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-500";
    if (score >= 5) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Card className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border-purple-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5 text-purple-400" />
          AI Council
          <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">
            {results.length} models
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tab bar */}
        <div className="relative flex gap-1 border-b border-white/10 overflow-x-auto pb-0">
          {results.map((r) => (
            <button
              key={r.modelId}
              onClick={() => setActiveTab(r.modelId)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                activeTab === r.modelId ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {activeTab === r.modelId && (
                <motion.div
                  layoutId="council-tab-indicator"
                  className="absolute inset-0 bg-purple-500/10 border-b-2 border-purple-500 rounded-t"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {r.loading && <Spinner size="sm" />}
                {r.error && <AlertTriangle className="h-3 w-3 text-red-400" />}
                {!r.loading && !r.error && r.analysis && (
                  <span className={cn("font-bold", getScoreColor(r.analysis.score))}>
                    {r.analysis.score}
                  </span>
                )}
                {r.modelName.split(" ").slice(0, 2).join(" ")}
              </span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {activeResult?.loading && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Spinner size="sm" />
                <span className="text-sm">Analyzing with {activeResult.modelName}...</span>
              </div>
            )}
            {activeResult?.error && (
              <div className="py-4 text-center text-sm text-red-400">{activeResult.error}</div>
            )}
            {activeResult?.analysis && (
              <div className="space-y-3">
                {/* Score + prediction */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className={cn("text-3xl font-bold font-mono", getScoreColor(activeResult.analysis.score))}>
                    {activeResult.analysis.score}/10
                  </div>
                  <div>
                    <Badge
                      variant="outline"
                      className={activeResult.analysis.prediction === "UP"
                        ? "border-green-500/50 text-green-500"
                        : "border-red-500/50 text-red-500"}
                    >
                      {activeResult.analysis.prediction === "UP" ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {activeResult.analysis.prediction}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{activeResult.analysis.confidence}% confidence</p>
                  </div>
                </div>

                {/* Reasons */}
                <ul className="space-y-1 pl-2">
                  {activeResult.analysis.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-foreground/80 flex gap-2">
                      <span className="text-purple-400 shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>

                {/* BUY / SELL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="h-3 w-3 text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-400">BUY STRATEGY</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Entry:</span>
                      <span className="text-xs font-mono font-medium">
                        {activeResult.analysis.bottomFishing.targetPrice
                          ? `$${activeResult.analysis.bottomFishing.targetPrice.toFixed(2)}`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Timing:</span>
                      <span className="text-xs">{activeResult.analysis.bottomFishing.timing}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingDown className="h-3 w-3 text-green-400" />
                      <span className="text-xs font-semibold text-green-400">SELL STRATEGY</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Target:</span>
                      <span className="text-xs font-mono font-medium text-green-400">
                        ${activeResult.analysis.priceTarget.targetPrice.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">In:</span>
                      <span className="text-xs">{activeResult.analysis.priceTarget.timeframe}</span>
                    </div>
                  </div>
                </div>

                {/* Risks */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                    <span className="text-xs font-medium">Risks</span>
                  </div>
                  <ul className="pl-2 space-y-0.5">
                    {activeResult.analysis.riskFactors.map((f, i) => (
                      <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                        <span className="text-red-400 shrink-0">•</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Council Summary */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">Council Summary</span>
            <span className="text-xs text-muted-foreground">(default AI)</span>
          </div>
          {summaryLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <Spinner size="sm" />
              <span className="text-xs">Synthesizing council opinion...</span>
            </div>
          )}
          {summaryError && <p className="text-xs text-red-400">{summaryError}</p>}
          {summary && (
            <p className="text-sm text-foreground/80 leading-relaxed bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              {summary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
