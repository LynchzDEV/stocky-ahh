"use client";

import { useState, useEffect, useCallback } from "react";
import type { SearchHistoryItem } from "@/lib/types";

const STORAGE_KEY = "stockify-search-history";
const MAX_ITEMS = 10;

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      console.error("Failed to load search history");
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever history changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      } catch {
        console.error("Failed to save search history");
      }
    }
  }, [history, isLoaded]);

  const addToHistory = useCallback((symbol: string, name: string) => {
    setHistory((prev) => {
      // Remove existing entry for this symbol
      const filtered = prev.filter((item) => item.symbol !== symbol);
      // Add new entry at the beginning
      const newHistory = [
        { symbol, name, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_ITEMS);
      return newHistory;
    });
  }, []);

  const removeFromHistory = useCallback((symbol: string) => {
    setHistory((prev) => prev.filter((item) => item.symbol !== symbol));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
    isLoaded,
  };
}
