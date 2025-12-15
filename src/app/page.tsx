"use client";

import { motion } from "framer-motion";
import { BarChart3, ArrowRightLeft, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockAnalyzer } from "@/components/features/stock-analyzer";
import { CurrencyConverter } from "@/components/features/currency-converter";
import { MarketStatus } from "@/components/features/market-status";
import { MarketOverview } from "@/components/features/market-overview";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6]">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Stockify</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Stock Trend Analyzer</p>
              </div>
            </div>
            <MarketStatus />
          </div>
        </div>
        {/* Market Overview Ticker */}
        <div className="border-t border-border/30 bg-background/50">
          <div className="container mx-auto px-4 py-2">
            <MarketOverview />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Tabs defaultValue="stock" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
              <TabsTrigger value="stock" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Stock Analyzer</span>
                <span className="sm:hidden">Stocks</span>
              </TabsTrigger>
              <TabsTrigger value="currency" className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                <span className="hidden sm:inline">USD ⇄ THB</span>
                <span className="sm:hidden">Currency</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-0">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="max-w-3xl mx-auto">
                  <StockAnalyzer />
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="currency" className="mt-0">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="max-w-xl mx-auto">
                  <CurrencyConverter />
                </div>
              </motion.div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">Stockify</span> - Stock Trend Analyzer
              </p>
              <p className="text-xs text-center md:text-right">
                This is not financial advice. Data is provided for informational purposes only.
                <br className="hidden md:block" />
                Always consult a qualified financial advisor before making investment decisions.
              </p>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t border-border/30 text-xs text-muted-foreground">
              <p>
                Made by{" "}
                <a
                  href="https://github.com/lynchzdev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground font-medium hover:text-primary transition-colors"
                >
                  lynchz
                </a>
              </p>
              <p>&copy; {new Date().getFullYear()} lynchz. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
