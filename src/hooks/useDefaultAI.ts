"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "stockify:defaultAI";
export const DEFAULT_AI = { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" };

export function useDefaultAI() {
  const [defaultAI, setDefaultAIState] = useState(DEFAULT_AI);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setDefaultAIState(JSON.parse(stored));
    } catch {}
  }, []);

  const setDefaultAI = (ai: { id: string; name: string }) => {
    setDefaultAIState(ai);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ai));
    } catch {}
  };

  return { defaultAI, setDefaultAI };
}
