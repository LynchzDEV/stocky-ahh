"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

type MarketState = "open" | "closed" | "pre-market" | "after-hours";

interface MarketStatusInfo {
  state: MarketState;
  label: string;
  nextEvent: string;
  nextEventTime: string;
}

function getUSEasternTime(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
}

function getMarketStatus(): MarketStatusInfo {
  const now = getUSEasternTime();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Market times in minutes from midnight (ET)
  const preMarketOpen = 4 * 60; // 4:00 AM
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  const afterHoursClose = 20 * 60; // 8:00 PM

  // Weekend check
  if (day === 0 || day === 6) {
    const daysUntilMonday = day === 0 ? 1 : 2;
    return {
      state: "closed",
      label: "Weekend",
      nextEvent: "Opens",
      nextEventTime: `Mon 9:30 AM ET`,
    };
  }

  // Pre-market: 4:00 AM - 9:30 AM
  if (currentMinutes >= preMarketOpen && currentMinutes < marketOpen) {
    const minsUntilOpen = marketOpen - currentMinutes;
    const h = Math.floor(minsUntilOpen / 60);
    const m = minsUntilOpen % 60;
    return {
      state: "pre-market",
      label: "Pre-Market",
      nextEvent: "Opens in",
      nextEventTime: h > 0 ? `${h}h ${m}m` : `${m}m`,
    };
  }

  // Market open: 9:30 AM - 4:00 PM
  if (currentMinutes >= marketOpen && currentMinutes < marketClose) {
    const minsUntilClose = marketClose - currentMinutes;
    const h = Math.floor(minsUntilClose / 60);
    const m = minsUntilClose % 60;
    return {
      state: "open",
      label: "Market Open",
      nextEvent: "Closes in",
      nextEventTime: h > 0 ? `${h}h ${m}m` : `${m}m`,
    };
  }

  // After-hours: 4:00 PM - 8:00 PM
  if (currentMinutes >= marketClose && currentMinutes < afterHoursClose) {
    return {
      state: "after-hours",
      label: "After Hours",
      nextEvent: "Opens",
      nextEventTime: "9:30 AM ET",
    };
  }

  // Market closed
  return {
    state: "closed",
    label: "Closed",
    nextEvent: "Opens",
    nextEventTime: day === 5 ? "Mon 9:30 AM ET" : "9:30 AM ET",
  };
}

export function MarketStatus() {
  const [status, setStatus] = useState<MarketStatusInfo | null>(null);

  useEffect(() => {
    // Initial status
    setStatus(getMarketStatus());

    // Update every minute
    const interval = setInterval(() => {
      setStatus(getMarketStatus());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const stateColors: Record<MarketState, string> = {
    open: "bg-green-500/20 text-green-500 border-green-500/30",
    closed: "bg-red-500/20 text-red-500 border-red-500/30",
    "pre-market": "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    "after-hours": "bg-blue-500/20 text-blue-500 border-blue-500/30",
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`${stateColors[status.state]} text-xs`}>
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
            status.state === "open" ? "bg-green-500 animate-pulse" :
            status.state === "pre-market" ? "bg-yellow-500" :
            status.state === "after-hours" ? "bg-blue-500" : "bg-red-500"
          }`}
        />
        {status.label}
      </Badge>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {status.nextEvent} {status.nextEventTime}
      </span>
    </div>
  );
}
