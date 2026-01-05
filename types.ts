export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HeikinAshi extends OHLC {
  timestamp: number; // Local timestamp for X-axis
}

export interface CandleData extends HeikinAshi {
  signal: SignalType;
}

export enum SignalType {
  WAIT = "WAIT",
  BUY = "BUY",
  SELL = "SELL",
  DCA = "DCA" 
}

export type StrategyMode = 'SCALPER' | 'TREND';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'buy' | 'sell' | 'tick' | 'profit' | 'loss' | 'warning' | 'dca';
}

export interface Trade {
  id: string;
  entryTime: number;
  initialEntryPrice: number; // Price of first buy
  avgPrice: number; // Weighted average price
  stage: 1 | 2; // 1 = Initial, 2 = DCA
  exitPrice?: number;
  exitTime?: number;
  pnl?: number; // Realized PnL amount
  roi?: number; // Percentage return
}

export const CONSTANTS = {
  WS_URL: "wss://catapult.trade/graphql",
  API_URL: "https://catapult.trade/graphql",
  
  // --- HYBRID STRATEGY (RAW ENTRY / HA EXIT) ---
  BASE_PERIOD: 50,         // Calculate average body size over last 50 candles
  IMPULSE_THRESHOLD: 4.0,  // RAW Candle body must be 4x larger than average RAW body
  DCA_DROP_THRESHOLD: 0.92,// Buy again if price drops to 92% of avg price (-8%)
  TP_STAGE_1: 1.04,        // Safety Target 1.04x (+4%) 
  TP_STAGE_2: 1.01,        // Safety Target 1.01x (+1%) for DCA
  MAX_HOLD_TIME_MS: 600000,// 10 minutes (600 seconds) hard exit
  
  // --- SAFEGUARDS ---
  COOLDOWN_MS: 30000,      // 30 Seconds cooldown after a trade
  EXIT_CONFIRMATION_TICKS: 3 // Require 3 consecutive red ticks to confirm exit
};

export const TIMEFRAMES = {
  SCALPER: { ticks: 5, key: 's5', label: 'Scalper (5s)' },
  TREND: { ticks: 15, key: 's15', label: 'Trend (15s)' }
};