'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  BarChart3,
  Lightbulb,
  Sparkles,
  X,
  Star,
  History,
  Trash2,
  Target,
  Clock,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  ChevronDown,
  Check,
  Activity,
  Settings2,
  Users,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CandlestickChart } from './candlestick-chart';
import { StockNews } from './stock-news';
import { useDebate } from '@/hooks/useDebate';
import { DebateTheater } from './debate-theater';
import type { DebateAnalystModel, StockDataPayload, CouncilRole } from '@/lib/debate-types';
import { validateSymbol, RateLimiter } from '@/lib/validation';
import type { StockData } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useDefaultAI } from '@/hooks/useDefaultAI';
import { useAiModels } from '@/hooks/useAiModels';


const POPULAR_STOCKS = ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN', 'NVDA'];

const rateLimiter = new RateLimiter(1000);

function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return (volume / 1_000_000_000).toFixed(2) + 'B';
  }
  if (volume >= 1_000_000) {
    return (volume / 1_000_000).toFixed(2) + 'M';
  }
  if (volume >= 1_000) {
    return (volume / 1_000).toFixed(2) + 'K';
  }
  return volume.toString();
}

function getSharpeInterpretation(sharpe: number): {
  label: string;
  color: string;
  description: string;
} {
  if (sharpe > 1.0) {
    return {
      label: 'Excellent',
      color: '#22c55e',
      description:
        'Strong risk-adjusted returns. The investment is generating significant returns relative to its risk.',
    };
  }
  if (sharpe >= 0.5) {
    return {
      label: 'Good',
      color: '#3b82f6',
      description:
        'Decent risk-adjusted returns. The investment is performing reasonably well for its risk level.',
    };
  }
  if (sharpe >= 0) {
    return {
      label: 'Neutral',
      color: '#eab308',
      description:
        'Average risk-adjusted returns. Returns are roughly in line with the risk taken.',
    };
  }
  return {
    label: 'Poor',
    color: '#ef4444',
    description:
      'Negative risk-adjusted returns. The investment is underperforming relative to its risk.',
  };
}

const DEBATE_ROLES: CouncilRole[] = ['technical', 'fundamental', 'sentiment', 'contrarian', 'risk'];

