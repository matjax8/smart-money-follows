"use strict";
// ============================================================
// signal.ts — Signal scoring engine
// Combines Nansen smart money + F&G + Hyperliquid funding
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreToken = scoreToken;
const nansen_1 = require("./nansen");
const config_1 = require("./config");
function scoreToken(symbol, netflowData, dexData, fearGreed, fundingRates) {
    let score = 0;
    const breakdown = [];
    // ── Nansen Smart Money Netflow ──────────────────────────
    const netflow = (0, nansen_1.extractNetflowForToken)(netflowData, symbol);
    if (netflow !== null) {
        if (netflow > 500000) {
            score += 3;
            breakdown.push(`⬆ Netflow +$${fmt(netflow)} (strong buy)`);
        }
        else if (netflow > 0) {
            score += 1;
            breakdown.push(`⬆ Netflow +$${fmt(netflow)}`);
        }
        else if (netflow < -500000) {
            score -= 3;
            breakdown.push(`⬇ Netflow -$${fmt(Math.abs(netflow))} (strong sell)`);
        }
        else if (netflow < 0) {
            score -= 1;
            breakdown.push(`⬇ Netflow -$${fmt(Math.abs(netflow))}`);
        }
    }
    // ── Nansen DEX Volume ───────────────────────────────────
    const { buy, sell } = (0, nansen_1.extractDexVolumeForToken)(dexData, symbol);
    if (buy > 0 || sell > 0) {
        const ratio = buy / (buy + sell + 0.001);
        if (ratio > 0.65) {
            score += 2;
            breakdown.push(`🟢 DEX: ${pct(ratio)} buy pressure`);
        }
        else if (ratio > 0.55) {
            score += 1;
            breakdown.push(`🟡 DEX: ${pct(ratio)} buy pressure`);
        }
        else if (ratio < 0.35) {
            score -= 2;
            breakdown.push(`🔴 DEX: ${pct(1 - ratio)} sell pressure`);
        }
        else if (ratio < 0.45) {
            score -= 1;
            breakdown.push(`🟡 DEX: ${pct(1 - ratio)} sell pressure`);
        }
    }
    // ── Fear & Greed ────────────────────────────────────────
    const fgVal = fearGreed?.value ?? null;
    if (fgVal !== null) {
        if (fgVal <= config_1.FEAR_GREED_THRESHOLDS.EXTREME_FEAR) {
            score += 2;
            breakdown.push(`😱 F&G: ${fgVal} (Extreme Fear = buy zone)`);
        }
        else if (fgVal <= config_1.FEAR_GREED_THRESHOLDS.FEAR) {
            score += 1;
            breakdown.push(`😰 F&G: ${fgVal} (Fear)`);
        }
        else if (fgVal >= config_1.FEAR_GREED_THRESHOLDS.EXTREME_GREED) {
            score -= 2;
            breakdown.push(`🤑 F&G: ${fgVal} (Extreme Greed = caution)`);
        }
        else if (fgVal >= config_1.FEAR_GREED_THRESHOLDS.GREED) {
            score -= 1;
            breakdown.push(`😀 F&G: ${fgVal} (Greed)`);
        }
    }
    // ── Hyperliquid Funding Rate ─────────────────────────────
    const fr = fundingRates.find(f => f.coin.toUpperCase() === symbol.toUpperCase());
    const fundingRate = fr?.fundingRate ?? null;
    if (fundingRate !== null) {
        if (fundingRate < -0.0001) {
            score += 2;
            breakdown.push(`💰 Funding: ${(fundingRate * 100).toFixed(4)}% (longs paid = bullish)`);
        }
        else if (fundingRate < 0) {
            score += 1;
            breakdown.push(`💸 Funding: ${(fundingRate * 100).toFixed(4)}% (slightly bullish)`);
        }
        else if (fundingRate > 0.0003) {
            score -= 2;
            breakdown.push(`🔥 Funding: +${(fundingRate * 100).toFixed(4)}% (shorts paid = bearish)`);
        }
        else if (fundingRate > 0) {
            score -= 1;
            breakdown.push(`📈 Funding: +${(fundingRate * 100).toFixed(4)}% (slightly bearish)`);
        }
    }
    // ── Label ───────────────────────────────────────────────
    let label;
    if (score >= config_1.SIGNAL_THRESHOLDS.STRONG_BUY)
        label = 'STRONG BUY';
    else if (score >= config_1.SIGNAL_THRESHOLDS.BUY)
        label = 'BUY';
    else if (score <= config_1.SIGNAL_THRESHOLDS.STRONG_SELL)
        label = 'STRONG SELL';
    else if (score <= config_1.SIGNAL_THRESHOLDS.SELL)
        label = 'SELL';
    else
        label = 'NEUTRAL';
    return { symbol, score, label, netflow, buyVolume: buy, sellVolume: sell, fundingRate, fearGreed: fgVal, breakdown };
}
function fmt(n) {
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(0)}K`;
    return n.toFixed(0);
}
function pct(r) {
    return `${(r * 100).toFixed(0)}%`;
}
