// ============================================================
// sentiment.ts — Fear & Greed Index + Hyperliquid funding
// Both free, no API key required
// ============================================================

import axios from 'axios';

export interface FearGreed {
  value: number;       // 0-100
  label: string;       // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
  timestamp: string;
}

export interface FundingRate {
  coin: string;
  fundingRate: number; // e.g. -0.0001
  openInterest: number;
  markPrice: number;
}

// Cache
let fgCache: { data: FearGreed; ts: number } | null = null;
let hlCache: { data: FundingRate[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

export async function getFearGreed(): Promise<FearGreed | null> {
  if (fgCache && Date.now() - fgCache.ts < CACHE_TTL) return fgCache.data;
  try {
    const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 });
    const d = res.data?.data?.[0];
    if (!d) return null;
    const data: FearGreed = {
      value: parseInt(d.value),
      label: d.value_classification,
      timestamp: d.timestamp,
    };
    fgCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export async function getHyperliquidFunding(coins = ['ETH', 'BTC', 'SOL']): Promise<FundingRate[]> {
  if (hlCache && Date.now() - hlCache.ts < CACHE_TTL) return hlCache.data;
  try {
    const res = await axios.post(
      'https://api.hyperliquid.xyz/info',
      { type: 'metaAndAssetCtxs' },
      { timeout: 8000, headers: { 'Content-Type': 'application/json' } }
    );
    const [meta, ctxs] = res.data as [any, any[]];
    const universe: any[] = meta?.universe ?? [];
    const rates: FundingRate[] = [];
    universe.forEach((asset: any, i: number) => {
      if (!coins.includes(asset.name)) return;
      const ctx = ctxs[i];
      if (!ctx) return;
      rates.push({
        coin: asset.name,
        fundingRate: parseFloat(ctx.funding ?? '0'),
        openInterest: parseFloat(ctx.openInterest ?? '0'),
        markPrice: parseFloat(ctx.markPx ?? '0'),
      });
    });
    hlCache = { data: rates, ts: Date.now() };
    return rates;
  } catch {
    return [];
  }
}
