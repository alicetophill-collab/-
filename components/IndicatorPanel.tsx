import React from 'react';
import { SignalType, CONSTANTS } from '../types';
import { ArrowUpCircle, ArrowDownCircle, Activity, TrendingDown, Layers } from 'lucide-react';

interface Props {
  currentSignal: SignalType;
  tickCount: number;
  lastPrice: number;
  candleCount: number;
  maxTicks: number;
  avgBodySize: number;
  currentBodySize: number;
  activeTrade: any; // Using any for simplicity in props, typed in parent
}

export const IndicatorPanel: React.FC<Props> = ({ 
  currentSignal, 
  tickCount, 
  lastPrice, 
  candleCount, 
  maxTicks,
  avgBodySize,
  currentBodySize,
  activeTrade
}) => {
  
  const getSignalColor = () => {
    switch (currentSignal) {
      case SignalType.BUY: return 'bg-emerald-500/20 border-emerald-500 text-emerald-400';
      case SignalType.DCA: return 'bg-blue-500/20 border-blue-500 text-blue-400';
      case SignalType.SELL: return 'bg-rose-500/20 border-rose-500 text-rose-400';
      default: return 'bg-slate-800 border-slate-700 text-slate-400';
    }
  };

  const progress = (tickCount / maxTicks) * 100;
  
  // Calculate Impulse Multiplier (Using Raw Body)
  const multiplier = avgBodySize > 0 ? (currentBodySize / avgBodySize) : 0;
  const isImpulse = multiplier >= CONSTANTS.IMPULSE_THRESHOLD;

  // DCA Info
  let drawdown = 0;
  let target = 0;
  
  if (activeTrade) {
      drawdown = ((lastPrice - activeTrade.avgPrice) / activeTrade.avgPrice) * 100;
      if (activeTrade.stage === 1) {
          target = activeTrade.avgPrice * CONSTANTS.TP_STAGE_1;
      } else {
          target = activeTrade.avgPrice * CONSTANTS.TP_STAGE_2;
      }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Signal Card */}
      <div className={`p-6 rounded-xl border-2 flex items-center justify-between ${getSignalColor()} transition-colors duration-300`}>
        <div>
          <h2 className="text-sm uppercase font-bold tracking-wider opacity-70">Status</h2>
          <div className="text-3xl font-black mt-1 flex items-center gap-2">
            {currentSignal}
            {currentSignal === SignalType.BUY && <ArrowUpCircle size={32} />}
            {currentSignal === SignalType.DCA && <Layers size={32} />}
            {currentSignal === SignalType.SELL && <ArrowDownCircle size={32} />}
            {currentSignal === SignalType.WAIT && <Activity size={32} />}
          </div>
        </div>
        <div className="text-right">
           <div className="text-xs opacity-60">Strategy</div>
           <div className="font-semibold text-blue-400">HYBRID IMPULSE</div>
        </div>
      </div>

      {/* Active Trade / Candle Info */}
      <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 relative overflow-hidden">
        {activeTrade ? (
            <div className="relative z-10 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-sm text-slate-400 font-medium">Stage</h2>
                        <div className="text-2xl font-bold text-white flex items-center gap-2">
                            {activeTrade.stage} <span className="text-slate-500 text-lg">/ 2</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <h2 className="text-sm text-slate-400 font-medium">Drawdown</h2>
                        <div className={`text-xl font-bold font-mono ${drawdown < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {drawdown > 0 ? '+' : ''}{drawdown.toFixed(2)}%
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                   Exit: HA Red Candle or {target.toFixed(4)}
                </div>
            </div>
        ) : (
            <div className="relative z-10">
                <div className="flex justify-between items-end mb-2">
                <div>
                    <h2 className="text-sm text-slate-400 font-medium">Tick Buffer</h2>
                    <div className="text-2xl font-bold text-white">
                    {tickCount} <span className="text-slate-500 text-lg">/ {maxTicks}</span>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-sm text-slate-400 font-medium">History Depth</h2>
                    <div className="text-xl font-bold text-blue-400">{candleCount}</div>
                </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                ></div>
                </div>
            </div>
        )}
      </div>

      {/* Impulse Meter */}
      <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 flex flex-col justify-center relative overflow-hidden">
        {isImpulse && <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>}
        <div className="flex justify-between items-center mb-1 relative z-10">
          <span className="text-slate-400 text-sm flex items-center gap-1"><TrendingDown size={14}/> Raw Impulse</span>
          <span className={`text-xl font-mono font-bold ${isImpulse ? 'text-blue-400' : 'text-slate-200'}`}>
            {multiplier.toFixed(1)}x
          </span>
        </div>
        <div className="flex justify-between items-center relative z-10">
          <span className="text-slate-500 text-xs">Threshold: {CONSTANTS.IMPULSE_THRESHOLD}x</span>
          <span className="text-slate-500 text-xs font-mono">
            Avg Raw Body: {avgBodySize.toFixed(5)}
          </span>
        </div>
        {/* Visual Bar for Multiplier */}
        <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden relative z-10">
             <div 
                className={`h-full transition-all duration-300 ${isImpulse ? 'bg-blue-500' : 'bg-slate-600'}`}
                style={{ width: `${Math.min(multiplier * 10, 100)}%` }}
             ></div>
        </div>
      </div>
    </div>
  );
};