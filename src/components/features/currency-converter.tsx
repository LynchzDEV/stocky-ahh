"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, ArrowUpDown, Info, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { validateAmount } from "@/lib/validation";
import type { ExchangeRate } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";

const QUICK_AMOUNTS = [1, 10, 50, 100, 500, 1000];

export function CurrencyConverter() {
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usdAmount, setUsdAmount] = useState("");
  const [thbAmount, setThbAmount] = useState("");
  const [isSwapped, setIsSwapped] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchExchangeRate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exchange");

      if (!response.ok) {
        throw new Error("Failed to fetch exchange rate");
      }

      const data: ExchangeRate = await response.json();
      setExchangeRate(data);
      setLastFetch(new Date());

      // Update conversion if there's an amount
      if (usdAmount && !isSwapped) {
        const validated = validateAmount(usdAmount);
        setThbAmount((validated * data.rate).toFixed(2));
      } else if (thbAmount && isSwapped) {
        const validated = validateAmount(thbAmount);
        setUsdAmount((validated / data.rate).toFixed(2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fetch exchange rate");
    } finally {
      setLoading(false);
    }
  }, [usdAmount, thbAmount, isSwapped]);

  useEffect(() => {
    fetchExchangeRate();
    // Refresh every 5 minutes
    const interval = setInterval(fetchExchangeRate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleUsdChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = sanitized.split(".");
    const formatted = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized;

    setUsdAmount(formatted);

    if (exchangeRate && formatted) {
      const validated = validateAmount(formatted);
      setThbAmount((validated * exchangeRate.rate).toFixed(2));
    } else {
      setThbAmount("");
    }
  };

  const handleThbChange = (value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    const parts = sanitized.split(".");
    const formatted = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized;

    setThbAmount(formatted);

    if (exchangeRate && formatted) {
      const validated = validateAmount(formatted);
      setUsdAmount((validated / exchangeRate.rate).toFixed(2));
    } else {
      setUsdAmount("");
    }
  };

  const handleSwap = () => {
    setIsSwapped(!isSwapped);
    const tempUsd = usdAmount;
    const tempThb = thbAmount;
    setUsdAmount(tempThb);
    setThbAmount(tempUsd);
  };

  const handleQuickAmount = (amount: number) => {
    if (!isSwapped) {
      setUsdAmount(amount.toString());
      if (exchangeRate) {
        setThbAmount((amount * exchangeRate.rate).toFixed(2));
      }
    } else {
      setThbAmount(amount.toString());
      if (exchangeRate) {
        setUsdAmount((amount / exchangeRate.rate).toFixed(2));
      }
    }
  };

  const formatLastUpdated = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Exchange Rate Card */}
      <Card className="bg-gradient-to-br from-[#3b82f6]/10 to-[#8b5cf6]/10 border-[#3b82f6]/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Exchange Rate</p>
              {loading && !exchangeRate ? (
                <Spinner size="lg" className="mt-2" />
              ) : (
                <>
                  <p className="text-4xl font-bold font-mono mt-1">
                    {exchangeRate?.rate.toFixed(4)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">1 USD = {exchangeRate?.rate.toFixed(2)} THB</p>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchExchangeRate}
              disabled={loading}
              className="h-10 w-10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {lastFetch && (
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last updated: {formatLastUpdated(exchangeRate?.lastUpdated || lastFetch.toISOString())}</span>
            </div>
          )}
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

      {/* Converter */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Currency Converter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <motion.div
            className="space-y-4"
            animate={{ flexDirection: isSwapped ? "column-reverse" : "column" }}
            transition={{ duration: 0.3 }}
          >
            {/* USD Input */}
            <div className={`space-y-2 ${isSwapped ? "order-2" : "order-1"}`}>
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="text-lg">🇺🇸</span> USD
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={isSwapped ? thbAmount : usdAmount}
                  onChange={(e) =>
                    isSwapped ? handleThbChange(e.target.value) : handleUsdChange(e.target.value)
                  }
                  className="pl-8 font-mono text-lg bg-background/50"
                />
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                onClick={handleSwap}
                className="h-10 w-10 rounded-full hover:rotate-180 transition-transform duration-300"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>

            {/* THB Input */}
            <div className={`space-y-2 ${isSwapped ? "order-1" : "order-2"}`}>
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="text-lg">🇹🇭</span> THB
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">฿</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={isSwapped ? usdAmount : thbAmount}
                  onChange={(e) =>
                    isSwapped ? handleUsdChange(e.target.value) : handleThbChange(e.target.value)
                  }
                  className="pl-8 font-mono text-lg bg-background/50"
                />
              </div>
            </div>
          </motion.div>

          {/* Quick Amount Buttons */}
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground mb-3">Quick amounts {isSwapped ? "(THB)" : "(USD)"}:</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAmount(amount)}
                  className="font-mono text-xs"
                >
                  {isSwapped ? "฿" : "$"}{amount.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="bg-muted/20 border-border/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">About Thai Baht (THB)</p>
              <p>
                The Thai Baht (฿) is the official currency of Thailand. It&apos;s one of the most
                traded currencies in Southeast Asia. Exchange rates are updated every 5 minutes
                from live market data. The rate shown is for reference only and may differ from
                actual exchange rates offered by banks or money changers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
