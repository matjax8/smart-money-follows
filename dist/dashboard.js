"use strict";
// ============================================================
// dashboard.ts — Blessed terminal UI
// Bloomberg-style live dashboard, refreshes every 30s
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dashboard = void 0;
const blessed_1 = __importDefault(require("blessed"));
const SIGNAL_COLORS = {
    'STRONG BUY': '{green-fg}{bold}',
    'BUY': '{green-fg}',
    'NEUTRAL': '{yellow-fg}',
    'SELL': '{red-fg}',
    'STRONG SELL': '{red-fg}{bold}',
};
const SIGNAL_ICONS = {
    'STRONG BUY': '🚀',
    'BUY': '🟢',
    'NEUTRAL': '🟡',
    'SELL': '🔴',
    'STRONG SELL': '💀',
};
class Dashboard {
    constructor() {
        this.state = {
            signals: [],
            fearGreed: null,
            fundingRates: [],
            positions: [],
            feed: ['Initialising Smart Money scanner...'],
            totalPnl: 0,
            lastUpdated: new Date(),
            status: 'Fetching data...',
            refreshCountdown: 30,
        };
        this.screen = blessed_1.default.screen({
            smartCSR: true,
            title: '🐋 Smart Money Follows',
            fullUnicode: true,
        });
        // ── Header ─────────────────────────────────────────────
        this.headerBox = blessed_1.default.box({
            top: 0, left: 0, width: '100%', height: 3,
            tags: true, border: { type: 'line' },
            style: { border: { fg: 'cyan' }, bg: 'black' },
        });
        // ── Signal Board (left) ────────────────────────────────
        this.signalBox = blessed_1.default.box({
            top: 3, left: 0, width: '35%', height: '60%-3',
            tags: true, border: { type: 'line' },
            label: ' {bold}{cyan-fg}SIGNAL BOARD{/} ',
            style: { border: { fg: 'cyan' } },
        });
        // ── Smart Money Feed (right) ───────────────────────────
        this.feedBox = blessed_1.default.box({
            top: 3, left: '35%', width: '65%', height: '60%-3',
            tags: true, border: { type: 'line' },
            label: ' {bold}{cyan-fg}SMART MONEY FEED{/} ',
            style: { border: { fg: 'cyan' } },
            scrollable: true,
        });
        // ── Positions ──────────────────────────────────────────
        this.positionBox = blessed_1.default.box({
            top: '60%', left: 0, width: '100%', height: '40%-1',
            tags: true, border: { type: 'line' },
            label: ' {bold}{cyan-fg}PAPER POSITIONS{/} ',
            style: { border: { fg: 'cyan' } },
        });
        // ── Status Bar ─────────────────────────────────────────
        this.statusBox = blessed_1.default.box({
            bottom: 0, left: 0, width: '100%', height: 1,
            tags: true,
            style: { bg: 'cyan', fg: 'black' },
        });
        this.screen.append(this.headerBox);
        this.screen.append(this.signalBox);
        this.screen.append(this.feedBox);
        this.screen.append(this.positionBox);
        this.screen.append(this.statusBox);
        // ── Quit keys ──────────────────────────────────────────
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.screen.destroy();
            process.exit(0);
        });
    }
    update(state) {
        Object.assign(this.state, state);
        this.render();
    }
    render() {
        const { signals, fearGreed, fundingRates, positions, feed, totalPnl, lastUpdated, status, refreshCountdown } = this.state;
        // ── Header ─────────────────────────────────────────────
        const fgStr = fearGreed
            ? `F&G: {bold}${fearGreed.value}{/bold} (${fearGreed.label})`
            : 'F&G: {yellow-fg}N/A{/}';
        const timeStr = lastUpdated.toUTCString().slice(17, 25) + ' UTC';
        const nextRefresh = `Next refresh: ${refreshCountdown}s`;
        this.headerBox.setContent(`  {bold}{cyan-fg}🐋 SMART MONEY FOLLOWS{/}   │   ${fgStr}   │   {white-fg}${timeStr}{/}   │   {yellow-fg}${nextRefresh}{/}`);
        // ── Signals ────────────────────────────────────────────
        if (signals.length === 0) {
            this.signalBox.setContent('\n  {yellow-fg}Loading signals...{/}');
        }
        else {
            const lines = signals.map(s => {
                const col = SIGNAL_COLORS[s.label];
                const icon = SIGNAL_ICONS[s.label];
                const scoreStr = (s.score > 0 ? '+' : '') + s.score;
                const fr = fundingRates.find(f => f.coin.toUpperCase() === s.symbol.toUpperCase());
                const frStr = fr ? `  FR: ${(fr.fundingRate * 100).toFixed(4)}%` : '';
                return `  ${icon} {bold}${s.symbol.padEnd(5)}{/} ${col}${s.label.padEnd(11)}{/}  [${scoreStr}]${frStr}`;
            });
            this.signalBox.setContent('\n' + lines.join('\n'));
        }
        // ── Feed ───────────────────────────────────────────────
        if (feed.length === 0) {
            this.feedBox.setContent('\n  {yellow-fg}Waiting for data...{/}');
        }
        else {
            const lines = feed.map((f, i) => {
                const ts = new Date().toTimeString().slice(0, 8);
                return `  {grey-fg}[${ts}]{/}  ${f}`;
            });
            this.feedBox.setContent('\n' + lines.join('\n'));
        }
        // ── Positions ──────────────────────────────────────────
        if (positions.length === 0) {
            const pnlColour = totalPnl >= 0 ? 'green' : 'red';
            this.positionBox.setContent(`\n  {grey-fg}No open positions{/}   Total Session P&L: {${pnlColour}-fg}{bold}$${totalPnl.toFixed(2)}{/}{/}`);
        }
        else {
            const headers = `  ${'SYMBOL'.padEnd(7)} ${'SIDE'.padEnd(7)} ${'ENTRY'.padEnd(10)} ${'CURRENT'.padEnd(10)} ${'SIZE'.padEnd(8)} P&L`;
            const rows = positions.map(p => {
                const pnlStr = p.pnlUsd >= 0
                    ? `{green-fg}+$${p.pnlUsd.toFixed(2)}{/}`
                    : `{red-fg}-$${Math.abs(p.pnlUsd).toFixed(2)}{/}`;
                const sideCol = p.side === 'LONG' ? '{green-fg}LONG{/}' : '{red-fg}SHORT{/}';
                return `  ${p.symbol.padEnd(7)} ${sideCol.padEnd(p.side === 'LONG' ? 18 : 19)} $${p.entryPrice.toFixed(2).padEnd(10)} $${p.currentPrice.toFixed(2).padEnd(10)} $${p.usdSize.toFixed(0).padEnd(8)} ${pnlStr}`;
            });
            const pnlColour = totalPnl >= 0 ? 'green' : 'red';
            const totalStr = `  {bold}Total P&L: {${pnlColour}-fg}$${totalPnl.toFixed(2)}{/}{/}`;
            this.positionBox.setContent('\n' + `  {bold}{grey-fg}${headers}{/}{/}` + '\n' + rows.join('\n') + '\n\n' + totalStr);
        }
        // ── Status ─────────────────────────────────────────────
        this.statusBox.setContent(` ${status}  |  Press Q to quit`);
        this.screen.render();
    }
    destroy() {
        this.screen.destroy();
    }
}
exports.Dashboard = Dashboard;
