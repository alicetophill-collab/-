import { HeikinAshi, OHLC } from "../types";

/**
 * Превращает обычную свечу в Heikin Ashi
 * Ported from: calculate_ha logic
 */
export const calculateHA = (currentOhlc: OHLC, prevHa: HeikinAshi | null): HeikinAshi => {
  const { open: o, high: h, low: l, close: c } = currentOhlc;

  // ha_close = (o + h + l + c) / 4
  const haClose = (o + h + l + c) / 4;

  let haOpen: number;
  if (prevHa === null) {
    // if prev_ha is None: ha_open = (o + c) / 2
    haOpen = (o + c) / 2;
  } else {
    // ha_open = (prev_ha['open'] + prev_ha['close']) / 2
    haOpen = (prevHa.open + prevHa.close) / 2;
  }

  // ha_high = max(h, ha_open, ha_close)
  const haHigh = Math.max(h, haOpen, haClose);
  
  // ha_low = min(l, ha_open, ha_close)
  const haLow = Math.min(l, haOpen, haClose);

  return {
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    timestamp: Date.now(),
  };
};