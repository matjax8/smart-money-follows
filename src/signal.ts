// ============================================================
// signal.ts — Signal scoring engine
// Combines Nansen smart money + F&G + Hyperliquid funding
// ============================================================

import { FearGreed, FundingRate } from './sentiment';
import { extractNetflowForToken, extractDexVolumeForToken } from './nansen';
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
  price: number;
  breakdown: string[];
}

export function scoreToken(
  symbol: string,
  netflowData: any,
  dexData: any,
  fearGreed: FearGreed | null,
  fundingRates: FundingRate[],
  price: number = 0,
): TokenSignal {
  let score = 0;
  const breakdown: string[] = [];

  // ── Nansen Smart Money Netflow ──────────────────────────
  const netflow = extractNetflowForToken(netflowData, symbol);
  if (netflow !== null) {
    if (netflow > 500_000)       { score += 3; breakdown.push(`⬆ Netflow +${fmtUsd(netflow)} (strong inflow)`); }
    else if (netflow > 100_000)  { score += 2; breakdown.push(`⬆ Netflow +${fmtUsd(netflow)}`); }
    else if (netflow > 0)        { score += 1; breakdown.push(`⬆ Netflow +${fmtUsd(netflow)} (mild)`); }
    else if (netflow < -500_000) { score -= 3; breakdown.push(`⬇ Netflow ${fmtUsd(netflow)} (strong outflow)`); }
    else if (netflow < -100_000) { score -= 2; breakdown.push(`⬇ Netflow ${fmtUsd(netflow)}`); }
    else if (netflow < 0)        { score -= 1; breakdown.push(`⬇ Netflow ${fmtUsd(netflow)} (mild)`); }
  } else {
    breakdown.push('{grey-fg}— Netflow: no data{/}');
  }

  // ── Nansen DEX Volume ───────────────────────────────────
  const { buy, sell } = extractDexVolumeForToken(dexData, symbol);
  if (buy > 0 || sell > 0) {
    const ratio = buy / (buy + sell);
    if (ratio > 0.65)      { score += 2; breakdown.push(`🟢 DEX: ${pct(ratio)} buy pressure`); }
    else if (ratio > 0.55) { score += 1; breakdown.push(`🟡 DEX: ${pct(ratio)} buy-leaning`); }
    else if (ratio < 0.35) { score -= 2; breakdown.push(`🔴 DEX: ${pct(1-ratio)} sell pressure`); }
    else if (ratio < 0.45) { score -= 1; breakdown.push(`🟡 DEX: ${pct(1-ratio)} sell-leaning`); }
    else                   { breakdown.push(`⚖️  DEX: balanced (${pct(ratio)} buy)`); }
  } else {
    breakdown.push('{grey-fg}— DEX volume: no data{/}');
  }

  // ── Fear & Greed ────────────────────────────────────────
  const fgVal = fearGreed?.value ?? null;
  if (fgVal !== null) {
    if (fgVal <= FEAR_GREED_THRESHOLDS.EXTREME_FEAR) {
      score += 2; breakdown.push(`😱 F&G: ${fgVal} — Extreme Fear (contrarian buy)`);
    } else if (fgVal <= FEAR_GREED_THRESHOLDS.FEAR) {
      score += 1; breakdown.push(`😰 F&G: ${fgVal} — Fear`);
    } else if (fgVal >= FEAR_GREED_THRESHOLDS.EXTREME_GREED) {
      score -= 2; breakdown.push(`🤑 F&G: ${fgVal} — Extreme Greed (caution)`);
    } else if (fgVal >= FEAR_GREED_THRESHOLDS.GREED) {
      score -= 1; breakdown.push(`😀 F&G: ${fgVal} — Greed`);
    } else {
      breakdown.push(`😐 F&G: ${fgVal} — Neutral`);
    }
  }

  // ── Hyperliquid Funding Rate ─────────────────────────────
  const fr = fundingRates.find(f => f.coin.toUpperCase() === symbol.toUpperCase());
  const fundingRate = fr?.fundingRate ?? null;
  if (fundingRate !== null) {
    const frPct = (fundingRate * 100).toFixed(4);
    if (fundingRate < -0.0001) {
      score += 2; breakdown.push(`💰 Funding: ${frPct}% (longs paid → bullish)`);
    } else if (fundingRate < 0) {
      score += 1; breakdown.push(`💸 Funding: ${frPct}% (slightly bullish)`);
    } else if (fundingRate > 0.0003) {
      score -= 2; breakdown.push(`🔥 Funding: +${frPct}% (shorts paid → bearish)`);
    } else if (fundingRate > 0) {
      score -= 1; breakdown.push(`📈 Funding: +${frPct}% (slightly bearish)`);
    } else {
      breakdown.push(`⚡ Funding: ${frPct}% (neutral)`);
    }
  } else {
    breakdown.push('{grey-fg}— Funding: no data{/}');
  }

  // ── Label ───────────────────────────────────────────────
  let label: SignalLabel;
  if (score >= SIGNAL_THRESHOLDS.STRONG_BUY) label = 'STRONG BUY';
  else if (score >= SIGNAL_THRESHOLDS.BUY) label = 'BUY';
  else if (score <= SIGNAL_THRESHOLDS.STRONG_SELL) label = 'STRONG SELL';
  else if (score <= SIGNAL_THRESHOLDS.SELL) label = 'SELL';
  else label = 'NEUTRAL';

  return { symbol, score, label, netflow, buyVolume: buy, sellVolume: sell, fundingRate, fearGreed: fgVal, price, breakdown };
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pct(r: number): string {
  return `${(r * 100).toFixed(0)}%`;
}
