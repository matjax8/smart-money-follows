"use strict";
// ============================================================
// sentiment.ts — Fear & Greed Index + Hyperliquid funding
// Both free, no API key required
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFearGreed = getFearGreed;
exports.getHyperliquidFunding = getHyperliquidFunding;
const axios_1 = __importDefault(require("axios"));
// Cache
let fgCache = null;
let hlCache = null;
const CACHE_TTL = 60000;
async function getFearGreed() {
    if (fgCache && Date.now() - fgCache.ts < CACHE_TTL)
        return fgCache.data;
    try {
        const res = await axios_1.default.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 });
        const d = res.data?.data?.[0];
        if (!d)
            return null;
        const data = {
            value: parseInt(d.value),
            label: d.value_classification,
            timestamp: d.timestamp,
        };
        fgCache = { data, ts: Date.now() };
        return data;
    }
    catch {
        return null;
    }
}
async function getHyperliquidFunding(coins = ['ETH', 'BTC', 'SOL']) {
    if (hlCache && Date.now() - hlCache.ts < CACHE_TTL)
        return hlCache.data;
    try {
        const res = await axios_1.default.post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }, { timeout: 8000, headers: { 'Content-Type': 'application/json' } });
        const [meta, ctxs] = res.data;
        const universe = meta?.universe ?? [];
        const rates = [];
        universe.forEach((asset, i) => {
            if (!coins.includes(asset.name))
                return;
            const ctx = ctxs[i];
            if (!ctx)
                return;
            rates.push({
                coin: asset.name,
                fundingRate: parseFloat(ctx.funding ?? '0'),
                openInterest: parseFloat(ctx.openInterest ?? '0'),
                markPrice: parseFloat(ctx.markPx ?? '0'),
            });
        });
        hlCache = { data: rates, ts: Date.now() };
        return rates;
    }
    catch {
        return [];
    }
}
