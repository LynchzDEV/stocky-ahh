"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OHLCData } from "@/lib/types";

interface CandlestickChartProps {
  data: OHLCData[];
}

interface TooltipData {
  x: number;
  y: number;
  data: OHLCData;
}

export function CandlestickChart({ data }: CandlestickChartProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const chartConfig = useMemo(() => {
    if (data.length === 0) return null;

    const padding = { top: 20, right: 60, bottom: 40, left: 20 };
    const width = 500;
    const height = 250;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find min and max prices for scaling
    const allPrices = data.flatMap((d) => [d.high, d.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;

    const yMin = minPrice - pricePadding;
    const yMax = maxPrice + pricePadding;
    const yRange = yMax - yMin;

    const candleWidth = chartWidth / data.length * 0.6;
    const candleSpacing = chartWidth / data.length;

    const scaleY = (price: number): number => {
      return chartHeight - ((price - yMin) / yRange) * chartHeight + padding.top;
    };

    const scaleX = (index: number): number => {
      return padding.left + candleSpacing * index + candleSpacing / 2;
    };

    // Generate Y-axis labels
    const yLabels: { value: number; y: number }[] = [];
    const labelCount = 5;
    for (let i = 0; i <= labelCount; i++) {
      const value = yMin + (yRange / labelCount) * i;
      yLabels.push({
        value: Math.round(value * 100) / 100,
        y: scaleY(value),
      });
    }

    return {
      width,
      height,
      padding,
      chartWidth,
      chartHeight,
      candleWidth,
      candleSpacing,
      scaleX,
      scaleY,
      yLabels,
      yMin,
      yMax,
    };
  }, [data]);

  if (!chartConfig || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
        className="w-full h-auto"
        style={{ maxHeight: "300px" }}
      >
        {/* Grid lines */}
        {chartConfig.yLabels.map((label, i) => (
          <line
            key={i}
            x1={chartConfig.padding.left}
            y1={label.y}
            x2={chartConfig.width - chartConfig.padding.right}
            y2={label.y}
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="4"
          />
        ))}

        {/* Y-axis labels */}
        {chartConfig.yLabels.map((label, i) => (
          <text
            key={i}
            x={chartConfig.width - chartConfig.padding.right + 8}
            y={label.y + 4}
            fill="#a1a1aa"
            fontSize="10"
            fontFamily="var(--font-jetbrains-mono)"
          >
            ${label.value.toFixed(2)}
          </text>
        ))}

        {/* Candlesticks */}
        {data.map((candle, index) => {
          const x = chartConfig.scaleX(index);
          const isBullish = candle.close >= candle.open;
          const color = isBullish ? "#22c55e" : "#ef4444";

          const openY = chartConfig.scaleY(candle.open);
          const closeY = chartConfig.scaleY(candle.close);
          const highY = chartConfig.scaleY(candle.high);
          const lowY = chartConfig.scaleY(candle.low);

          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.abs(closeY - openY);

          return (
            <motion.g
              key={index}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              style={{ transformOrigin: `${x}px ${chartConfig.height}px` }}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
                if (rect) {
                  setTooltip({
                    x: x,
                    y: bodyTop - 10,
                    data: candle,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              className="cursor-pointer"
            >
              {/* Wick */}
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth={2}
              />

              {/* Body */}
              <rect
                x={x - chartConfig.candleWidth / 2}
                y={bodyTop}
                width={chartConfig.candleWidth}
                height={Math.max(bodyHeight, 2)}
                fill={isBullish ? color : color}
                stroke={color}
                strokeWidth={1}
                rx={2}
              />

              {/* Hover highlight */}
              <rect
                x={x - chartConfig.candleWidth / 2 - 5}
                y={highY - 5}
                width={chartConfig.candleWidth + 10}
                height={lowY - highY + 10}
                fill="transparent"
                className="hover:fill-white/5 transition-colors"
              />
            </motion.g>
          );
        })}

        {/* X-axis labels */}
        {data.map((candle, index) => (
          <text
            key={index}
            x={chartConfig.scaleX(index)}
            y={chartConfig.height - 10}
            fill="#a1a1aa"
            fontSize="11"
            textAnchor="middle"
            fontFamily="var(--font-jetbrains-mono)"
          >
            {candle.date}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute pointer-events-none z-10"
            style={{
              left: `${(tooltip.x / chartConfig.width) * 100}%`,
              top: `${(tooltip.y / chartConfig.height) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs font-mono">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Open:</span>
                <span className="text-right">${tooltip.data.open.toFixed(2)}</span>
                <span className="text-muted-foreground">High:</span>
                <span className="text-right text-[#22c55e]">${tooltip.data.high.toFixed(2)}</span>
                <span className="text-muted-foreground">Low:</span>
                <span className="text-right text-[#ef4444]">${tooltip.data.low.toFixed(2)}</span>
                <span className="text-muted-foreground">Close:</span>
                <span className="text-right">${tooltip.data.close.toFixed(2)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
