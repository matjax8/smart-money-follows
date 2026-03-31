// ============================================================
// nansen.ts — Wrapper around Nansen CLI (child_process exec)
// Caches results to avoid burning credits on rapid refreshes
// ============================================================

import { execSync } from 'child_process';
import { NANSEN_CACHE_TTL_S } from './config';

interface CacheEntry {
  data: any;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

function nansenExec(args: string): any {
  const cacheKey = args;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < NANSEN_CACHE_TTL_S * 1000) {
    return cached.data;
  }
  try {
    const raw = execSync(`nansen ${args} 2>/dev/null`, { timeout: 20_000 }).toString();
    const parsed = JSON.parse(raw);
    cache.set(cacheKey, { data: parsed, ts: now });
    return parsed;
  } catch (e) {
    return null;
  }
}

// ── 1. Smart Money Netflow ────────────────────────────────
export function getSmartMoneyNetflow(chain = 'ethereum') {
  return nansenExec(`research smart-money netflow --chain ${chain}`);
}

// ── 2. Smart Money DEX Trades ────────────────────────────
export function getSmartMoneyDexTrades(chain = 'ethereum') {
  return nansenExec(`research smart-money dex-trades --chain ${chain} --limit 20`);
}

// ── 3. Smart Money Perp Trades ───────────────────────────
export function getSmartMoneyPerpTrades() {
  return nansenExec(`research smart-money perp-trades --limit 20`);
}

// ── 4. Smart Money Holdings ──────────────────────────────
export function getSmartMoneyHoldings(chain = 'ethereum') {
  return nansenExec(`research smart-money holdings --chain ${chain} --limit 20`);
}

// ── 5. Smart Money Historical Holdings ───────────────────
export function getSmartMoneyHistoricalHoldings(chain = 'ethereum') {
  return nansenExec(`research smart-money historical-holdings --chain ${chain} --limit 10`);
}

// ── 6. Smart Money DCAs ──────────────────────────────────
export function getSmartMoneyDcas(chain = 'ethereum') {
  return nansenExec(`research smart-money dcas --chain ${chain} --limit 10`);
}

// ── 7. Token Screener ────────────────────────────────────
// Note: costs 10 credits on free tier — aggressively cached (60s)
// --include-stablecoins false so ETH/BTC/SOL/LINK/UNI appear in results
export function getTokenScreener(chain = 'ethereum') {
  return nansenExec(`research token screener --chain ${chain} --timeframe 24h --include-stablecoins false --limit 50`);
}

// ── 8. Token DEX Trades ──────────────────────────────────
export function getTokenDexTrades(tokenAddress: string, chain = 'ethereum') {
  return nansenExec(`research token dex-trades --token ${tokenAddress} --chain ${chain} --limit 10`);
}

// ── 9. Token Transfers ───────────────────────────────────
export function getTokenTransfers(tokenAddress: string, chain = 'ethereum') {
  return nansenExec(`research token transfers --token ${tokenAddress} --chain ${chain} --limit 10`);
}

// ── 10. Token Top Holders ────────────────────────────────
export function getTokenHolders(tokenAddress: string, chain = 'ethereum') {
  return nansenExec(`research token holders --token ${tokenAddress} --chain ${chain} --limit 10`);
}

// ── 11. Perp Leaderboard ─────────────────────────────────
export function getPerpLeaderboard() {
  return nansenExec(`research perp leaderboard --limit 10`);
}

// ── 12. Portfolio (top smart wallet) ─────────────────────
// Use a well-known smart wallet address (0x3f5CE5... = Binance hot wallet as example)
export function getSmartWalletPortfolio(address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045') {
  return nansenExec(`research profiler balance --address ${address} --chain ethereum`);
}

// ── Helper: extract netflow data for a specific token ─────
// Field names differ per endpoint (verified against live API):
//   token screener:      netflow
//   smart-money netflow: net_flow_24h_usd, net_flow_1h_usd
export function extractNetflowForToken(netflowData: any, tokenSymbol: string): number | null {
  if (!netflowData?.success || !netflowData?.data) return null;
  const items: any[] = Array.isArray(netflowData.data)
    ? netflowData.data
    : netflowData.data?.data ?? [];
  const match = items.find((t: any) =>
    t.token_symbol?.toUpperCase() === tokenSymbol.toUpperCase()
  );
  if (!match) return null;
  return match.netflow ?? match.net_flow_24h_usd ?? match.net_flow_1h_usd ?? match.net_flow ?? null;
}

// ── Helper: extract DEX buy/sell volumes for a token ─────
// Works with both smart-money dex-trades AND token screener data shapes
export function extractDexVolumeForToken(dexData: any, tokenSymbol: string): { buy: number, sell: number } {
  const empty = { buy: 0, sell: 0 };
  if (!dexData?.success || !dexData?.data) return empty;
  const items: any[] = Array.isArray(dexData.data)
    ? dexData.data
    : dexData.data?.data ?? [];
  const match = items.find((t: any) =>
    t.token_symbol?.toUpperCase() === tokenSymbol.toUpperCase()
  );
  if (!match) return empty;
  return {
    buy:  match.buy_volume  ?? match.volume_buy  ?? 0,
    sell: match.sell_volume ?? match.volume_sell ?? 0,
  };
}

// ── Helper: extract recent feed entries ──────────────────
export function extractFeedEntries(dexData: any, perpData: any): string[] {
  const feed: string[] = [];
  // DEX trades
  const dexItems: any[] = Array.isArray(dexData?.data)
    ? dexData.data
    : dexData?.data?.data ?? [];
  dexItems.slice(0, 5).forEach((t: any) => {
    const sym = t.token_symbol ?? '???';
    const dir = (t.buy_volume ?? 0) > (t.sell_volume ?? 0) ? 'bought' : 'sold';
    feed.push(`Smart Money ${dir} ${sym} on DEX`);
  });
  // Perp trades
  const perpItems: any[] = Array.isArray(perpData?.data)
    ? perpData.data
    : perpData?.data?.data ?? [];
  perpItems.slice(0, 3).forEach((t: any) => {
    const coin = t.coin ?? t.symbol ?? '???';
    const side = t.side ?? (t.is_long ? 'LONG' : 'SHORT');
    feed.push(`Smart Perp Trader ${side} ${coin}`);
  });
  return feed.slice(0, 8);
}
