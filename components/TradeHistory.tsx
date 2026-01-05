import React from 'react';
import { Trade } from '../types';
import { Clock, TrendingUp, DollarSign } from 'lucide-react';

interface Props {
  trades: Trade[];
}

export const TradeHistory: React.FC<Props> = ({ trades }) => {
  // Sort by time descending (newest first)
  const sortedTrades = [...trades].sort((a, b) => b.entryTime - a.entryTime);

  return (
    <div className="bg-[#131722] rounded-xl border border-slate-800 overflow-hidden flex flex-col h-full shadow-lg">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
          <Clock size={14} /> Trade History
        </h3>
        <span className="text-xs text-slate-500">{trades.length} trades</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-900/30 text-slate-500 uppercase font-medium">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Avg Entry</th>
              <th className="px-4 py-3 text-right">Exit</th>
              <th className="px-4 py-3 text-right">PnL</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-600 italic">
                  No trades recorded yet.
                </td>
              </tr>
            ) : (
              sortedTrades.map((trade) => {
                const isOpen = trade.exitPrice === undefined;
                const isWin = (trade.pnl || 0) > 0;
                
                return (
                  <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(trade.entryTime).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded w-fit">LONG</span>
                        {trade.stage > 1 && (
                           <span className="text-[10px] text-slate-500 mt-1">+ DCA x{trade.stage - 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[#d1d4dc]">
                      {trade.avgPrice.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#d1d4dc]">
                      {trade.exitPrice?.toFixed(4) || '-'}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {trade.pnl !== undefined ? (
                        <>
                           {trade.pnl > 0 ? '+' : ''}{trade.pnl.toFixed(3)}
                        </>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOpen ? (
                        <span className="text-yellow-500 animate-pulse text-[10px] uppercase border border-yellow-500/30 px-2 py-0.5 rounded-full">Open</span>
                      ) : (
                        <span className="text-slate-500 text-[10px] uppercase">Closed</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};