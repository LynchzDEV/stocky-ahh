'use client';
import { useState, useEffect } from 'react';

export interface AiModel {
  id: string;
  name: string;
  provider: string;
  badge?: string;
}

export const DEFAULT_AI_MODELS: AiModel[] = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', badge: 'Default' },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', provider: 'OpenAI' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', provider: 'xAI' },
  { id: 'qwen/qwen3-vl-8b-instruct', name: 'Qwen3 VL 8B', provider: 'Qwen' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', provider: 'Qwen' },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'OpenAI' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek V3.1', provider: 'DeepSeek' },
  { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'Google' },
];

const STORAGE_KEY = 'stockify:aiModels';

export function useAiModels() {
  const [models, setModels] = useState<AiModel[]>(DEFAULT_AI_MODELS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setModels(JSON.parse(stored));
    } catch {}
  }, []);

  const persist = (next: AiModel[]) => {
    setModels(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const addModel = (model: AiModel) => {
    persist([...models, model]);
  };

  const removeModel = (id: string) => {
    persist(models.filter(m => m.id !== id));
  };

  const resetToDefaults = () => {
    setModels(DEFAULT_AI_MODELS);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return { models, addModel, removeModel, resetToDefaults };
}
