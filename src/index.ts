// ============================================================
// index.ts — Main loop: wire everything together
// Smart Money Follows — Nansen CLI Build Challenge entry
// ============================================================

import { Dashboard } from './dashboard';
import {
  getSmartMoneyNetflow,
  getSmartMoneyDexTrades,
  getSmartMoneyPerpTrades,
  getSmartMoneyHoldings,
  getSmartMoneyHistoricalHoldings,
  getSmartMoneyDcas,
  getTokenScreener,
  getTokenDexTrades,
  getTokenTransfers,
  getTokenHolders,
  getPerpLeaderboard,
  getSmartWalletPortfolio,
  extractFeedEntries,
} from './nansen';
import { getFearGreed, getHyperliquidFunding } from './sentiment';
import { scoreToken, TokenSignal } from './signal';
import { executePaperTrade, updatePositions, getPositions, getTotalPnl, loadTrades } from './trader';
import { WATCHED_TOKENS, REFRESH_INTERVAL_MS } from './config';

const dashboard = new Dashboard();
let refreshCountdown = 30;
let lastTradeActions: string[] = [];

async function fetchAllData() {
  dashboard.update({ status: 'Fetching Nansen smart money data...' });

  // ── Batch Nansen calls ─────────────────────────────────
  // (cached for 60s, so rapid refreshes won't burn credits)
  const [
    netflowData,
    dexData,
    perpData,
    holdingsData,
    historicalData,
    dcaData,
    screenerData,
    perpLeaderboard,
    portfolioData,
  ] = await Promise.allSettled([
    Promise.resolve(getSmartMoneyNetflow()),
    Promise.resolve(getSmartMoneyDexTrades()),
    Promise.resolve(getSmartMoneyPerpTrades()),
    Promise.resolve(getSmartMoneyHoldings()),
    Promise.resolve(getSmartMoneyHistoricalHoldings()),
    Promise.resolve(getSmartMoneyDcas()),
    Promise.resolve(getTokenScreener()),
    Promise.resolve(getPerpLeaderboard()),
    Promise.resolve(getSmartWalletPortfolio()),
  ]);

  // Also fetch per-token data for ETH (most liquid)
  const ethToken = WATCHED_TOKENS.find(t => t.symbol === 'ETH')!;
  const [ethDexTrades, ethTransfers, ethHolders] = await Promise.allSettled([
    Promise.resolve(getTokenDexTrades(ethToken.address, ethToken.chain)),
    Promise.resolve(getTokenTransfers(ethToken.address, ethToken.chain)),
    Promise.resolve(getTokenHolders(ethToken.address, ethToken.chain)),
  ]);

  const nf = netflowData.status === 'fulfilled' ? netflowData.value : null;
  const dex = dexData.status === 'fulfilled' ? dexData.value : null;
  const perp = perpData.status === 'fulfilled' ? perpData.value : null;

  dashboard.update({ status: 'Fetching sentiment data...' });

  // ── Sentiment ──────────────────────────────────────────
  const [fearGreed, fundingRates] = await Promise.all([
    getFearGreed(),
    getHyperliquidFunding(['ETH', 'BTC', 'SOL']),
  ]);

  dashboard.update({ status: 'Scoring signals...' });

  // ── Score each token ───────────────────────────────────
  const signals: TokenSignal[] = WATCHED_TOKENS.map(token =>
    scoreToken(token.symbol, nf, dex, fearGreed, fundingRates)
  );

  // ── Build smart money feed ─────────────────────────────
  const feed = extractFeedEntries(dex, perp);

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
      const traderName = top.display_name || (top.address ? top.address.slice(0,8)+'...' : '?');
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
  await updatePositions();

  // ── Execute paper trades ───────────────────────────────
  dashboard.update({ status: 'Evaluating paper trades...' });
  for (const signal of signals) {
    const action = await executePaperTrade(signal);
    if (action) lastTradeActions.push(action);
  }

  // ── Render ─────────────────────────────────────────────
  dashboard.update({
    signals,
    fearGreed,
    fundingRates,
    positions: getPositions(),
    feed: feed.slice(0, 10),
    totalPnl: getTotalPnl(),
    lastUpdated: new Date(),
    status: `Live  |  Nansen CLI v1.24.0  |  ${signals.length} tokens tracked  |  F&G: ${fearGreed?.value ?? 'N/A'}`,
  });
}

async function main() {
  loadTrades();

  // Initial render
  dashboard.update({ status: 'Starting up...', feed: ['🐋 Smart Money Follows initialising...', 'Connecting to Nansen...'] });

  // First fetch
  await fetchAllData();

  // Countdown ticker (every second)
  let countdown = REFRESH_INTERVAL_MS / 1000;
  const ticker = setInterval(() => {
    countdown--;
    if (countdown <= 0) countdown = REFRESH_INTERVAL_MS / 1000;
    dashboard.update({ refreshCountdown: countdown });
  }, 1000);

  // Main refresh loop
  const loop = setInterval(async () => {
    countdown = REFRESH_INTERVAL_MS / 1000;
    await fetchAllData();
  }, REFRESH_INTERVAL_MS);

  process.on('SIGINT', () => {
    clearInterval(ticker);
    clearInterval(loop);
    dashboard.destroy();
    process.exit(0);
  });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
