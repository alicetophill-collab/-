import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
}

export const LogTerminal: React.FC<Props> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="bg-black rounded-xl border border-slate-800 font-mono text-xs md:text-sm h-64 lg:h-[500px] overflow-hidden flex flex-col shadow-inner">
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="ml-2 text-slate-500">terminal_output.log</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {logs.map((log) => {
          let colorClass = "text-slate-300";
          if (log.type === 'buy') colorClass = "text-blue-400 font-bold";
          if (log.type === 'sell') colorClass = "text-orange-400 font-bold";
          if (log.type === 'profit') colorClass = "text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded";
          if (log.type === 'loss') colorClass = "text-rose-500 font-bold bg-rose-500/10 px-1 rounded";
          if (log.type === 'warning') colorClass = "text-yellow-500 italic";
          if (log.type === 'tick') colorClass = "text-slate-500";

          return (
            <div key={log.id} className={`${colorClass} whitespace-pre-wrap font-mono`}>
              <span className="opacity-30 mr-2">[{log.timestamp}]</span>
              {log.message}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};