// ============================================================
// dashboard.ts — Blessed terminal UI
// Bloomberg-style live dashboard, refreshes every 30s
// ============================================================

import blessed from 'blessed';
import { TokenSignal, SignalLabel } from './signal';
import { FearGreed, FundingRate } from './sentiment';
import { Position } from './trader';

export interface DashboardState {
  signals: TokenSignal[];
  fearGreed: FearGreed | null;
  fundingRates: FundingRate[];
  positions: Position[];
  feed: string[];
  totalPnl: number;
  lastUpdated: Date;
  status: string;
  refreshCountdown: number;
  nansenCredits: number | null;
  selectedSignal: number; // index into signals array for breakdown view
}

const SIGNAL_COLORS: Record<SignalLabel, string> = {
  'STRONG BUY':  '{green-fg}{bold}',
  'BUY':         '{green-fg}',
  'NEUTRAL':     '{yellow-fg}',
  'SELL':        '{red-fg}',
  'STRONG SELL': '{red-fg}{bold}',
};

const SIGNAL_ICONS: Record<SignalLabel, string> = {
  'STRONG BUY':  '🚀',
  'BUY':         '🟢',
  'NEUTRAL':     '🟡',
  'SELL':        '🔴',
  'STRONG SELL': '💀',
};

function fmtPrice(p: number): string {
  if (p >= 10_000) return `$${p.toFixed(0)}`;
  if (p >= 100) return `$${p.toFixed(1)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function fgColor(val: number): string {
  if (val <= 25) return '{red-fg}{bold}';
  if (val <= 45) return '{red-fg}';
  if (val >= 75) return '{green-fg}{bold}';
  if (val >= 55) return '{green-fg}';
  return '{yellow-fg}';
}

export class Dashboard {
  private screen: blessed.Widgets.Screen;
  private headerBox: blessed.Widgets.BoxElement;
  private signalBox: blessed.Widgets.BoxElement;
  private breakdownBox: blessed.Widgets.BoxElement;
  private feedBox: blessed.Widgets.BoxElement;
  private positionBox: blessed.Widgets.BoxElement;
  private statusBox: blessed.Widgets.BoxElement;
  private state: DashboardState;

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
      nansenCredits: null,
      selectedSignal: 0,
    };

    this.screen = blessed.screen({
      smartCSR: true,
      title: '🐋 Smart Money Follows',
      fullUnicode: true,
    });

    // ── Header (3 rows) ────────────────────────────────────
    this.headerBox = blessed.box({
      top: 0, left: 0, width: '100%', height: 3,
      tags: true, border: { type: 'line' },
      style: { border: { fg: 'cyan' }, bg: 'black' },
    });

    // ── Signal Board (top-left, 40%) ───────────────────────
    this.signalBox = blessed.box({
      top: 3, left: 0, width: '40%', height: '35%-1',
      tags: true, border: { type: 'line' },
      label: ' {bold}{cyan-fg}📊 SIGNALS{/} ',
      style: { border: { fg: 'cyan' } },
    });

    // ── Signal Breakdown (top-right, 60%) ──────────────────
    this.breakdownBox = blessed.box({
      top: 3, left: '40%', width: '60%', height: '35%-1',
      tags: true, border: { type: 'line' },
      label: ' {bold}{cyan-fg}🔍 SIGNAL BREAKDOWN{/} ',
      style: { border: { fg: 'cyan' } },
      scrollable: true,
    });

    // ── Smart Money Feed (middle, full width) ──────────────
    this.feedBox = blessed.box({
      top: '35%+2', left: 0, width: '100%', height: '30%-2',
      tags: true, border: { type: 'line' },
      label: ' {bold}{cyan-fg}🐋 SMART MONEY FEED{/} ',
      style: { border: { fg: 'cyan' } },
      scrollable: true,
    });

    // ── Positions (bottom, full width) ─────────────────────
    this.positionBox = blessed.box({
      top: '65%', left: 0, width: '100%', height: '35%-1',
      tags: true, border: { type: 'line' },
      label: ' {bold}{cyan-fg}💰 PAPER POSITIONS{/} ',
      style: { border: { fg: 'cyan' } },
    });

    // ── Status Bar ─────────────────────────────────────────
    this.statusBox = blessed.box({
      bottom: 0, left: 0, width: '100%', height: 1,
      tags: true,
      style: { bg: 'blue', fg: 'white' },
    });

    this.screen.append(this.headerBox);
    this.screen.append(this.signalBox);
    this.screen.append(this.breakdownBox);
    this.screen.append(this.feedBox);
    this.screen.append(this.positionBox);
    this.screen.append(this.statusBox);

    // ── Key bindings ───────────────────────────────────────
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.screen.destroy();
      process.exit(0);
    });

    // Tab through signals for breakdown view
    this.screen.key(['tab', 'j'], () => {
      if (this.state.signals.length > 0) {
        this.state.selectedSignal = (this.state.selectedSignal + 1) % this.state.signals.length;
        this.render();
      }
    });
    this.screen.key(['S-tab', 'k'], () => {
      if (this.state.signals.length > 0) {
        this.state.selectedSignal = (this.state.selectedSignal - 1 + this.state.signals.length) % this.state.signals.length;
        this.render();
      }
    });
  }

  update(state: Partial<DashboardState>) {
    Object.assign(this.state, state);
    this.render();
  }

  private render() {
    const { signals, fearGreed, fundingRates, positions, feed, totalPnl, lastUpdated, status, refreshCountdown, nansenCredits, selectedSignal } = this.state;

    // ── Header ─────────────────────────────────────────────
    const fgStr = fearGreed
      ? `F&G: ${fgColor(fearGreed.value)}${fearGreed.value}{/} (${fearGreed.label})`
      : 'F&G: {grey-fg}N/A{/}';
    const timeStr = lastUpdated.toUTCString().slice(17, 25) + ' UTC';
    const creditStr = nansenCredits !== null ? `Credits: ${nansenCredits.toLocaleString()}` : '';
    this.headerBox.setContent(
      `  {bold}{cyan-fg}🐋 SMART MONEY FOLLOWS{/}  │  ${fgStr}  │  {white-fg}${timeStr}{/}  │  ⏱ {yellow-fg}${refreshCountdown}s{/}  │  ${creditStr}`
    );

    // ── Signals ────────────────────────────────────────────
    if (signals.length === 0) {
      this.signalBox.setContent('\n  {yellow-fg}Loading signals...{/}');
    } else {
      const lines = signals.map((s, i) => {
        const col = SIGNAL_COLORS[s.label];
        const icon = SIGNAL_ICONS[s.label];
        const scoreStr = (s.score > 0 ? '+' : '') + s.score;
        const priceStr = s.price > 0 ? fmtPrice(s.price) : '';
        const sel = i === selectedSignal ? '{inverse}' : '';
        const selEnd = i === selectedSignal ? '{/inverse}' : '';
        return `  ${sel}${icon} {bold}${s.symbol.padEnd(5)}{/} ${priceStr.padEnd(9)} ${col}${s.label.padEnd(11)}{/} [${scoreStr}]${selEnd}`;
      });
      this.signalBox.setContent('\n' + lines.join('\n') + '\n\n  {grey-fg}[Tab] cycle signals{/}');
    }

    // ── Breakdown ──────────────────────────────────────────
    if (signals.length > 0 && selectedSignal < signals.length) {
      const s = signals[selectedSignal];
      const col = SIGNAL_COLORS[s.label];
      const icon = SIGNAL_ICONS[s.label];
      const header = `  ${icon} {bold}${s.symbol}{/} — ${col}${s.label}{/}  (score: ${s.score > 0 ? '+' : ''}${s.score})`;
      const breakdown = s.breakdown.map(b => `    ${b}`).join('\n');
      const priceStr = s.price > 0 ? `  Price: {bold}${fmtPrice(s.price)}{/}` : '';
      this.breakdownBox.setContent('\n' + header + '\n' + priceStr + '\n\n' + breakdown);
    } else {
      this.breakdownBox.setContent('\n  {grey-fg}No signals to display{/}');
    }

    // ── Feed ───────────────────────────────────────────────
    if (feed.length === 0) {
      this.feedBox.setContent('\n  {yellow-fg}Waiting for data...{/}');
    } else {
      const now = new Date();
      const lines = feed.map((f) => {
        const ts = now.toTimeString().slice(0, 5);
        return `  {grey-fg}${ts}{/}  ${f}`;
      });
      this.feedBox.setContent('\n' + lines.join('\n'));
    }

    // ── Positions ──────────────────────────────────────────
    if (positions.length === 0) {
      const pnlColour = totalPnl >= 0 ? 'green' : 'red';
      const closedPnl = totalPnl !== 0 ? `  Closed P&L: {${pnlColour}-fg}{bold}$${totalPnl.toFixed(2)}{/}{/}` : '';
      this.positionBox.setContent(`\n  {grey-fg}No open positions{/}${closedPnl}\n\n  {grey-fg}Signals will auto-trade when BUY/SELL thresholds are crossed{/}`);
    } else {
      const hdr = `  {bold}${'ASSET'.padEnd(6)} ${'SIDE'.padEnd(6)} ${'ENTRY'.padEnd(11)} ${'MARK'.padEnd(11)} ${'SIZE'.padEnd(9)} ${'P&L'.padEnd(12)} %{/}`;
      const rows = positions.map(p => {
        const pnl = p.pnlUsd;
        const pnlCol = pnl >= 0 ? 'green' : 'red';
        const pnlStr = `{${pnlCol}-fg}${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}{/}`;
        const pctStr = `{${pnlCol}-fg}${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%{/}`;
        const sideStr = p.side === 'LONG' ? '{green-fg}LONG {/}' : '{red-fg}SHORT{/}';
        return `  ${p.symbol.padEnd(6)} ${sideStr} ${fmtPrice(p.entryPrice).padEnd(11)} ${fmtPrice(p.currentPrice).padEnd(11)} $${p.usdSize.toFixed(0).padEnd(8)} ${pnlStr.padEnd(23)} ${pctStr}`;
      });
      const totalCol = totalPnl >= 0 ? 'green' : 'red';
      const totalStr = `  {bold}Total Open P&L: {${totalCol}-fg}${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}{/}{/}`;
      this.positionBox.setContent('\n' + hdr + '\n' + rows.join('\n') + '\n\n' + totalStr);
    }

    // ── Status ─────────────────────────────────────────────
    this.statusBox.setContent(` ${status}  │  [Q] Quit  [Tab] Cycle signals  [J/K] Navigate`);

    this.screen.render();
  }

  destroy() {
    this.screen.destroy();
  }
}
