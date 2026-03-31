// ============================================================
// signal.ts — Signal scoring engine
// Combines Nansen smart money + F&G + Hyperliquid funding
// ============================================================

import { FearGreed, FundingRate } from './sentiment';
import {
  extractNetflowForToken,
  extractDexVolumeForToken,
} from './nansen';
import { SIGNAL_THRESHOLDS, FEAR_GREED_THRESHOLDS } from './config';

export type SignalLabel = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';

export interface TokenSignal {
  symbol: string;
  score: number;
  label: SignalLabel;
  netflow: number | null;
  buyVolume: number;
  sellVolume: number;
  fundingRate: number | null;
  fearGreed: number | null;
  breakdown: string[];
}

export function scoreToken(
  symbol: string,
  netflowData: any,
  dexData: any,
  fearGreed: FearGreed | null,
  fundingRates: FundingRate[]
): TokenSignal {
  let score = 0;
  const breakdown: string[] = [];

  // ── Nansen Smart Money Netflow ──────────────────────────
  const netflow = extractNetflowForToken(netflowData, symbol);
  if (netflow !== null) {
    if (netflow > 500_000) { score += 3; breakdown.push(`⬆ Netflow +$${fmt(netflow)} (strong buy)`); }
    else if (netflow > 0) { score += 1; breakdown.push(`⬆ Netflow +$${fmt(netflow)}`); }
    else if (netflow < -500_000) { score -= 3; breakdown.push(`⬇ Netflow -$${fmt(Math.abs(netflow))} (strong sell)`); }
    else if (netflow < 0) { score -= 1; breakdown.push(`⬇ Netflow -$${fmt(Math.abs(netflow))}`); }
  }

  // ── Nansen DEX Volume ───────────────────────────────────
  const { buy, sell } = extractDexVolumeForToken(dexData, symbol);
  if (buy > 0 || sell > 0) {
    const ratio = buy / (buy + sell + 0.001);
    if (ratio > 0.65) { score += 2; breakdown.push(`🟢 DEX: ${pct(ratio)} buy pressure`); }
    else if (ratio > 0.55) { score += 1; breakdown.push(`🟡 DEX: ${pct(ratio)} buy pressure`); }
    else if (ratio < 0.35) { score -= 2; breakdown.push(`🔴 DEX: ${pct(1 - ratio)} sell pressure`); }
    else if (ratio < 0.45) { score -= 1; breakdown.push(`🟡 DEX: ${pct(1 - ratio)} sell pressure`); }
  }

  // ── Fear & Greed ────────────────────────────────────────
  const fgVal = fearGreed?.value ?? null;
  if (fgVal !== null) {
    if (fgVal <= FEAR_GREED_THRESHOLDS.EXTREME_FEAR) {
      score += 2; breakdown.push(`😱 F&G: ${fgVal} (Extreme Fear = buy zone)`);
    } else if (fgVal <= FEAR_GREED_THRESHOLDS.FEAR) {
      score += 1; breakdown.push(`😰 F&G: ${fgVal} (Fear)`);
    } else if (fgVal >= FEAR_GREED_THRESHOLDS.EXTREME_GREED) {
      score -= 2; breakdown.push(`🤑 F&G: ${fgVal} (Extreme Greed = caution)`);
    } else if (fgVal >= FEAR_GREED_THRESHOLDS.GREED) {
      score -= 1; breakdown.push(`😀 F&G: ${fgVal} (Greed)`);
    }
  }

  // ── Hyperliquid Funding Rate ─────────────────────────────
  const fr = fundingRates.find(f => f.coin.toUpperCase() === symbol.toUpperCase());
  const fundingRate = fr?.fundingRate ?? null;
  if (fundingRate !== null) {
    if (fundingRate < -0.0001) {
      score += 2; breakdown.push(`💰 Funding: ${(fundingRate * 100).toFixed(4)}% (longs paid = bullish)`);
    } else if (fundingRate < 0) {
      score += 1; breakdown.push(`💸 Funding: ${(fundingRate * 100).toFixed(4)}% (slightly bullish)`);
    } else if (fundingRate > 0.0003) {
      score -= 2; breakdown.push(`🔥 Funding: +${(fundingRate * 100).toFixed(4)}% (shorts paid = bearish)`);
    } else if (fundingRate > 0) {
      score -= 1; breakdown.push(`📈 Funding: +${(fundingRate * 100).toFixed(4)}% (slightly bearish)`);
    }
  }

  // ── Label ───────────────────────────────────────────────
  let label: SignalLabel;
  if (score >= SIGNAL_THRESHOLDS.STRONG_BUY) label = 'STRONG BUY';
  else if (score >= SIGNAL_THRESHOLDS.BUY) label = 'BUY';
  else if (score <= SIGNAL_THRESHOLDS.STRONG_SELL) label = 'STRONG SELL';
  else if (score <= SIGNAL_THRESHOLDS.SELL) label = 'SELL';
  else label = 'NEUTRAL';

  return { symbol, score, label, netflow, buyVolume: buy, sellVolume: sell, fundingRate, fearGreed: fgVal, breakdown };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function pct(r: number): string {
  return `${(r * 100).toFixed(0)}%`;
}