export function StockAnalyzer() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);

  // Search history and watchlist hooks
  const { history, addToHistory, clearHistory } = useSearchHistory();
  const { watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist } =
    useWatchlist();

  // AI Analysis states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
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
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiCacheInfo, setAiCacheInfo] = useState<{
    cached: boolean;
    cachedAt?: string;
    expiresIn?: number;
  } | null>(null);
  const { defaultAI, setDefaultAI } = useDefaultAI();
  const { models: AI_MODELS, addModel, removeModel, resetToDefaults } = useAiModels();
  const [selectedModel, setSelectedModel] = useState(() => AI_MODELS[0]);
  const [customModelInput, setCustomModelInput] = useState('');
  const [newPresetId, setNewPresetId] = useState('');
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetProvider, setNewPresetProvider] = useState('');
  const [showDefaultAISettings, setShowDefaultAISettings] = useState(false);
  const [customDefaultInput, setCustomDefaultInput] = useState('');

  // AI Council state
  const [selectedCouncilModels, setSelectedCouncilModels] = useState<string[]>(
    [],
  );
  const [showCouncilPanel, setShowCouncilPanel] = useState(false);
  const [customCouncilInput, setCustomCouncilInput] = useState('');
  const [chairModelId, setChairModelId] = useState(() => defaultAI.id);
  const [customChairInput, setCustomChairInput] = useState('');
  const { state: debateState, runDebate, reset: resetDebate } = useDebate();

  // Unified AI dropdown
  const [showAiDropdown, setShowAiDropdown] = useState(false);
  const [aiActiveTab, setAiActiveTab] = useState<'insight' | 'council'>(
    'insight',
  );
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);
  const [aiDropdownPos, setAiDropdownPos] = useState({ top: 0, left: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  // Technical indicators state
  const [rsiData, setRsiData] = useState<{
    value: number;
    signal: 'Overbought' | 'Bullish' | 'Neutral' | 'Bearish' | 'Oversold';
  } | null>(null);
  const [macdData, setMacdData] = useState<{
    macd: number;
    signal: number;
    histogram: number;
    trend: 'Bullish' | 'Bearish' | 'Neutral';
  } | null>(null);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);

  // Fetch indicators when stock data changes
  useEffect(() => {
    if (stockData?.symbol) {
      const fetchIndicators = async () => {
        setIndicatorsLoading(true);
        try {
          const response = await fetch(
            `/api/stock/${encodeURIComponent(stockData.symbol)}/indicators`,
          );
          if (response.ok) {
            const data = await response.json();
            setRsiData(data.rsi);
            setMacdData(data.macd);
          }
        } catch (err) {
          console.error('Failed to fetch indicators:', err);
        } finally {
          setIndicatorsLoading(false);
        }
      };
      fetchIndicators();
    }
  }, [stockData?.symbol]);

  useEffect(() => {
    const known = AI_MODELS.find(m => m.id === defaultAI.id);
    if (known) setSelectedModel(known);
  }, [defaultAI.id]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!showAiDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !aiButtonRef.current?.contains(target) &&
        !aiPanelRef.current?.contains(target)
      ) {
        setShowAiDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAiDropdown]);

  useEffect(() => {
    if (!showAiDropdown) return;
    const handler = () => {
      if (aiButtonRef.current) {
        const rect = aiButtonRef.current.getBoundingClientRect();
        setAiDropdownPos({ top: rect.bottom + 8, left: Math.max(0, rect.right - 288) });
      }
    };
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [showAiDropdown]);

  useEffect(() => {
    if (!showDefaultAISettings) return;
    const handler = (e: MouseEvent) => {
      if (
        settingsPanelRef.current &&
        !settingsPanelRef.current.contains(e.target as Node)
      ) {
        setShowDefaultAISettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDefaultAISettings]);

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 8)
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        label: 'Strong Buy',
      };
    if (score >= 5)
      return {
        bg: 'bg-yellow-500',
        text: 'text-yellow-500',
        label: 'Hold/Neutral',
      };
    return { bg: 'bg-red-500', text: 'text-red-500', label: 'Caution' };
  };

  const fetchAiAnalysis = useCallback(
    async (forceRefresh = false) => {
      if (!stockData) return;

      setAiLoading(true);
      setAiError(null);
      setShowAiPanel(true);
      setAiActiveTab('insight');

      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol: stockData.symbol,
            forceRefresh,
            model: customModelInput.trim() || selectedModel.id,
            stockData: {
              name: stockData.name,
              currentPrice: stockData.currentPrice,
              change: stockData.change,
              changePercent: stockData.changePercent,
              dayHigh: stockData.dayHigh,
              dayLow: stockData.dayLow,
              volume: stockData.volume,
              sharpeRatio: stockData.sharpeRatio,
              trend: stockData.trend,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to get AI analysis');
        }

        const data = await response.json();
        setAiAnalysis(data.analysis);
        setAiCacheInfo({
          cached: data.cached || false,
          cachedAt: data.cachedAt,
          expiresIn: data.expiresIn,
        });
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : 'Unable to get AI analysis',
        );
      } finally {
        setAiLoading(false);
      }
    },
    [stockData, selectedModel, customModelInput],
  );

  const handleRunDebate = useCallback(() => {
    if (!stockData || selectedCouncilModels.length === 0) return;

    const analysts: DebateAnalystModel[] = selectedCouncilModels.map((id, idx) => {
      const known = AI_MODELS.find(m => m.id === id);
      return {
        id,
        name: known?.name ?? id,
        role: DEBATE_ROLES[idx % DEBATE_ROLES.length],
      };
    });

    const stockPayload: StockDataPayload = {
      name: stockData.name,
      currentPrice: stockData.currentPrice,
      change: stockData.change,
      changePercent: stockData.changePercent,
      dayHigh: stockData.dayHigh,
      dayLow: stockData.dayLow,
      volume: stockData.volume,
      sharpeRatio: stockData.sharpeRatio,
      trend: stockData.trend,
    };

    const effectiveChair = customChairInput.trim() || chairModelId;
    setShowCouncilPanel(true);
    setAiActiveTab('council');
    runDebate(analysts, stockPayload, stockData.symbol, effectiveChair);
  }, [stockData, selectedCouncilModels, chairModelId, customChairInput, AI_MODELS, runDebate]);

  const fetchStockData = useCallback(
    async (searchSymbol: string) => {
      const validSymbol = validateSymbol(searchSymbol);
      if (!validSymbol) {
        setError('Invalid symbol. Please enter 1-10 alphanumeric characters.');
        return;
      }

      if (!rateLimiter.canCall()) {
        setError('Please wait a moment before searching again.');
        return;
      }

      setLoading(true);
      setError(null);
      setShowCouncilPanel(false);
      resetDebate();

      try {
        const response = await fetch(
          `/api/stock/${encodeURIComponent(validSymbol)}`,
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch stock data');
        }

        const data: StockData = await response.json();
        setStockData(data);
        // Add to search history on successful fetch
        addToHistory(data.symbol, data.name);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to fetch data. Please try again.',
        );
      } finally {
        setLoading(false);
      }
    },
    [addToHistory],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      fetchStockData(symbol);
    }
  };

  const handleQuickSelect = (stock: string) => {
    setSymbol(stock);
    fetchStockData(stock);
  };

  const TrendIcon =
    stockData?.trend === 'bullish'
      ? TrendingUp
      : stockData?.trend === 'bearish'
        ? TrendingDown
        : Minus;
  const sharpeInfo = stockData
    ? getSharpeInterpretation(stockData.sharpeRatio)
    : null;

  return (
    <div className="space-y-6">
      {/* Default AI Settings */}
      <div className="fixed top-4 right-4 z-50">
        <div className="relative" ref={settingsPanelRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDefaultAISettings(v => !v)}
            className="h-8 w-8 p-0 border-white/10 bg-background/80 backdrop-blur-sm"
            title="Default AI Settings"
          >
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </Button>
          {showDefaultAISettings && (
            <div className="absolute top-10 right-0 w-72 bg-background border border-border rounded-lg shadow-lg p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Default AI */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Default AI Model</p>
                <p className="text-xs text-muted-foreground">Used for AI Insight and Council summary</p>
                <select
                  value={defaultAI.id}
                  onChange={e => {
                    const m = AI_MODELS.find(x => x.id === e.target.value);
                    if (m) setDefaultAI({ id: m.id, name: m.name });
                  }}
                  className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 text-foreground"
                >
                  {AI_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <Input
                  placeholder="or custom model id..."
                  value={customDefaultInput}
                  onChange={e => setCustomDefaultInput(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => {
                    if (customDefaultInput.trim()) {
                      setDefaultAI({ id: customDefaultInput.trim(), name: customDefaultInput.trim() });
                      setCustomDefaultInput('');
                    }
                    setShowDefaultAISettings(false);
                  }}
                >
                  Save
                </Button>
              </div>

              {/* Preset Management */}
              <div className="space-y-2 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Manage Presets</p>
                  <button
                    onClick={resetToDefaults}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Reset defaults
                  </button>
                </div>

                {/* Model list */}
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {AI_MODELS.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{m.id}</p>
                      </div>
                      <button
                        onClick={() => removeModel(m.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new preset */}
                <div className="space-y-1.5 pt-2 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Add Preset</p>
                  <Input
                    placeholder="Model ID (e.g. anthropic/claude-3-5-sonnet)"
                    value={newPresetId}
                    onChange={e => setNewPresetId(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1">
                    <Input
                      placeholder="Display name"
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      placeholder="Provider"
                      value={newPresetProvider}
                      onChange={e => setNewPresetProvider(e.target.value)}
                      className="h-7 text-xs w-20"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    variant="outline"
                    disabled={!newPresetId.trim() || !newPresetName.trim()}
                    onClick={() => {
                      addModel({
                        id: newPresetId.trim(),
                        name: newPresetName.trim(),
                        provider: newPresetProvider.trim() || 'Custom',
                      });
                      setNewPresetId('');
                      setNewPresetName('');
                      setNewPresetProvider('');
                    }}
                  >
                    Add to presets
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Section */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter stock symbol (e.g., AAPL)"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                className="pl-10 font-mono bg-background/50"
                maxLength={10}
              />
            </div>
            <Button type="submit" disabled={loading || !symbol.trim()}>
              {loading ? <Spinner size="sm" /> : 'Analyze'}
            </Button>
          </form>

          {/* Search History */}
          {history.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mr-1">
                <History className="h-3.5 w-3.5" />
                <span>Recent:</span>
              </div>
              {history.slice(0, 5).map(item => (
                <Button
                  key={item.symbol}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSelect(item.symbol)}
                  disabled={loading}
                  className="font-mono text-xs"
                >
                  {item.symbol}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <div className="flex items-center gap-1 text-sm text-muted-foreground mr-1">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                <span>Watchlist:</span>
              </div>
              {watchlist.map(item => (
                <Button
                  key={item.symbol}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSelect(item.symbol)}
                  disabled={loading}
                  className="font-mono text-xs border-yellow-500/30 hover:border-yellow-500/50"
                >
                  {item.symbol}
                </Button>
              ))}
            </div>
          )}

          {/* Quick Select Buttons */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/30">
            <span className="text-sm text-muted-foreground mr-2">Popular:</span>
            {POPULAR_STOCKS.map(stock => (
              <Button
                key={stock}
                variant="outline"
                size="sm"
                onClick={() => handleQuickSelect(stock)}
                disabled={loading}
                className="font-mono text-xs"
              >
                {stock}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="bg-destructive/10 border-destructive/50">
              <CardContent className="py-3">
                <p className="text-destructive text-sm">{error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex justify-center py-12"
          >
            <Spinner size="lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stock Data Display */}
      <AnimatePresence>
        {stockData && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-6"
          >
            {/* Header Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold">{stockData.symbol}</h2>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          isInWatchlist(stockData.symbol)
                            ? removeFromWatchlist(stockData.symbol)
                            : addToWatchlist(stockData.symbol, stockData.name)
                        }
                        className={`h-8 w-8 ${
                          isInWatchlist(stockData.symbol)
                            ? 'text-yellow-500 hover:text-yellow-600'
                            : 'text-muted-foreground hover:text-yellow-500'
                        }`}
                      >
                        <Star
                          className={`h-5 w-5 ${isInWatchlist(stockData.symbol) ? 'fill-current' : ''}`}
                        />
                      </Button>
                      <Badge
                        variant="outline"
                        className={`${
                          stockData.trend === 'bullish'
                            ? 'border-[#22c55e] text-[#22c55e]'
                            : stockData.trend === 'bearish'
                              ? 'border-[#ef4444] text-[#ef4444]'
                              : 'border-[#eab308] text-[#eab308]'
                        }`}
                      >
                        <TrendIcon className="h-3 w-3 mr-1" />
                        {stockData.trend.charAt(0).toUpperCase() +
                          stockData.trend.slice(1)}
                      </Badge>

                      {/* Unified AI Button */}
                      <div className="ml-2">
                        <Button
                          ref={aiButtonRef}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!showAiDropdown && aiButtonRef.current) {
                              const rect =
                                aiButtonRef.current.getBoundingClientRect();
                              setAiDropdownPos({
                                top: rect.bottom + 8,
                                left: Math.max(0, rect.right - 288),
                              });
                            }
                            setShowAiDropdown(v => !v);
                          }}
                          disabled={!stockData}
                          className="gap-1.5 bg-gradient-to-r from-amber-500/10 to-purple-500/10 border-amber-500/30 hover:border-amber-500/50 text-amber-400"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span className="hidden sm:inline">AI</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>

                        {isMounted && showAiDropdown && createPortal(
                          <div
                            ref={aiPanelRef}
                            className="w-72 bg-background border border-border rounded-lg shadow-lg p-3 space-y-3"
                            style={{
                              position: 'fixed',
                              zIndex: 9999,
                              top: aiDropdownPos.top,
                              left: aiDropdownPos.left,
                            }}
                          >
                            {/* Model selection */}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                                Model
                              </p>
                              <div className="space-y-0.5 max-h-44 overflow-y-auto">
                                {AI_MODELS.map(m => (
                                  <button
                                    key={m.id}
                                    onClick={() => {
                                      setSelectedModel(m);
                                      setCustomModelInput('');
                                    }}
                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                                      selectedModel.id === m.id &&
                                      !customModelInput
                                        ? 'bg-amber-500/10 text-amber-400'
                                        : 'text-foreground/80 hover:bg-muted/50'
                                    }`}
                                  >
                                    <div className="text-left">
                                      <span className="font-medium">
                                        {m.name}
                                      </span>
                                      <span className="text-muted-foreground ml-1.5 text-[10px]">
                                        {m.provider}
                                      </span>
                                    </div>
                                    {selectedModel.id === m.id &&
                                      !customModelInput && (
                                        <Check className="h-3 w-3 text-amber-500 shrink-0" />
                                      )}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-border/50">
                                <Input
                                  placeholder="use custom model..."
                                  value={customModelInput}
                                  onChange={e =>
                                    setCustomModelInput(e.target.value)
                                  }
                                  className="h-7 text-xs border-amber-500/20 bg-transparent placeholder:text-muted-foreground/50"
                                />
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-2 pt-2 border-t border-border/50">
                              {/* AI Insight */}
                              <Button
                                size="sm"
                                className="w-full gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
                                variant="outline"
                                onClick={() => {
                                  fetchAiAnalysis();
                                  setShowAiDropdown(false);
                                }}
                                disabled={aiLoading}
                              >
                                {aiLoading ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <Lightbulb className="h-3.5 w-3.5" />
                                )}
                                AI Insight
                              </Button>

                              {/* AI Council */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  AI Council{' '}
                                  <span className="normal-case font-normal">
                                    (2–5 models)
                                  </span>
                                </p>
                                <div className="grid grid-cols-2 gap-1">
                                  {AI_MODELS.map(m => (
                                    <label
                                      key={m.id}
                                      className="flex items-center gap-1.5 cursor-pointer group"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedCouncilModels.includes(
                                          m.id,
                                        )}
                                        onChange={e => {
                                          if (
                                            e.target.checked &&
                                            selectedCouncilModels.length >= 5
                                          )
                                            return;
                                          setSelectedCouncilModels(prev =>
                                            e.target.checked
                                              ? [...prev, m.id]
                                              : prev.filter(id => id !== m.id),
                                          );
                                        }}
                                        className="rounded border-border"
                                      />
                                      <span className="text-[11px] text-foreground/80 group-hover:text-foreground truncate">
                                        {m.name
                                          .split(' ')
                                          .slice(0, 2)
                                          .join(' ')}
                                      </span>
                                    </label>
                                  ))}
                                </div>

                                {/* Custom council model input */}
                                <div className="flex gap-1 mt-1">
                                  <Input
                                    placeholder="custom model id..."
                                    value={customCouncilInput}
                                    onChange={e =>
                                      setCustomCouncilInput(e.target.value)
                                    }
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') {
                                        const id = customCouncilInput.trim();
                                        if (
                                          id &&
                                          selectedCouncilModels.length < 5 &&
                                          !selectedCouncilModels.includes(id)
                                        ) {
                                          setSelectedCouncilModels(prev => [
                                            ...prev,
                                            id,
                                          ]);
                                          setCustomCouncilInput('');
                                        }
                                      }
                                    }}
                                    className="h-7 text-xs flex-1 border-purple-500/20 bg-transparent placeholder:text-muted-foreground/50"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-purple-500/30 text-purple-300"
                                    disabled={
                                      !customCouncilInput.trim() ||
                                      selectedCouncilModels.length >= 5 ||
                                      selectedCouncilModels.includes(
                                        customCouncilInput.trim(),
                                      )
                                    }
                                    onClick={() => {
                                      const id = customCouncilInput.trim();
                                      if (id) {
                                        setSelectedCouncilModels(prev => [
                                          ...prev,
                                          id,
                                        ]);
                                        setCustomCouncilInput('');
                                      }
                                    }}
                                  >
                                    Add
                                  </Button>
                                </div>

                                {/* Show added custom models */}
                                {selectedCouncilModels
                                  .filter(
                                    id => !AI_MODELS.find(m => m.id === id),
                                  )
                                  .map(id => (
                                    <div
                                      key={id}
                                      className="flex items-center justify-between px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20"
                                    >
                                      <span className="text-[11px] text-purple-300 truncate flex-1">
                                        {id}
                                      </span>
                                      <button
                                        onClick={() =>
                                          setSelectedCouncilModels(prev =>
                                            prev.filter(x => x !== id),
                                          )
                                        }
                                        className="text-muted-foreground hover:text-foreground ml-1 shrink-0"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}

                                {/* Chair model selector */}
                                <div className="space-y-1 mt-2 pt-2 border-t border-border/20">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chair Model</p>
                                  <select
                                    value={chairModelId}
                                    onChange={e => {
                                      setChairModelId(e.target.value);
                                      setCustomChairInput('');
                                    }}
                                    className="w-full text-[11px] bg-muted border border-border rounded px-2 py-1 text-foreground"
                                  >
                                    {AI_MODELS.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                  <Input
                                    placeholder="or custom chair model..."
                                    value={customChairInput}
                                    onChange={e => setCustomChairInput(e.target.value)}
                                    className="h-7 text-xs border-amber-500/20 bg-transparent placeholder:text-muted-foreground/50"
                                  />
                                </div>

                                <Button
                                  size="sm"
                                  className="w-full h-7 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30"
                                  variant="outline"
                                  disabled={selectedCouncilModels.length < 2 || debateState.phase === 'round' || debateState.phase === 'chair'}
                                  onClick={() => {
                                    handleRunDebate();
                                    setShowAiDropdown(false);
                                  }}
                                >
                                  <Users className="h-3.5 w-3.5 mr-1" />
                                  Run Debate ({selectedCouncilModels.length}/5)
                                </Button>
                              </div>
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">
                      {stockData.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold font-mono">
                      ${stockData.currentPrice.toFixed(2)}
                    </p>
                    <p
                      className={`text-sm font-mono ${
                        stockData.change >= 0
                          ? 'text-[#22c55e]'
                          : 'text-[#ef4444]'
                      }`}
                    >
                      {stockData.change >= 0 ? '+' : ''}
                      {stockData.change.toFixed(2)} (
                      {stockData.changePercent >= 0 ? '+' : ''}
                      {stockData.changePercent.toFixed(2)}%)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Merged AI Section */}
            <AnimatePresence>
              {(showAiPanel || showCouncilPanel) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <Card className="bg-gradient-to-br from-amber-500/5 to-purple-500/5 border-amber-500/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
                          <Sparkles className="h-5 w-5 text-amber-500" />
                          AI Analysis
                          {aiActiveTab === 'insight' && aiCacheInfo?.cached && (
                            <Badge
                              variant="outline"
                              className="text-xs border-blue-500/30 text-blue-500"
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              Cached ({aiCacheInfo.expiresIn}m left)
                            </Badge>
                          )}
                        </CardTitle>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Fancy tab switcher — only when both panels are active */}
                          {showAiPanel && showCouncilPanel && (
                            <div className="relative flex items-center bg-muted/40 rounded-lg p-0.5 gap-0">
                              {(
                                ['insight', 'council'] as (
                                  | 'insight'
                                  | 'council'
                                )[]
                              ).map(tab => (
                                <button
                                  key={tab}
                                  onClick={() => setAiActiveTab(tab)}
                                  className="relative px-3 py-1.5 text-xs font-medium rounded-md z-10 transition-colors"
                                >
                                  {aiActiveTab === tab && (
                                    <motion.div
                                      layoutId="ai-tab-bg"
                                      className="absolute inset-0 bg-background rounded-md shadow-sm"
                                      transition={{
                                        type: 'spring',
                                        stiffness: 400,
                                        damping: 30,
                                      }}
                                    />
                                  )}
                                  <span
                                    className={`relative z-10 ${
                                      aiActiveTab === tab
                                        ? 'text-foreground'
                                        : 'text-muted-foreground'
                                    }`}
                                  >
                                    {tab === 'insight'
                                      ? '⚡ AI Insight'
                                      : '🧠 AI Council'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          {aiActiveTab === 'insight' &&
                            aiAnalysis &&
                            !aiLoading && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchAiAnalysis(true)}
                                disabled={aiLoading}
                                className="h-8 text-xs gap-1.5 border-blue-500/30 hover:border-blue-500/50 hover:bg-blue-500/10 text-blue-500"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Recalculate
                              </Button>
                            )}

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setShowAiPanel(false);
                              setShowCouncilPanel(false);
                            }}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      {/* AI Insight tab content */}
                      {showAiPanel &&
                        (!showCouncilPanel || aiActiveTab === 'insight') && (
                          <div>
                            {aiLoading && (
                              <div className="flex items-center justify-center py-8">
                                <div className="flex flex-col items-center gap-3">
                                  <Spinner
                                    size="lg"
                                    className="text-amber-500"
                                  />
                                  <p className="text-sm text-muted-foreground">
                                    Analyzing {stockData.symbol}...
                                  </p>
                                </div>
                              </div>
                            )}
                            {aiError && (
                              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between gap-3">
                                <p className="text-destructive text-sm">
                                  {aiError}
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchAiAnalysis()}
                                  className="shrink-0 h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Retry
                                </Button>
                              </div>
                            )}
                            {aiAnalysis && !aiLoading && (
                              <div className="space-y-6">
                                {/* Score and Prediction Header */}
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                  <div className="flex items-center gap-4">
                                    <div
                                      className={`relative flex items-center justify-center w-20 h-20 rounded-full ${getScoreColor(aiAnalysis.score).bg}/20 border-2 ${getScoreColor(aiAnalysis.score).text.replace('text-', 'border-')}`}
                                    >
                                      <span
                                        className={`text-3xl font-bold font-mono ${getScoreColor(aiAnalysis.score).text}`}
                                      >
                                        {aiAnalysis.score}
                                      </span>
                                      <span
                                        className={`absolute -bottom-1 text-xs font-medium ${getScoreColor(aiAnalysis.score).text}`}
                                      >
                                        /10
                                      </span>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">
                                        Investment Score
                                      </p>
                                      <p
                                        className={`text-lg font-semibold ${getScoreColor(aiAnalysis.score).text}`}
                                      >
                                        {getScoreColor(aiAnalysis.score).label}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-end gap-1">
                                    <div
                                      className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                                        aiAnalysis.prediction === 'UP'
                                          ? 'bg-green-500/10 border border-green-500/30'
                                          : aiAnalysis.prediction === 'DOWN'
                                            ? 'bg-red-500/10 border border-red-500/30'
                                            : 'bg-yellow-500/10 border border-yellow-500/30'
                                      }`}
                                    >
                                      {aiAnalysis.prediction === 'UP' ? (
                                        <ArrowUpCircle className="h-5 w-5 text-green-500" />
                                      ) : aiAnalysis.prediction === 'DOWN' ? (
                                        <ArrowDownCircle className="h-5 w-5 text-red-500" />
                                      ) : (
                                        <Minus className="h-5 w-5 text-yellow-500" />
                                      )}
                                      <span
                                        className={`text-lg font-bold ${
                                          aiAnalysis.prediction === 'UP'
                                            ? 'text-green-500'
                                            : aiAnalysis.prediction === 'DOWN'
                                              ? 'text-red-500'
                                              : 'text-yellow-500'
                                        }`}
                                      >
                                        {aiAnalysis.prediction === 'UP'
                                          ? 'BUY'
                                          : aiAnalysis.prediction === 'DOWN'
                                            ? 'SELL'
                                            : 'HOLD'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Confidence:{' '}
                                      <span className="font-mono font-medium">
                                        {aiAnalysis.confidence}%
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                {/* Analysis Reasons */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <p className="text-sm font-medium text-foreground">
                                      Analysis & Reasoning
                                    </p>
                                  </div>
                                  <ul className="space-y-1.5 pl-4">
                                    {aiAnalysis.reasons.map(
                                      (reason: string, index: number) => (
                                        <li
                                          key={index}
                                          className="text-sm text-foreground/80 flex items-start gap-2"
                                        >
                                          <span className="text-amber-500 mt-1">
                                            •
                                          </span>
                                          <span>{reason}</span>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>

                                {/* BUY STRATEGY */}
                                <div
                                  className={`p-4 rounded-lg border ${
                                    aiAnalysis.bottomFishing.recommended
                                      ? 'bg-cyan-500/5 border-cyan-500/30'
                                      : 'bg-muted/20 border-border/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp
                                      className={`h-4 w-4 ${aiAnalysis.bottomFishing.recommended ? 'text-cyan-500' : 'text-muted-foreground'}`}
                                    />
                                    <p className="text-sm font-medium text-foreground">
                                      BUY STRATEGY
                                    </p>
                                    {aiAnalysis.bottomFishing.recommended && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs border-cyan-500/50 text-cyan-500"
                                      >
                                        Recommended
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="flex items-center gap-2">
                                      <Target className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        Entry Price:
                                      </span>
                                      <span className="text-sm font-mono font-medium text-foreground">
                                        {aiAnalysis.bottomFishing.targetPrice
                                          ? `$${aiAnalysis.bottomFishing.targetPrice.toFixed(2)}`
                                          : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        Timing:
                                      </span>
                                      <span className="text-sm font-medium text-foreground">
                                        {aiAnalysis.bottomFishing.timing}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-2 italic">
                                    {aiAnalysis.bottomFishing.rationale}
                                  </p>
                                </div>

                                {/* SELL STRATEGY */}
                                <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/30">
                                  <div className="flex items-center gap-2 mb-3">
                                    <TrendingDown className="h-4 w-4 text-green-500" />
                                    <p className="text-sm font-medium text-foreground">
                                      SELL STRATEGY
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                    <div className="text-center p-3 rounded-lg bg-green-500/10">
                                      <p className="text-xs text-muted-foreground mb-1">
                                        Expected Rise
                                      </p>
                                      <p className="text-lg font-bold font-mono text-green-500">
                                        +
                                        {aiAnalysis.priceTarget.expectedRise.toFixed(
                                          1,
                                        )}
                                        %
                                      </p>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-green-500/10">
                                      <p className="text-xs text-muted-foreground mb-1">
                                        Target Price
                                      </p>
                                      <p className="text-lg font-bold font-mono text-green-500">
                                        $
                                        {aiAnalysis.priceTarget.targetPrice.toFixed(
                                          2,
                                        )}
                                      </p>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-green-500/10">
                                      <p className="text-xs text-muted-foreground mb-1">
                                        Timeframe
                                      </p>
                                      <p className="text-sm font-semibold text-foreground">
                                        {aiAnalysis.priceTarget.timeframe}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-foreground/80">
                                      <span className="font-medium">
                                        Exit Strategy:
                                      </span>{' '}
                                      {aiAnalysis.priceTarget.exitStrategy}
                                    </p>
                                  </div>
                                </div>

                                {/* Risk Factors */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                    <p className="text-sm font-medium text-foreground">
                                      Risk Factors to Watch
                                    </p>
                                  </div>
                                  <ul className="space-y-1.5 pl-4">
                                    {aiAnalysis.riskFactors.map(
                                      (factor: string, index: number) => (
                                        <li
                                          key={index}
                                          className="text-sm text-foreground/80 flex items-start gap-2"
                                        >
                                          <span className="text-red-500 mt-1">
                                            •
                                          </span>
                                          <span>{factor}</span>
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/30">
                              This analysis is generated by AI and should not be
                              considered financial advice. Always do your own
                              research before making investment decisions.
                            </p>
                          </div>
                        )}

                      {/* AI Council tab content */}
                      {showCouncilPanel &&
                        (!showAiPanel || aiActiveTab === 'council') && (
                          <DebateTheater
                            state={debateState}
                            analysts={selectedCouncilModels.map((id, idx) => {
                              const known = AI_MODELS.find(m => m.id === id);
                              return {
                                id,
                                name: known?.name ?? id,
                                role: DEBATE_ROLES[idx % DEBATE_ROLES.length],
                              };
                            })}
                            chairModelName={customChairInput.trim() || chairModelId}
                          />
                        )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* RSI Indicator Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5" />
                  RSI (14-Day)
                  {rsiData && (
                    <Badge
                      variant="outline"
                      className={`ml-2 ${
                        rsiData.signal === 'Overbought'
                          ? 'border-red-500 text-red-500'
                          : rsiData.signal === 'Oversold'
                            ? 'border-green-500 text-green-500'
                            : rsiData.signal === 'Bullish'
                              ? 'border-green-500/70 text-green-500'
                              : rsiData.signal === 'Bearish'
                                ? 'border-red-500/70 text-red-500'
                                : 'border-yellow-500 text-yellow-500'
                      }`}
                    >
                      {rsiData.signal}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {indicatorsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="md" />
                  </div>
                ) : rsiData ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p
                          className={`text-4xl font-bold font-mono ${
                            rsiData.value >= 70
                              ? 'text-red-500'
                              : rsiData.value <= 30
                                ? 'text-green-500'
                                : rsiData.value >= 60
                                  ? 'text-green-500/80'
                                  : rsiData.value <= 40
                                    ? 'text-red-500/80'
                                    : 'text-yellow-500'
                          }`}
                        >
                          {rsiData.value.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rsiData.value >= 70
                            ? 'Consider selling - stock may be overvalued'
                            : rsiData.value <= 30
                              ? 'Consider buying - stock may be undervalued'
                              : rsiData.value >= 60
                                ? 'Bullish momentum'
                                : rsiData.value <= 40
                                  ? 'Bearish momentum'
                                  : 'Neutral territory'}
                        </p>
                      </div>
                      <div className="w-32 h-32">
                        <svg
                          viewBox="0 0 100 100"
                          className="w-full h-full -rotate-90"
                        >
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            className="text-muted/20"
                          />
                          <motion.circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke={
                              rsiData.value >= 70
                                ? '#ef4444'
                                : rsiData.value <= 30
                                  ? '#22c55e'
                                  : rsiData.value >= 60
                                    ? '#22c55e'
                                    : rsiData.value <= 40
                                      ? '#ef4444'
                                      : '#eab308'
                            }
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(rsiData.value / 100) * 251.2} 251.2`}
                            initial={{ strokeDasharray: '0 251.2' }}
                            animate={{
                              strokeDasharray: `${(rsiData.value / 100) * 251.2} 251.2`,
                            }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                          />
                        </svg>
                      </div>
                    </div>

                    {/* RSI Scale */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground font-mono">
                        <span>0</span>
                        <span className="text-green-500">30</span>
                        <span>50</span>
                        <span className="text-red-500">70</span>
                        <span>100</span>
                      </div>
                      <div className="h-2 bg-muted/20 rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 flex">
                          <div className="w-[30%] bg-green-500/30" />
                          <div className="w-[40%] bg-yellow-500/30" />
                          <div className="w-[30%] bg-red-500/30" />
                        </div>
                        <motion.div
                          className="absolute top-0 h-full w-1 bg-white rounded-full shadow-lg"
                          initial={{ left: '0%' }}
                          animate={{ left: `${rsiData.value}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          style={{ transform: 'translateX(-50%)' }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-green-500">Oversold</span>
                        <span className="text-yellow-500">Neutral</span>
                        <span className="text-red-500">Overbought</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    RSI data unavailable
                  </p>
                )}
              </CardContent>
            </Card>

            {/* MACD Indicator Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  MACD (12, 26, 9)
                  {macdData && (
                    <Badge
                      variant="outline"
                      className={`ml-2 ${
                        macdData.trend === 'Bullish'
                          ? 'border-green-500 text-green-500'
                          : macdData.trend === 'Bearish'
                            ? 'border-red-500 text-red-500'
                            : 'border-yellow-500 text-yellow-500'
                      }`}
                    >
                      {macdData.trend}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {indicatorsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="md" />
                  </div>
                ) : macdData ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          MACD Line
                        </p>
                        <p
                          className={`text-xl font-bold font-mono ${
                            macdData.macd >= 0
                              ? 'text-green-500'
                              : 'text-red-500'
                          }`}
                        >
                          {macdData.macd >= 0 ? '+' : ''}
                          {macdData.macd.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Signal Line
                        </p>
                        <p
                          className={`text-xl font-bold font-mono ${
                            macdData.signal >= 0
                              ? 'text-green-500'
                              : 'text-red-500'
                          }`}
                        >
                          {macdData.signal >= 0 ? '+' : ''}
                          {macdData.signal.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Histogram
                        </p>
                        <p
                          className={`text-xl font-bold font-mono ${
                            macdData.histogram >= 0
                              ? 'text-green-500'
                              : 'text-red-500'
                          }`}
                        >
                          {macdData.histogram >= 0 ? '+' : ''}
                          {macdData.histogram.toFixed(4)}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                      {macdData.histogram > 0 && macdData.macd > macdData.signal
                        ? 'Bullish momentum - MACD above signal line'
                        : macdData.histogram < 0 &&
                            macdData.macd < macdData.signal
                          ? 'Bearish momentum - MACD below signal line'
                          : macdData.histogram > 0
                            ? 'Momentum shifting bullish'
                            : 'Momentum shifting bearish'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    MACD data unavailable
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Candlestick Chart */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" />
                  5-Day Price Chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CandlestickChart data={stockData.ohlc} />
              </CardContent>
            </Card>

            {/* Stock News Section */}
            <StockNews symbol={stockData.symbol} />

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Day High</p>
                  <p className="text-xl font-bold font-mono text-[#22c55e]">
                    ${stockData.dayHigh.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Day Low</p>
                  <p className="text-xl font-bold font-mono text-[#ef4444]">
                    ${stockData.dayLow.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Volume</p>
                  <p className="text-xl font-bold font-mono">
                    {formatVolume(stockData.volume)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W High</p>
                  <p className="text-xl font-bold font-mono text-[#22c55e]">
                    ${stockData.fiftyTwoWeekHigh.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W Low</p>
                  <p className="text-xl font-bold font-mono text-[#ef4444]">
                    ${stockData.fiftyTwoWeekLow.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">52W Range</p>
                  <div className="mt-2">
                    <div className="h-2 bg-muted/20 rounded-full overflow-hidden relative">
                      <div
                        className="absolute h-full bg-gradient-to-r from-[#ef4444] via-[#eab308] to-[#22c55e] rounded-full"
                        style={{ width: '100%' }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white rounded-full border-2 border-foreground"
                        style={{
                          left: `${Math.min(Math.max(((stockData.currentPrice - stockData.fiftyTwoWeekLow) / (stockData.fiftyTwoWeekHigh - stockData.fiftyTwoWeekLow)) * 100, 0), 100)}%`,
                          transform: 'translateX(-50%) translateY(-50%)',
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sharpe Ratio Section */}
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  5-Day Sharpe Ratio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-4xl font-bold font-mono"
                      style={{ color: sharpeInfo?.color }}
                    >
                      {stockData.sharpeRatio.toFixed(2)}
                    </p>
                    <Badge
                      variant="outline"
                      className="mt-2"
                      style={{
                        borderColor: sharpeInfo?.color,
                        color: sharpeInfo?.color,
                      }}
                    >
                      {sharpeInfo?.label}
                    </Badge>
                  </div>
                  <div className="w-32 h-32">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-full h-full -rotate-90"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted/20"
                      />
                      <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke={sharpeInfo?.color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${Math.min(Math.max((stockData.sharpeRatio + 1) / 3, 0), 1) * 251.2} 251.2`}
                        initial={{ strokeDasharray: '0 251.2' }}
                        animate={{
                          strokeDasharray: `${Math.min(Math.max((stockData.sharpeRatio + 1) / 3, 0), 1) * 251.2} 251.2`,
                        }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </svg>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>-1.0</span>
                    <span>0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                    <span>2.0+</span>
                  </div>
                  <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: sharpeInfo?.color }}
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(Math.max(((stockData.sharpeRatio + 1) / 3) * 100, 0), 100)}%`,
                      }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  {sharpeInfo?.description}
                </p>
              </CardContent>
            </Card>

            {/* Info Section */}
            <Card className="bg-muted/20 border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">
                      About Sharpe Ratio
                    </p>
                    <p>
                      The Sharpe Ratio measures risk-adjusted return. It&apos;s
                      calculated as: (Average Return - Risk Free Rate) /
                      Standard Deviation &times; &radic;252. A higher ratio
                      indicates better risk-adjusted performance. The 5-day
                      calculation provides a short-term trend indicator.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
