// ============================================================
// trader.ts — Paper trade executor via kraken-cli
// Tracks positions + P&L in-memory, logs to trades.json
// ============================================================

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { TokenSignal } from './signal';
import { PAPER_TRADE_SIZE_USD } from './config';

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  usdSize: number;
  entrySignal: string;
  entryScore: number;
  openedAt: string;
  currentPrice: number;
  pnlUsd: number;
  pnlPct: number;
}

export interface TradeLog {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  action: 'OPEN' | 'CLOSE';
  price: number;
  quantity: number;
  signal: string;
  score: number;
  timestamp: string;
  pnlUsd?: number;
}

const TRADES_FILE = './trades.json';
const positions = new Map<string, Position>();
let tradeLogs: TradeLog[] = [];
let krakenAvailable: boolean | null = null;

// Check if kraken-cli is installed
function checkKraken(): boolean {
  if (krakenAvailable !== null) return krakenAvailable;
  try {
    execSync('which kraken-cli 2>/dev/null || kraken --version 2>/dev/null', { timeout: 3000 });
    krakenAvailable = true;
  } catch {
    krakenAvailable = false;
  }
  return krakenAvailable;
}

// Get current price via Hyperliquid (free, always available)
async function getCurrentPrice(symbol: string): Promise<number> {
  try {
    const { default: axios } = await import('axios');
    const res = await axios.post(
      'https://api.hyperliquid.xyz/info',
      { type: 'allMids' },
      { timeout: 5000 }
    );
    const mids = res.data as Record<string, string>;
    const price = mids[symbol.toUpperCase()];
    return price ? parseFloat(price) : 0;
  } catch {
    return 0;
  }
}

// Load existing trades from disk
export function loadTrades() {
  try {
    if (existsSync(TRADES_FILE)) {
      tradeLogs = JSON.parse(readFileSync(TRADES_FILE, 'utf-8'));
    }
  } catch { tradeLogs = []; }
}

// Save trades to disk
function saveTrades() {
  try {
    writeFileSync(TRADES_FILE, JSON.stringify(tradeLogs, null, 2));
  } catch {}
}

// Execute a paper trade based on signal
export async function executePaperTrade(signal: TokenSignal): Promise<string | null> {
  const { symbol, label, score } = signal;

  // Already have a position?
  const existing = positions.get(symbol);

  // Check if we should close existing position
  if (existing) {
    if (
      (existing.side === 'LONG' && (label === 'SELL' || label === 'STRONG SELL')) ||
      (existing.side === 'SHORT' && (label === 'BUY' || label === 'STRONG BUY'))
    ) {
      return await closePosition(symbol);
    }
    return null; // hold existing
  }

  // Open new position
  if (label === 'BUY' || label === 'STRONG BUY') {
    return await openPosition(symbol, 'LONG', score, label);
  } else if (label === 'SELL' || label === 'STRONG SELL') {
    return await openPosition(symbol, 'SHORT', score, label);
  }

  return null;
}

async function openPosition(symbol: string, side: 'LONG' | 'SHORT', score: number, signalLabel: string): Promise<string> {
  const price = await getCurrentPrice(symbol);
  const quantity = price > 0 ? PAPER_TRADE_SIZE_USD / price : 0.01;
  const id = `${symbol}-${Date.now()}`;

  const position: Position = {
    id, symbol, side, entryPrice: price, quantity,
    usdSize: PAPER_TRADE_SIZE_USD, entrySignal: signalLabel,
    entryScore: score, openedAt: new Date().toISOString(),
    currentPrice: price, pnlUsd: 0, pnlPct: 0,
  };
  positions.set(symbol, position);

  const log: TradeLog = {
    id, symbol, side, action: 'OPEN', price, quantity,
    signal: signalLabel, score, timestamp: new Date().toISOString(),
  };
  tradeLogs.push(log);
  saveTrades();

  // Attempt kraken-cli paper trade (graceful degrade)
  if (checkKraken()) {
    try {
      const pair = `${symbol}/USD`;
      const cmd = side === 'LONG'
        ? `kraken-cli paper-trade buy --pair ${pair} --amount ${quantity.toFixed(6)}`
        : `kraken-cli paper-trade sell --pair ${pair} --amount ${quantity.toFixed(6)}`;
      execSync(cmd, { timeout: 10_000 });
    } catch {}
  }

  return `📂 OPENED ${side} ${symbol} @ $${price.toFixed(2)} (score: ${score > 0 ? '+' : ''}${score})`;
}

async function closePosition(symbol: string): Promise<string> {
  const pos = positions.get(symbol);
  if (!pos) return '';

  const price = await getCurrentPrice(symbol);
  const pnl = pos.side === 'LONG'
    ? (price - pos.entryPrice) * pos.quantity
    : (pos.entryPrice - price) * pos.quantity;

  const log: TradeLog = {
    id: pos.id, symbol, side: pos.side, action: 'CLOSE',
    price, quantity: pos.quantity, signal: 'EXIT',
    score: 0, timestamp: new Date().toISOString(), pnlUsd: pnl,
  };
  tradeLogs.push(log);
  saveTrades();
  positions.delete(symbol);

  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  return `📤 CLOSED ${pos.side} ${symbol} @ $${price.toFixed(2)} → P&L: ${pnlStr}`;
}

// Update P&L for all open positions
export async function updatePositions(): Promise<void> {
  for (const [symbol, pos] of positions.entries()) {
    const price = await getCurrentPrice(symbol);
    if (price > 0) {
      pos.currentPrice = price;
      pos.pnlUsd = pos.side === 'LONG'
        ? (price - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - price) * pos.quantity;
      pos.pnlPct = (pos.pnlUsd / pos.usdSize) * 100;
    }
  }
}

export function getPositions(): Position[] {
  return Array.from(positions.values());
}

export function getTradeLogs(): TradeLog[] {
  return tradeLogs;
}

export function getTotalPnl(): number {
  return getPositions().reduce((sum, p) => sum + p.pnlUsd, 0);
}
