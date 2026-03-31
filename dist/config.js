"use strict";
// ============================================================
// config.ts — Tokens to watch + signal thresholds
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAPER_TRADE_SIZE_USD = exports.NANSEN_CACHE_TTL_S = exports.REFRESH_INTERVAL_MS = exports.FEAR_GREED_THRESHOLDS = exports.SIGNAL_THRESHOLDS = exports.WATCHED_TOKENS = void 0;
exports.WATCHED_TOKENS = [
    { symbol: 'ETH', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', chain: 'ethereum' },
    { symbol: 'BTC', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', chain: 'ethereum' }, // WBTC
    { symbol: 'SOL', address: '0xd31a59c85ae9d8edefec411d448f90841571b89c', chain: 'ethereum' }, // SOL (wormhole)
    { symbol: 'LINK', address: '0x514910771af9ca656af840dff83e8264ecf986ca', chain: 'ethereum' },
    { symbol: 'UNI', address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', chain: 'ethereum' },
];
exports.SIGNAL_THRESHOLDS = {
    STRONG_BUY: 5,
    BUY: 3,
    SELL: -3,
    STRONG_SELL: -5,
};
exports.FEAR_GREED_THRESHOLDS = {
    EXTREME_FEAR: 25,
    FEAR: 45,
    GREED: 55,
    EXTREME_GREED: 75,
};
exports.REFRESH_INTERVAL_MS = 30000; // 30 seconds
exports.NANSEN_CACHE_TTL_S = 60; // cache Nansen calls for 60s to save credits
exports.PAPER_TRADE_SIZE_USD = 1000; // paper trade size per signal
