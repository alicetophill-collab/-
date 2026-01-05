import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  CONSTANTS, 
  CandleData, 
  LogEntry, 
  SignalType, 
  OHLC,
  Trade,
  StrategyMode,
  TIMEFRAMES
} from './types';
import { calculateHA } from './services/math';
import { soundManager } from './services/sound';
import { IndicatorPanel } from './components/IndicatorPanel';
import { ChartPanel } from './components/ChartPanel';
import { LogTerminal } from './components/LogTerminal';
import { TradeHistory } from './components/TradeHistory';
import { Play, Link as LinkIcon, AlertCircle, Volume2, DollarSign, Wallet, TrendingUp, Zap, Activity, Rocket, Timer } from 'lucide-react';

const App: React.FC = () => {
  // --- STATE ---
  const [urlInput, setUrlInput] = useState("");
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  
  // Strategy State
  const [mode, setMode] = useState<StrategyMode>('TREND');
  const [currentSignal, setCurrentSignal] = useState<SignalType>(SignalType.WAIT);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  
  // Data State
  const [processedCandles, setProcessedCandles] = useState<CandleData[]>([]);
  const [formingCandle, setFormingCandle] = useState<CandleData | null>(null);
  
  // Metrics State
  const [avgRawBodySize, setAvgRawBodySize] = useState(0); // Changed to RAW body size

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tickCount, setTickCount] = useState(0); 
  const [lastPrice, setLastPrice] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // P&L State
  const [betAmount, setBetAmount] = useState<number>(1);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);

  // --- REFS ---
  const ws = useRef<WebSocket | null>(null);
  const ticksBuffer = useRef<number[]>([]); 
  const candlesHistory = useRef<CandleData[]>([]); // HA History for Chart
  const rawBodyHistory = useRef<number[]>([]);     // RAW Body History for Stats
  const activeTradeRef = useRef<Trade | null>(null); 
  const debounceRef = useRef<number | null>(null);

  // Strategy Execution Refs
  const strategyState = useRef({
    lastTradeCloseTime: 0,
    hasSeenGreen: false,      // Latch: Have we seen a green HA candle since entry?
    redTickCounter: 0         // Anti-Flicker: How many consecutive ticks has HA been red?
  });

  // --- HELPER: Logs ---
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => {
      const newLogs = [...prev, entry];
      if (newLogs.length > 100) return newLogs.slice(-100); 
      return newLogs;
    });
  }, []);

  // --- HELPER: Stats ---
  const closedTrades = trades.filter(t => t.exitPrice !== undefined);
  const totalPnL = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const winCount = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;

  // --- HELPER: Token Parsing ---
  const extractTokenId = (input: string): string | null => {
    const urlMatch = input.match(/\/tokens\/(\d+)/);
    if (urlMatch && urlMatch[1]) return urlMatch[1];
    if (/^\d+$/.test(input.trim())) return input.trim();
    return null;
  };

  // --- API: Fetch Symbol & Name ---
  const fetchTokenSymbol = async (id: string) => {
    try {
      // USING CORS PROXY
      const res = await fetch(`https://corsproxy.io/?${CONSTANTS.API_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: "TurboTokenDetails",
          variables: { tokenId: id },
          query: "query TurboTokenDetails($tokenId: String!) { turboTokenDetails(tokenId: $tokenId) { name symbol } }"
        })
      });
      const json = await res.json();
      if (json.data?.turboTokenDetails?.symbol) {
        setTokenSymbol(json.data.turboTokenDetails.symbol);
      } else {
        setTokenSymbol(id);
      }
    } catch (e) {
      console.warn("Could not fetch symbol", e);
      setTokenSymbol(id);
    }
  };

  // --- API: Warm Up (Fetch History) ---
  const warmUpHistory = async (id: string, selectedMode: StrategyMode) => {
    setIsWarmingUp(true);
    addLog(`Fetching history for ${TIMEFRAMES[selectedMode].label}...`, 'info');
    
    const tfKey = TIMEFRAMES[selectedMode].key;

    try {
      // USING CORS PROXY
      const res = await fetch(`https://corsproxy.io/?${CONSTANTS.API_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: "TurboTokenChartData",
          variables: { tokenId: id },
          query: `query TurboTokenChartData($tokenId: String!) { turboTokenChartData(tokenId: $tokenId) { ${tfKey} { open high low close } } }`
        })
      });
      
      const json = await res.json();
      let rawHistory: OHLC[] = json.data?.turboTokenChartData?.[tfKey] || [];
      
      if (rawHistory.length === 0) {
        addLog("No history found. Starting fresh.", 'warning');
        setIsWarmingUp(false);
        return;
      }

      // Reverse: Oldest -> Newest
      rawHistory = [...rawHistory].reverse();

      addLog(`Loaded ${rawHistory.length} historical candles.`, 'info');

      // 1. Process Raw History for Average Body Size
      const rawBodies: number[] = [];
      rawHistory.forEach(raw => {
          rawBodies.push(Math.abs(raw.close - raw.open));
      });
      rawBodyHistory.current = rawBodies;
      
      // Initial Average Calculation
      const slice = rawBodies.slice(-CONSTANTS.BASE_PERIOD);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      setAvgRawBodySize(avg);

      // 2. Process HA History for Charting
      const newCandlesHistory: CandleData[] = [];
      let prevHa: CandleData | null = null;
      
      const now = Date.now();
      const intervalMs = TIMEFRAMES[selectedMode].ticks * 1000;

      rawHistory.forEach((raw, index) => {
         const ha = calculateHA(raw, prevHa);
         ha.timestamp = now - ((rawHistory.length - 1 - index) * intervalMs);
         
         const candleData: CandleData = { ...ha, signal: SignalType.WAIT };
         newCandlesHistory.push(candleData);
         prevHa = candleData;
      });

      candlesHistory.current = newCandlesHistory;
      setProcessedCandles(newCandlesHistory);
      
      if (newCandlesHistory.length > 0) {
          setLastPrice(newCandlesHistory[newCandlesHistory.length - 1].close);
      }
      
      addLog(`Warm up complete. Ready for Impulse.`, 'profit');

    } catch (e) {
      addLog(`Warm up failed: ${e}. Continuing with live data only.`, 'loss');
    } finally {
      setIsWarmingUp(false);
    }
  };

  const resetState = useCallback(() => {
    if (ws.current) ws.current.close();
    setProcessedCandles([]);
    setFormingCandle(null);
    setLogs([]);
    setTickCount(0);
    setLastPrice(0);
    setCurrentSignal(SignalType.WAIT);
    setIsConnected(false);
    setTokenSymbol(null);
    setTrades([]);
    setActiveTrade(null);
    setCooldownRemaining(0);
    
    ticksBuffer.current = [];
    candlesHistory.current = [];
    rawBodyHistory.current = [];
    activeTradeRef.current = null;
    strategyState.current = { lastTradeCloseTime: 0, hasSeenGreen: false, redTickCounter: 0 };
  }, []);

  const handleStart = useCallback(async (overrideToken?: string) => {
    setErrorMsg(null);
    const tokenToUse = overrideToken || extractTokenId(urlInput);
    if (!tokenToUse) {
      if (!overrideToken) setErrorMsg("Invalid URL.");
      return;
    }
    resetState();
    setActiveTokenId(tokenToUse);
    fetchTokenSymbol(tokenToUse);
    await warmUpHistory(tokenToUse, mode);
    addLog(`Target set to Token ID: ${tokenToUse}`, 'info');
  }, [activeTokenId, isConnected, urlInput, resetState, addLog, mode]);

  const toggleMode = () => {
      const newMode = mode === 'SCALPER' ? 'TREND' : 'SCALPER';
      setMode(newMode);
      addLog(`Switched to ${newMode} mode.`, 'info');
      if (activeTokenId) handleStart(activeTokenId); 
  };

  // --- GLOBAL PASTE LISTENER ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const pastedData = e.clipboardData?.getData('Text');
      if (pastedData) {
        const extractedId = extractTokenId(pastedData);
        if (extractedId) {
          e.preventDefault();
          setUrlInput(pastedData);
          handleStart(extractedId);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleStart]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
        const extracted = extractTokenId(val);
        if (extracted) handleStart(extracted);
    }, 400);
  };

  // --- COOLDOWN TIMER ---
  useEffect(() => {
      if (!activeTokenId) return;
      const interval = setInterval(() => {
          const timeLeft = CONSTANTS.COOLDOWN_MS - (Date.now() - strategyState.current.lastTradeCloseTime);
          if (timeLeft > 0) {
              setCooldownRemaining(Math.ceil(timeLeft / 1000));
          } else {
              setCooldownRemaining(0);
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [activeTokenId]);

  // --- VISUALIZATION UPDATE (Preview) ---
  const updateFormingCandle = useCallback(() => {
      const currentTicks = ticksBuffer.current;
      if (currentTicks.length === 0) return;

      const ohlc: OHLC = {
        open: currentTicks[0],
        high: Math.max(...currentTicks),
        low: Math.min(...currentTicks),
        close: currentTicks[currentTicks.length - 1]
      };

      const prevHa = candlesHistory.current.length > 0 
        ? candlesHistory.current[candlesHistory.current.length - 1] 
        : null;

      const ha = calculateHA(ohlc, prevHa);
      setFormingCandle({ ...ha, signal: SignalType.WAIT, timestamp: Date.now() });
  }, []);

  // --- STRATEGY ENGINE (Runs on every tick) ---
  const runStrategyEngine = useCallback((currentPrice: number) => {
      const trade = activeTradeRef.current;
      const currentTicks = ticksBuffer.current;
      
      // Need at least one tick to start
      if (currentTicks.length === 0) return;
      
      const rawOpen = currentTicks[0];
      
      // --- 1. ENTRY LOGIC: RAW IMPULSE ---
      if (!trade) {
          // Check Cooldown
          const msSinceLastTrade = Date.now() - strategyState.current.lastTradeCloseTime;
          if (msSinceLastTrade < CONSTANTS.COOLDOWN_MS) {
              return; // Cooldown active
          }

          // Calculate current Raw Body
          const currentRawBody = Math.abs(currentPrice - rawOpen);
          
          // Calculate Average Raw Body
          const historySlice = rawBodyHistory.current.slice(-CONSTANTS.BASE_PERIOD);
          let avgRawBody = 0;
          if (historySlice.length > 0) {
             avgRawBody = historySlice.reduce((a, b) => a + b, 0) / historySlice.length;
          }
          setAvgRawBodySize(avgRawBody); // Update UI
          
          // Trigger: Body > 4x Average
          if (avgRawBody > 0 && currentRawBody > (avgRawBody * CONSTANTS.IMPULSE_THRESHOLD)) {
               // Additional check: Is it a DUMP (Red)? We only buy dips here.
               const isRed = currentPrice < rawOpen;
               
               if (isRed) {
                   const newTrade: Trade = {
                       id: uuidv4(),
                       entryTime: Date.now(),
                       initialEntryPrice: currentPrice,
                       avgPrice: currentPrice,
                       stage: 1
                   };
                   activeTradeRef.current = newTrade;
                   setActiveTrade(newTrade);
                   setTrades(prev => [...prev, newTrade]);
                   
                   // Reset Strategy State for new trade
                   strategyState.current.hasSeenGreen = false;
                   strategyState.current.redTickCounter = 0;

                   soundManager.playBuy();
                   const mult = (currentRawBody / avgRawBody).toFixed(1);
                   addLog(`⚡ IMPULSE! Raw Volatility ${mult}x. Entering @ ${currentPrice.toFixed(4)}`, 'buy');
                   setCurrentSignal(SignalType.BUY);
               }
          }
      } 
      // --- 2. MANAGEMENT LOGIC: EXIT & DCA ---
      else {
          // A. Calculate Forming Heikin Ashi for EXIT decision
          const ohlc: OHLC = {
            open: rawOpen,
            high: Math.max(...currentTicks),
            low: Math.min(...currentTicks),
            close: currentPrice // Use current price as close for calculation
          };
          const prevHa = candlesHistory.current.length > 0 
             ? candlesHistory.current[candlesHistory.current.length - 1] 
             : null;
          const ha = calculateHA(ohlc, prevHa);

          // B. EXIT CONDITION: HA Reversal (Red Candle)
          
          // Latch Logic: Have we seen a green candle yet?
          const isHaGreen = ha.close > ha.open;
          if (isHaGreen) {
              if (!strategyState.current.hasSeenGreen) {
                  // addLog("First Green HA Candle detected. Latch engaged.", 'info');
              }
              strategyState.current.hasSeenGreen = true;
              strategyState.current.redTickCounter = 0; // Reset red counter if we see green
          }

          const isHaRed = ha.close < ha.open;
          
          // Anti-Flicker: Only increment red counter if Latch is open (we've seen green before)
          if (strategyState.current.hasSeenGreen && isHaRed) {
              strategyState.current.redTickCounter += 1;
          }

          // C. Safety Checks (TP / DCA)
          const currentRatio = currentPrice / trade.avgPrice;
          const timeElapsed = Date.now() - trade.entryTime;
          
          let shouldExit = false;
          let exitReason = "";

          // C1. DCA Trigger
          if (trade.stage === 1) {
              const dropRatio = currentPrice / trade.avgPrice;
              if (dropRatio <= CONSTANTS.DCA_DROP_THRESHOLD) {
                   const newAvgPrice = (trade.avgPrice + currentPrice) / 2;
                   const updatedTrade: Trade = { ...trade, stage: 2, avgPrice: newAvgPrice };
                   activeTradeRef.current = updatedTrade;
                   setActiveTrade(updatedTrade);
                   setTrades(prev => prev.map(t => t.id === trade.id ? updatedTrade : t));
                   
                   soundManager.playBuy();
                   addLog(`🆘 DCA! Price dropped 8%. New Avg: ${newAvgPrice.toFixed(4)}`, 'dca');
                   setCurrentSignal(SignalType.DCA);
                   return; // Continue trade
              }
          }

          // C2. Exit Triggers
          if (strategyState.current.redTickCounter >= CONSTANTS.EXIT_CONFIRMATION_TICKS) {
              shouldExit = true;
              exitReason = "📉 HA Reversal (Red Confirmed)";
          } 
          else if (trade.stage === 1 && currentRatio >= CONSTANTS.TP_STAGE_1) {
              shouldExit = true;
              exitReason = "✅ Target (+4%)";
          }
          else if (trade.stage === 2 && currentRatio >= CONSTANTS.TP_STAGE_2) {
              shouldExit = true;
              exitReason = "♻️ Safety Exit (+1%)";
          }
          else if (timeElapsed > CONSTANTS.MAX_HOLD_TIME_MS) {
              shouldExit = true;
              exitReason = "⏱ Time Limit";
          }

          if (shouldExit) {
              const roi = (currentPrice - trade.avgPrice) / trade.avgPrice;
              const pnl = roi * betAmount * trade.stage; // Simplified PnL

              const completedTrade: Trade = {
                    ...trade,
                    exitPrice: currentPrice,
                    exitTime: Date.now(),
                    pnl,
                    roi
              };

              setTrades(prev => prev.map(t => t.id === trade.id ? completedTrade : t));
              setActiveTrade(null);
              activeTradeRef.current = null;
              
              // Set Cooldown
              strategyState.current.lastTradeCloseTime = Date.now();

              soundManager.playSell();
              const type = pnl >= 0 ? 'profit' : 'loss';
              const icon = pnl >= 0 ? '💰' : '🔻';
              addLog(`${icon} CLOSE @ ${currentPrice.toFixed(4)} (${exitReason}) | PnL: $${pnl.toFixed(4)}`, type);
              setCurrentSignal(SignalType.SELL);
          }
      }

  }, [betAmount, addLog]);

  // --- CANDLE FINALIZATION (On Buffer Full) ---
  const processCandle = useCallback(() => {
    const currentTicks = ticksBuffer.current;
    if (currentTicks.length === 0) return;

    // 1. Raw Data Processing
    const rawOhlc: OHLC = {
      open: currentTicks[0],
      high: Math.max(...currentTicks),
      low: Math.min(...currentTicks),
      close: currentTicks[currentTicks.length - 1]
    };
    
    // Store Raw Body for future averages
    const rawBody = Math.abs(rawOhlc.close - rawOhlc.open);
    rawBodyHistory.current.push(rawBody);
    // Keep history manageable
    if (rawBodyHistory.current.length > 200) rawBodyHistory.current.shift();

    // 2. HA Processing (For Charting)
    const prevHaData = candlesHistory.current.length > 0 
      ? candlesHistory.current[candlesHistory.current.length - 1] 
      : null;

    const ha = calculateHA(rawOhlc, prevHaData);
    
    // Determine Signal type to paint on chart (Transient signal from strategy engine takes precedence, 
    // but here we just mark WAIT unless an event happened exactly at close, which is rare.
    // We rely on the Markers in ChartPanel to show Buy/Sell points based on timestamps).
    const signal = SignalType.WAIT;

    const newCandleData: CandleData = { ...ha, signal };
    candlesHistory.current.push(newCandleData);
    setProcessedCandles([...candlesHistory.current]);
    setFormingCandle(null);
    ticksBuffer.current = [];
    setTickCount(0);
    
    // Reset Transient UI signal
    if (!activeTradeRef.current) setCurrentSignal(SignalType.WAIT);

  }, []);

  // --- REFS FOR WEBSOCKET ---
  const processCandleRef = useRef(processCandle);
  const updateFormingCandleRef = useRef(updateFormingCandle);
  const runStrategyEngineRef = useRef(runStrategyEngine);

  useEffect(() => {
    processCandleRef.current = processCandle;
    updateFormingCandleRef.current = updateFormingCandle;
    runStrategyEngineRef.current = runStrategyEngine;
  }, [processCandle, updateFormingCandle, runStrategyEngine]);

  // --- WEBSOCKET CONNECTION ---
  useEffect(() => {
    if (!activeTokenId) return;
    if (isWarmingUp) return;

    const socket = new WebSocket(CONSTANTS.WS_URL, "graphql-transport-ws");
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      addLog("Connected to live feed.", 'info');
      socket.send(JSON.stringify({ type: "connection_init", payload: {} }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connection_ack') {
             const subscribeMsg = {
                id: uuidv4(), 
                type: "subscribe",
                payload: {
                  query: `subscription TurboTokenPrice($tokenId: String!) { turboTokenPrice(tokenId: $tokenId) { price } }`,
                  operationName: "TurboTokenPrice",
                  variables: { tokenId: activeTokenId }
                }
              };
              socket.send(JSON.stringify(subscribeMsg));
        }

        if (data.type === 'next' && data.payload?.data?.turboTokenPrice) {
          const price = data.payload.data.turboTokenPrice.price;
          
          ticksBuffer.current.push(price);
          setLastPrice(price);
          setTickCount(ticksBuffer.current.length);

          // 1. Update UI Candle
          updateFormingCandleRef.current();

          // 2. Run Strategy (Impulse Entry / HA Exit)
          runStrategyEngineRef.current(price);

          // 3. Close Candle if full
          const requiredTicks = TIMEFRAMES[mode].ticks;
          if (ticksBuffer.current.length >= requiredTicks) {
             processCandleRef.current();
          }
        }
      } catch (e) {
        console.error("Parse error", e);
      }
    };

    socket.onclose = () => {
      if (activeTokenId && !isWarmingUp) setIsConnected(false);
    };

    return () => { if (ws.current) ws.current.close(); };
  }, [activeTokenId, addLog, mode, isWarmingUp]); 

  // UI Prep
  const chartData = formingCandle ? [...processedCandles, formingCandle] : processedCandles;
  
  // Calculate current raw body for UI display
  const currentRawOpen = ticksBuffer.current.length > 0 ? ticksBuffer.current[0] : 0;
  const currentRawBody = currentRawOpen > 0 ? Math.abs(lastPrice - currentRawOpen) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="mb-6 space-y-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                 <Rocket className="text-blue-500" /> Catapult: HYBRID IMPULSE
              </h1>
              <div className="text-slate-500 text-sm mt-1 flex items-center gap-4">
                 <span>Raw Impulse Entry</span>
                 <span className="w-px h-3 bg-slate-700"></span>
                 <span className="text-blue-400 font-medium">Heikin Ashi Exit</span>
                 <span className="w-px h-3 bg-slate-700"></span>
                 {isWarmingUp ? (
                   <span className="text-yellow-500 animate-pulse flex items-center gap-1"><Activity size={12}/> Calibrating...</span>
                 ) : (
                   <span className="text-emerald-500 flex items-center gap-1"><Volume2 size={12}/> Live</span>
                 )}
              </div>
            </div>
            
            <div className="w-full md:w-auto flex flex-col md:flex-row gap-4 items-end md:items-center">
               
               {/* Mode Switcher */}
               <div className="flex flex-col gap-1 w-full md:w-auto">
                 <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mode</label>
                 <button 
                    onClick={toggleMode}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                        mode === 'SCALPER' 
                        ? 'bg-purple-500/10 border-purple-500 text-purple-400' 
                        : 'bg-blue-500/10 border-blue-500 text-blue-400'
                    }`}
                 >
                    {mode === 'SCALPER' ? <Zap size={14} /> : <Activity size={14} />}
                    {TIMEFRAMES[mode].label}
                 </button>
               </div>

               {/* Bet Size */}
               <div className="flex flex-col gap-1 w-full md:w-28">
                 <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Bet Size</label>
                 <div className="relative group">
                    <DollarSign size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors"/>
                    <input 
                      type="number" 
                      min="1"
                      step="1"
                      value={betAmount}
                      onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm font-bold text-white focus:border-blue-500 focus:outline-none transition-all"
                    />
                 </div>
               </div>

               {/* URL Input */}
               <div className="w-full md:w-auto">
                  <form onSubmit={(e) => { e.preventDefault(); handleStart(); }} className="flex gap-2">
                    <div className="relative group w-full md:w-80">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LinkIcon size={16} className="text-slate-500" />
                      </div>
                      <input
                        type="text"
                        value={urlInput}
                        onChange={handleInputChange}
                        placeholder="Paste URL (Ctrl+V works)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                  </form>
               </div>
            </div>
          </div>

          {/* Stats Dashboard */}
          {activeTokenId && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                {/* Symbol + PRICE */}
                <div className="col-span-2 md:col-span-1 p-4 bg-slate-900/60 border border-slate-800 rounded-xl backdrop-blur-sm">
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Token</span>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></div>
                    </div>
                    <div className="flex justify-between items-end">
                         <span className="text-xl font-black text-white">{tokenSymbol || '...'}</span>
                         <span className="text-lg font-mono font-bold text-blue-400">{lastPrice > 0 ? lastPrice.toFixed(4) : '0.00'}</span>
                    </div>
                </div>

                {/* Total PnL */}
                <div className="col-span-2 md:col-span-1 p-4 bg-slate-900/60 border border-slate-800 rounded-xl backdrop-blur-sm">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Total Profit</span>
                    <div className={`text-xl font-black font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} $
                    </div>
                </div>
                
                 {/* Win Rate */}
                 <div className="col-span-1 p-4 bg-slate-900/60 border border-slate-800 rounded-xl backdrop-blur-sm">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Win Rate</span>
                    <div className="text-xl font-bold text-white font-mono">
                        {winRate.toFixed(0)}% <span className="text-sm text-slate-600 font-normal">({winCount}/{closedTrades.length})</span>
                    </div>
                </div>

                {/* Active Status */}
                <div className={`col-span-1 p-4 border rounded-xl flex flex-col justify-center items-center transition-all duration-300 ${activeTrade ? 'bg-blue-500/10 border-blue-500/50' : 'bg-slate-900/60 border-slate-800'}`}>
                    {cooldownRemaining > 0 ? (
                        <div className="text-center">
                            <span className="text-[10px] font-bold text-yellow-500 uppercase flex items-center justify-center gap-1 mb-1">
                                <Timer size={10} /> Cooldown
                            </span>
                            <span className="text-xl font-mono text-white">{cooldownRemaining}s</span>
                        </div>
                    ) : activeTrade ? (
                        <>
                           <span className="text-xs font-bold text-blue-400 animate-pulse mb-1">POSITION OPEN</span>
                           <span className="font-mono text-white text-sm">Avg: {activeTrade.avgPrice.toFixed(4)}</span>
                        </>
                    ) : (
                        <span className="text-xs font-bold text-slate-500">WAITING FOR IMPULSE</span>
                    )}
                </div>
            </div>
          )}
        </header>

        {activeTokenId ? (
          <>
            <IndicatorPanel 
              currentSignal={currentSignal}
              tickCount={tickCount}
              lastPrice={lastPrice}
              candleCount={processedCandles.length}
              maxTicks={TIMEFRAMES[mode].ticks}
              avgBodySize={avgRawBodySize}
              currentBodySize={currentRawBody}
              activeTrade={activeTrade}
            />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Chart - Spans 3 columns */}
              <div className="lg:col-span-3 space-y-6">
                <ChartPanel data={chartData} lastPrice={lastPrice} />
              </div>
              
              {/* Log Terminal - Spans 1 column */}
              <div className="lg:col-span-1">
                <LogTerminal logs={logs} />
              </div>
              
              {/* Trade History - Spans full width at bottom */}
              <div className="lg:col-span-4 mt-2">
                 <TradeHistory trades={trades} />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-80 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30 text-slate-500 group">
             <div className="p-4 rounded-full bg-slate-800 group-hover:scale-110 transition-transform mb-4">
                <Wallet size={32} className="text-slate-400" />
             </div>
             <p className="text-lg font-bold text-slate-300">Ready to Analyze</p>
             <p className="text-sm opacity-60 mt-2 max-w-sm text-center">
                Copy a link from <span className="text-blue-400">catapult.trade</span> and press <kbd className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700 font-mono">Ctrl+V</kbd> anywhere on this page.
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;