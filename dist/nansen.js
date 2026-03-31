"use strict";
// ============================================================
// nansen.ts — Wrapper around Nansen CLI (child_process exec)
// Caches results to avoid burning credits on rapid refreshes
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSmartMoneyNetflow = getSmartMoneyNetflow;
exports.getSmartMoneyDexTrades = getSmartMoneyDexTrades;
exports.getSmartMoneyPerpTrades = getSmartMoneyPerpTrades;
exports.getSmartMoneyHoldings = getSmartMoneyHoldings;
exports.getSmartMoneyHistoricalHoldings = getSmartMoneyHistoricalHoldings;
exports.getSmartMoneyDcas = getSmartMoneyDcas;
exports.getTokenScreener = getTokenScreener;
exports.getTokenDexTrades = getTokenDexTrades;
exports.getTokenTransfers = getTokenTransfers;
exports.getTokenHolders = getTokenHolders;
exports.getPerpLeaderboard = getPerpLeaderboard;
exports.getSmartWalletPortfolio = getSmartWalletPortfolio;
exports.extractNetflowForToken = extractNetflowForToken;
exports.extractDexVolumeForToken = extractDexVolumeForToken;
exports.extractFeedEntries = extractFeedEntries;
const child_process_1 = require("child_process");
const config_1 = require("./config");
const cache = new Map();
function nansenExec(args) {
    const cacheKey = args;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.ts < config_1.NANSEN_CACHE_TTL_S * 1000) {
        return cached.data;
    }
    try {
        const raw = (0, child_process_1.execSync)(`nansen ${args} 2>/dev/null`, { timeout: 20000 }).toString();
        const parsed = JSON.parse(raw);
        cache.set(cacheKey, { data: parsed, ts: now });
        return parsed;
    }
    catch (e) {
        return null;
    }
}
// ── 1. Smart Money Netflow ────────────────────────────────
function getSmartMoneyNetflow(chain = 'ethereum') {
    return nansenExec(`research smart-money netflow --chain ${chain}`);
}
// ── 2. Smart Money DEX Trades ────────────────────────────
function getSmartMoneyDexTrades(chain = 'ethereum') {
    return nansenExec(`research smart-money dex-trades --chain ${chain} --limit 20`);
}
// ── 3. Smart Money Perp Trades ───────────────────────────
function getSmartMoneyPerpTrades() {
    return nansenExec(`research smart-money perp-trades --limit 20`);
}
// ── 4. Smart Money Holdings ──────────────────────────────
function getSmartMoneyHoldings(chain = 'ethereum') {
    return nansenExec(`research smart-money holdings --chain ${chain} --limit 20`);
}
// ── 5. Smart Money Historical Holdings ───────────────────
function getSmartMoneyHistoricalHoldings(chain = 'ethereum') {
    return nansenExec(`research smart-money historical-holdings --chain ${chain} --limit 10`);
}
// ── 6. Smart Money DCAs ──────────────────────────────────
function getSmartMoneyDcas(chain = 'ethereum') {
    return nansenExec(`research smart-money dcas --chain ${chain} --limit 10`);
}
// ── 7. Token Screener ────────────────────────────────────
function getTokenScreener(chain = 'ethereum') {
    return nansenExec(`research token screener --chain ${chain} --timeframe 24h --limit 20`);
}
// ── 8. Token DEX Trades ──────────────────────────────────
function getTokenDexTrades(tokenAddress, chain = 'ethereum') {
    return nansenExec(`research token dex-trades --token ${tokenAddress} --chain ${chain} --limit 10`);
}
// ── 9. Token Transfers ───────────────────────────────────
function getTokenTransfers(tokenAddress, chain = 'ethereum') {
    return nansenExec(`research token transfers --token ${tokenAddress} --chain ${chain} --limit 10`);
}
// ── 10. Token Top Holders ────────────────────────────────
function getTokenHolders(tokenAddress, chain = 'ethereum') {
    return nansenExec(`research token holders --token ${tokenAddress} --chain ${chain} --limit 10`);
}
// ── 11. Perp Leaderboard ─────────────────────────────────
function getPerpLeaderboard() {
    return nansenExec(`research perp leaderboard --limit 10`);
}
// ── 12. Portfolio (top smart wallet) ─────────────────────
// Use a well-known smart wallet address (0x3f5CE5... = Binance hot wallet as example)
function getSmartWalletPortfolio(address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045') {
    return nansenExec(`research profiler balance --address ${address} --chain ethereum`);
}
// ── Helper: extract netflow data for a specific token ─────
function extractNetflowForToken(netflowData, tokenSymbol) {
    if (!netflowData?.success || !netflowData?.data)
        return null;
    const items = Array.isArray(netflowData.data)
        ? netflowData.data
        : netflowData.data?.data ?? [];
    const match = items.find((t) => t.token_symbol?.toUpperCase() === tokenSymbol.toUpperCase());
    return match ? (match.netflow ?? match.net_flow ?? null) : null;
}
// ── Helper: extract DEX buy/sell volumes for a token ─────
function extractDexVolumeForToken(dexData, tokenSymbol) {
    const empty = { buy: 0, sell: 0 };
    if (!dexData?.success || !dexData?.data)
        return empty;
    const items = Array.isArray(dexData.data)
        ? dexData.data
        : dexData.data?.data ?? [];
    const match = items.find((t) => t.token_symbol?.toUpperCase() === tokenSymbol.toUpperCase());
    if (!match)
        return empty;
    return {
        buy: match.buy_volume ?? match.volume_buy ?? 0,
        sell: match.sell_volume ?? match.volume_sell ?? 0,
    };
}
// ── Helper: extract recent feed entries ──────────────────
function extractFeedEntries(dexData, perpData) {
    const feed = [];
    // DEX trades
    const dexItems = Array.isArray(dexData?.data)
        ? dexData.data
        : dexData?.data?.data ?? [];
    dexItems.slice(0, 5).forEach((t) => {
        const sym = t.token_symbol ?? '???';
        const dir = (t.buy_volume ?? 0) > (t.sell_volume ?? 0) ? 'bought' : 'sold';
        feed.push(`Smart Money ${dir} ${sym} on DEX`);
    });
    // Perp trades
    const perpItems = Array.isArray(perpData?.data)
        ? perpData.data
        : perpData?.data?.data ?? [];
    perpItems.slice(0, 3).forEach((t) => {
        const coin = t.coin ?? t.symbol ?? '???';
        const side = t.side ?? (t.is_long ? 'LONG' : 'SHORT');
        feed.push(`Smart Perp Trader ${side} ${coin}`);
    });
    return feed.slice(0, 8);
}
