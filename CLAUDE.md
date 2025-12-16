# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

stocky-ahh is a stock trend analyzer and currency converter built with Next.js 16, React 19, and Tailwind CSS v4. It provides real-time stock analysis with AI-powered investment insights via OpenRouter.

## Common Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build (uses standalone output)
npm run lint     # Run ESLint
npm start        # Start production server
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **UI**: React 19, Tailwind CSS v4, Radix UI primitives
- **Animation**: Framer Motion
- **AI**: OpenRouter API (supports multiple models: Gemini, GPT, Grok, Qwen, DeepSeek)

### Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── stock/[symbol]/ # Stock data from Yahoo Finance
│   │   │   └── news/       # Stock news from Alpha Vantage
│   │   ├── exchange/       # USD/THB exchange rates
│   │   ├── market/         # Market overview data
│   │   └── ai/             # AI analysis endpoint (OpenRouter)
│   ├── layout.tsx          # Root layout with metadata/CSP
│   └── page.tsx            # Main entry point
├── components/
│   ├── features/           # Business logic components (StockAnalyzer, StockNews, CurrencyConverter, CandlestickChart)
│   └── ui/                 # Reusable UI components (Button, Card, Input, etc.)
├── hooks/                  # Custom hooks (useSearchHistory, useWatchlist)
└── lib/
    ├── types.ts            # TypeScript interfaces (StockData, OHLCData, NewsItem, etc.)
    ├── utils.ts            # Utility functions (cn for class merging)
    └── validation.ts       # Input validation and rate limiting
```

### Key Patterns

**API Routes**: All external API calls go through Next.js API routes with:
- Input validation via `validateSymbol()` in `src/lib/validation.ts`
- Rate limiting (30 req/min for stock API, 1hr cache for AI analysis)
- Error handling with typed responses

**State Management**: Local React state with custom hooks for persistence:
- `useSearchHistory` - localStorage-backed search history
- `useWatchlist` - localStorage-backed stock watchlist

**AI Integration**: The `/api/ai` route sends stock data to OpenRouter with:
- Model selection (configurable via `AI_MODELS` in stock-analyzer.tsx)
- 1-hour in-memory caching per symbol
- Structured JSON response parsing with fallback

### Path Aliases
Use `@/*` to import from `src/*` (configured in tsconfig.json).

## Environment Variables

Copy `.env.example` to `.env.local`:
- `OPENROUTER_API_KEY` - Required for AI analysis features
- `ALPHA_VANTAGE_API_KEY` - Required for technical indicators (RSI, MACD) and AI-enhanced data
- `FINNHUB_API_KEY` - Required for stock news (60 calls/min free tier)
- `NEXT_PUBLIC_APP_URL` - Optional, for OpenRouter referer header

## External APIs

- **Yahoo Finance**: Stock quotes via `query1.finance.yahoo.com` (60s cache)
- **Finnhub**: Stock news via `finnhub.io` (10min cache, 60 calls/min free tier)
- **Alpha Vantage**: Technical indicators (RSI, MACD) and fundamentals for AI analysis (15min cache)
- **ExchangeRate API**: `api.exchangerate-api.com` for USD/THB rates
- **OpenRouter**: AI analysis with multiple model support
