// ============================================================
// nansen.ts — Wrapper around Nansen CLI (child_process exec)
// Caches results to avoid burning credits on rapid refreshes
// ============================================================

import { execSync } from 'child_process';
import { NANSEN_CACHE_TTL_S, WATCHED_TOKENS } from './config';

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
    const raw = execSync(`nansen ${args} 2>/dev/null`, {
      timeout: 25_000,
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
    const parsed = JSON.parse(raw);
    cache.set(cacheKey, { data: parsed, ts: now });
    return parsed;
  } catch {
    return null;
  }
}

// ── 1. Smart Money Netflow ────────────────────────────────
export function getSmartMoneyNetflow(chain = 'ethereum') {
  return nansenExec(`research smart-money netflow --chain ${chain} --limit 50`);
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

// ── 12. Portfolio (smart wallet) ─────────────────────────
export function getSmartWalletPortfolio(address: string) {
  return nansenExec(`research profiler balance --address ${address} --chain ethereum`);
}

// ── Nansen credit check (free, no credit cost) ──────────
export function getNansenCredits(): number | null {
  try {
    const raw = execSync('nansen account 2>/dev/null', { timeout: 5000 }).toString();
    const parsed = JSON.parse(raw);
    return parsed?.data?.credits_remaining ?? null;
  } catch {
    return null;
  }
}

// ── Helper: match a token symbol against watched aliases ─
function matchSymbol(apiSymbol: string, watchedSymbol: string): boolean {
  const upper = apiSymbol.toUpperCase();
  const token = WATCHED_TOKENS.find(t => t.symbol === watchedSymbol);
  if (!token) return upper === watchedSymbol.toUpperCase();
  return token.aliases.some(a => a.toUpperCase() === upper);
}

// ── Helper: get items from any Nansen response shape ─────
function getItems(data: any): any[] {
  if (!data?.success || !data?.data) return [];
  if (Array.isArray(data.data)) return data.data;
  if (data.data?.data && Array.isArray(data.data.data)) return data.data.data;
  return [];
}

// ── Helper: extract netflow for a specific token ─────────
// Field names per endpoint (verified against live API 2026-03-31):
//   token screener:      netflow
//   smart-money netflow:  net_flow_24h_usd, net_flow_1h_usd
export function extractNetflowForToken(data: any, symbol: string): number | null {
  const items = getItems(data);
  const match = items.find(t => matchSymbol(t.token_symbol ?? '', symbol));
  if (!match) return null;
  return match.netflow ?? match.net_flow_24h_usd ?? match.net_flow_1h_usd ?? match.net_flow ?? null;
}

// ── Helper: extract DEX buy/sell volumes for a token ─────
export function extractDexVolumeForToken(data: any, symbol: string): { buy: number; sell: number } {
  const empty = { buy: 0, sell: 0 };
  const items = getItems(data);
  const match = items.find(t => matchSymbol(t.token_symbol ?? '', symbol));
  if (!match) return empty;
  return {
    buy:  match.buy_volume  ?? match.volume_buy  ?? 0,
    sell: match.sell_volume ?? match.volume_sell ?? 0,
  };
}

// ── Helper: build feed entries from live data ────────────
// Uses actual field names from Nansen API (verified 2026-03-31)
export function extractFeedEntries(screenerData: any, perpData: any): string[] {
  const feed: string[] = [];

  // Screener top movers
  const screenerItems = getItems(screenerData);
  screenerItems.slice(0, 5).forEach(t => {
    const sym = t.token_symbol ?? '???';
    const nf = t.netflow ?? 0;
    const dir = nf > 0 ? '📈' : '📉';
    const vol = Math.abs(nf);
    const volStr = vol >= 1e6 ? `$${(vol/1e6).toFixed(1)}M` : vol >= 1e3 ? `$${(vol/1e3).toFixed(0)}K` : `$${vol.toFixed(0)}`;
    feed.push(`${dir} ${sym}: ${nf > 0 ? '+' : '-'}${volStr} net flow (DEX)`);
  });

  // Perp trades (fields: token_symbol, side, action, value_usd, trader_address_label)
  const perpItems = getItems(perpData);
  perpItems.slice(0, 5).forEach(t => {
    const coin = t.token_symbol ?? '???';
    const side = (t.side ?? '').toUpperCase();
    const action = (t.action ?? '').toUpperCase();
    const val = t.value_usd ?? 0;
    const valStr = val >= 1e6 ? `$${(val/1e6).toFixed(1)}M` : val >= 1e3 ? `$${(val/1e3).toFixed(0)}K` : `$${val.toFixed(0)}`;
    const label = t.trader_address_label || (t.trader_address ? t.trader_address.slice(0,6)+'…' : '?');
    feed.push(`🐋 ${label} ${action} ${side} ${coin} (${valStr})`);
  });

  return feed.slice(0, 12);
}
