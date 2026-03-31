// ============================================================
// trader.ts — Paper trade executor via kraken-cli
// Tracks positions + P&L in-memory, logs to trades.json
// ============================================================

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
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

const TRADES_FILE = resolve(__dirname, '..', 'trades.json');
const positions = new Map<string, Position>();
let tradeLogs: TradeLog[] = [];
let krakenAvailable: boolean | null = null;

// ── Price cache (batch all mids in one call) ─────────────
let priceCache: { mids: Record<string, string>; ts: number } | null = null;
const PRICE_CACHE_TTL = 10_000; // 10 seconds

export async function getAllPrices(): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.ts < PRICE_CACHE_TTL) {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(priceCache.mids)) {
      result[k] = parseFloat(v);
    }
    return result;
  }
  try {
    const res = await axios.post(
      'https://api.hyperliquid.xyz/info',
      { type: 'allMids' },
      { timeout: 5000 }
    );
    priceCache = { mids: res.data, ts: Date.now() };
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(res.data as Record<string, string>)) {
      result[k] = parseFloat(v);
    }
    return result;
  } catch {
    return {};
  }
}

async function getPrice(symbol: string): Promise<number> {
  const prices = await getAllPrices();
  return prices[symbol.toUpperCase()] ?? 0;
}

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

export function loadTrades() {
  try {
    if (existsSync(TRADES_FILE)) {
      tradeLogs = JSON.parse(readFileSync(TRADES_FILE, 'utf-8'));
    }
  } catch { tradeLogs = []; }
}

function saveTrades() {
  try {
    writeFileSync(TRADES_FILE, JSON.stringify(tradeLogs, null, 2));
  } catch {}
}

export async function executePaperTrade(signal: TokenSignal): Promise<string | null> {
  const { symbol, label, score } = signal;
  const existing = positions.get(symbol);

  // Close if signal flipped
  if (existing) {
    if (
      (existing.side === 'LONG' && (label === 'SELL' || label === 'STRONG SELL')) ||
      (existing.side === 'SHORT' && (label === 'BUY' || label === 'STRONG BUY'))
    ) {
      return await closePosition(symbol);
    }
    return null;
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
  const price = await getPrice(symbol);
  if (price === 0) return `⚠️ No price for ${symbol} — skipping trade`;

  const quantity = PAPER_TRADE_SIZE_USD / price;
  const id = `${symbol}-${Date.now()}`;

  positions.set(symbol, {
    id, symbol, side, entryPrice: price, quantity,
    usdSize: PAPER_TRADE_SIZE_USD, entrySignal: signalLabel,
    entryScore: score, openedAt: new Date().toISOString(),
    currentPrice: price, pnlUsd: 0, pnlPct: 0,
  });

  tradeLogs.push({
    id, symbol, side, action: 'OPEN', price, quantity,
    signal: signalLabel, score, timestamp: new Date().toISOString(),
  });
  saveTrades();

  // Attempt kraken-cli paper trade
  if (checkKraken()) {
    try {
      const pair = `${symbol}/USD`;
      const cmd = side === 'LONG'
        ? `kraken-cli paper-trade buy --pair ${pair} --amount ${quantity.toFixed(6)}`
        : `kraken-cli paper-trade sell --pair ${pair} --amount ${quantity.toFixed(6)}`;
      execSync(cmd, { timeout: 10_000 });
    } catch {}
  }

  return `📂 OPENED ${side} ${symbol} @ $${price.toFixed(2)} ($${PAPER_TRADE_SIZE_USD})`;
}

async function closePosition(symbol: string): Promise<string> {
  const pos = positions.get(symbol);
  if (!pos) return '';

  const price = await getPrice(symbol);
  const pnl = pos.side === 'LONG'
    ? (price - pos.entryPrice) * pos.quantity
    : (pos.entryPrice - price) * pos.quantity;

  tradeLogs.push({
    id: pos.id, symbol, side: pos.side, action: 'CLOSE',
    price, quantity: pos.quantity, signal: 'EXIT',
    score: 0, timestamp: new Date().toISOString(), pnlUsd: pnl,
  });
  saveTrades();
  positions.delete(symbol);

  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  return `📤 CLOSED ${pos.side} ${symbol} @ $${price.toFixed(2)} → P&L: ${pnlStr}`;
}

// Batch update all positions in one price fetch
export async function updatePositions(): Promise<void> {
  const prices = await getAllPrices();
  for (const [symbol, pos] of positions.entries()) {
    const price = prices[symbol.toUpperCase()] ?? 0;
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
