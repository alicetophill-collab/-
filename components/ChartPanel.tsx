import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { CandleData, SignalType } from '../types';

interface Props {
  data: CandleData[];
  lastPrice?: number;
}

export const ChartPanel: React.FC<Props> = ({ data, lastPrice }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // --- INITIALIZE CHART ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#2B2B43',
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
        scaleMargins: {
            top: 0.1,
            bottom: 0.1,
        }
      },
      crosshair: {
        mode: 1, // Normal mode
        vertLine: {
             width: 1,
             color: 'rgba(224, 227, 235, 0.1)',
             style: 0,
        },
        horzLine: {
             width: 1,
             color: 'rgba(224, 227, 235, 0.1)',
             style: 0,
        },
      }
    });

    // Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle Resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // --- UPDATE DATA ---
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    // Map data to Lightweight Charts format
    // Time must be in seconds
    const chartData = data.map(d => ({
      time: (d.timestamp / 1000) as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    // Remove duplicates just in case (chart errors if timestamps are not unique/ascending)
    const uniqueData = chartData.filter((v, i, a) => 
        i === 0 || v.time > a[i - 1].time
    );

    // Update Series
    candleSeriesRef.current.setData(uniqueData);

    // --- MARKERS (SIGNALS) ---
    const markers: any[] = [];
    data.forEach(d => {
        if (d.signal === SignalType.BUY) {
            markers.push({
                time: d.timestamp / 1000,
                position: 'belowBar',
                color: '#26a69a',
                shape: 'arrowUp',
                text: 'DIP ENTRY',
                size: 2
            });
        } else if (d.signal === SignalType.DCA) {
            markers.push({
                time: d.timestamp / 1000,
                position: 'belowBar',
                color: '#3b82f6',
                shape: 'arrowUp',
                text: 'DCA',
                size: 2
            });
        } else if (d.signal === SignalType.SELL) {
            markers.push({
                time: d.timestamp / 1000,
                position: 'aboveBar',
                color: '#ef5350',
                shape: 'arrowDown',
                text: 'EXIT',
                size: 2
            });
        }
    });
    candleSeriesRef.current.setMarkers(markers);
    
  }, [data]);

  return (
    <div className="w-full h-full relative group">
        <div ref={chartContainerRef} className="w-full h-[500px] rounded-xl overflow-hidden shadow-2xl border border-[#2B2B43]" />
        
        {/* Overlay Info */}
        <div className="absolute top-3 left-4 z-10 pointer-events-none select-none">
            <h3 className="text-[#d1d4dc] font-bold text-sm tracking-wider flex items-center gap-2">
               HEIKIN ASHI <span className="text-blue-400">DIP HUNTER + DCA</span>
            </h3>
            {lastPrice && (
                 <div className="text-2xl font-mono font-bold mt-1 text-white">
                    {lastPrice.toFixed(4)}
                 </div>
            )}
        </div>
    </div>
  );
};