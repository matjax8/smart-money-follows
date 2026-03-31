"use strict";
// ============================================================
// index.ts — Main loop: wire everything together
// Smart Money Follows — Nansen CLI Build Challenge entry
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const dashboard_1 = require("./dashboard");
const nansen_1 = require("./nansen");
const sentiment_1 = require("./sentiment");
const signal_1 = require("./signal");
const trader_1 = require("./trader");
const config_1 = require("./config");
const dashboard = new dashboard_1.Dashboard();
let refreshCountdown = 30;
let lastTradeActions = [];
async function fetchAllData() {
    dashboard.update({ status: 'Fetching Nansen smart money data...' });
    // ── Batch Nansen calls ─────────────────────────────────
    // (cached for 60s, so rapid refreshes won't burn credits)
    const [netflowData, dexData, perpData, holdingsData, historicalData, dcaData, screenerData, perpLeaderboard, portfolioData,] = await Promise.allSettled([
        Promise.resolve((0, nansen_1.getSmartMoneyNetflow)()),
        Promise.resolve((0, nansen_1.getSmartMoneyDexTrades)()),
        Promise.resolve((0, nansen_1.getSmartMoneyPerpTrades)()),
        Promise.resolve((0, nansen_1.getSmartMoneyHoldings)()),
        Promise.resolve((0, nansen_1.getSmartMoneyHistoricalHoldings)()),
        Promise.resolve((0, nansen_1.getSmartMoneyDcas)()),
        Promise.resolve((0, nansen_1.getTokenScreener)()),
        Promise.resolve((0, nansen_1.getPerpLeaderboard)()),
        Promise.resolve((0, nansen_1.getSmartWalletPortfolio)()),
    ]);
    // Also fetch per-token data for ETH (most liquid)
    const ethToken = config_1.WATCHED_TOKENS.find(t => t.symbol === 'ETH');
    const [ethDexTrades, ethTransfers, ethHolders] = await Promise.allSettled([
        Promise.resolve((0, nansen_1.getTokenDexTrades)(ethToken.address, ethToken.chain)),
        Promise.resolve((0, nansen_1.getTokenTransfers)(ethToken.address, ethToken.chain)),
        Promise.resolve((0, nansen_1.getTokenHolders)(ethToken.address, ethToken.chain)),
    ]);
    const nf = netflowData.status === 'fulfilled' ? netflowData.value : null;
    const dex = dexData.status === 'fulfilled' ? dexData.value : null;
    const perp = perpData.status === 'fulfilled' ? perpData.value : null;
    dashboard.update({ status: 'Fetching sentiment data...' });
    // ── Sentiment ──────────────────────────────────────────
    const [fearGreed, fundingRates] = await Promise.all([
        (0, sentiment_1.getFearGreed)(),
        (0, sentiment_1.getHyperliquidFunding)(['ETH', 'BTC', 'SOL']),
    ]);
    dashboard.update({ status: 'Scoring signals...' });
    // ── Score each token ───────────────────────────────────
    const signals = config_1.WATCHED_TOKENS.map(token => (0, signal_1.scoreToken)(token.symbol, nf, dex, fearGreed, fundingRates));
    // ── Build smart money feed ─────────────────────────────
    const feed = (0, nansen_1.extractFeedEntries)(dex, perp);
    // Add screener insights
    const screener = screenerData.status === 'fulfilled' ? screenerData.value : null;
    if (screener?.data?.data) {
        const topToken = screener.data.data[0];
        if (topToken) {
            const dir = topToken.netflow > 0 ? '📈 inflow' : '📉 outflow';
            feed.push(`Token screener: ${topToken.token_symbol} leading ${dir} ($${fmtNum(Math.abs(topToken.netflow))})`);
        }
    }
    // Add perp leaderboard insight
    const lb = perpLeaderboard.status === 'fulfilled' ? perpLeaderboard.value : null;
    if (lb?.data) {
        const top = Array.isArray(lb.data) ? lb.data[0] : lb.data?.data?.[0];
        if (top) {
            const traderName = top.display_name || (top.address ? top.address.slice(0, 8) + '...' : '?');
            feed.push(`🏆 Top HL trader: ${traderName}`);
        }
    }
    // Add trade action messages
    for (const msg of lastTradeActions) {
        feed.unshift(msg);
    }
    lastTradeActions = [];
    // ── Update positions ───────────────────────────────────
    dashboard.update({ status: 'Updating positions...' });
    await (0, trader_1.updatePositions)();
    // ── Execute paper trades ───────────────────────────────
    dashboard.update({ status: 'Evaluating paper trades...' });
    for (const signal of signals) {
        const action = await (0, trader_1.executePaperTrade)(signal);
        if (action)
            lastTradeActions.push(action);
    }
    // ── Render ─────────────────────────────────────────────
    dashboard.update({
        signals,
        fearGreed,
        fundingRates,
        positions: (0, trader_1.getPositions)(),
        feed: feed.slice(0, 10),
        totalPnl: (0, trader_1.getTotalPnl)(),
        lastUpdated: new Date(),
        status: `Live  |  Nansen CLI v1.24.0  |  ${signals.length} tokens tracked  |  F&G: ${fearGreed?.value ?? 'N/A'}`,
    });
}
async function main() {
    (0, trader_1.loadTrades)();
    // Initial render
    dashboard.update({ status: 'Starting up...', feed: ['🐋 Smart Money Follows initialising...', 'Connecting to Nansen...'] });
    // First fetch
    await fetchAllData();
    // Countdown ticker (every second)
    let countdown = config_1.REFRESH_INTERVAL_MS / 1000;
    const ticker = setInterval(() => {
        countdown--;
        if (countdown <= 0)
            countdown = config_1.REFRESH_INTERVAL_MS / 1000;
        dashboard.update({ refreshCountdown: countdown });
    }, 1000);
    // Main refresh loop
    const loop = setInterval(async () => {
        countdown = config_1.REFRESH_INTERVAL_MS / 1000;
        await fetchAllData();
    }, config_1.REFRESH_INTERVAL_MS);
    process.on('SIGINT', () => {
        clearInterval(ticker);
        clearInterval(loop);
        dashboard.destroy();
        process.exit(0);
    });
}
function fmtNum(n) {
    if (n >= 1000000)
        return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(0)}K`;
    return n.toFixed(0);
}
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
