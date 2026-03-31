"use strict";
// ============================================================
// trader.ts — Paper trade executor via kraken-cli
// Tracks positions + P&L in-memory, logs to trades.json
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTrades = loadTrades;
exports.executePaperTrade = executePaperTrade;
exports.updatePositions = updatePositions;
exports.getPositions = getPositions;
exports.getTradeLogs = getTradeLogs;
exports.getTotalPnl = getTotalPnl;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const config_1 = require("./config");
const TRADES_FILE = './trades.json';
const positions = new Map();
let tradeLogs = [];
let krakenAvailable = null;
// Check if kraken-cli is installed
function checkKraken() {
    if (krakenAvailable !== null)
        return krakenAvailable;
    try {
        (0, child_process_1.execSync)('which kraken-cli 2>/dev/null || kraken --version 2>/dev/null', { timeout: 3000 });
        krakenAvailable = true;
    }
    catch {
        krakenAvailable = false;
    }
    return krakenAvailable;
}
// Get current price via Hyperliquid (free, always available)
async function getCurrentPrice(symbol) {
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const res = await axios.post('https://api.hyperliquid.xyz/info', { type: 'allMids' }, { timeout: 5000 });
        const mids = res.data;
        const price = mids[symbol.toUpperCase()];
        return price ? parseFloat(price) : 0;
    }
    catch {
        return 0;
    }
}
// Load existing trades from disk
function loadTrades() {
    try {
        if ((0, fs_1.existsSync)(TRADES_FILE)) {
            tradeLogs = JSON.parse((0, fs_1.readFileSync)(TRADES_FILE, 'utf-8'));
        }
    }
    catch {
        tradeLogs = [];
    }
}
// Save trades to disk
function saveTrades() {
    try {
        (0, fs_1.writeFileSync)(TRADES_FILE, JSON.stringify(tradeLogs, null, 2));
    }
    catch { }
}
// Execute a paper trade based on signal
async function executePaperTrade(signal) {
    const { symbol, label, score } = signal;
    // Already have a position?
    const existing = positions.get(symbol);
    // Check if we should close existing position
    if (existing) {
        if ((existing.side === 'LONG' && (label === 'SELL' || label === 'STRONG SELL')) ||
            (existing.side === 'SHORT' && (label === 'BUY' || label === 'STRONG BUY'))) {
            return await closePosition(symbol);
        }
        return null; // hold existing
    }
    // Open new position
    if (label === 'BUY' || label === 'STRONG BUY') {
        return await openPosition(symbol, 'LONG', score, label);
    }
    else if (label === 'SELL' || label === 'STRONG SELL') {
        return await openPosition(symbol, 'SHORT', score, label);
    }
    return null;
}
async function openPosition(symbol, side, score, signalLabel) {
    const price = await getCurrentPrice(symbol);
    const quantity = price > 0 ? config_1.PAPER_TRADE_SIZE_USD / price : 0.01;
    const id = `${symbol}-${Date.now()}`;
    const position = {
        id, symbol, side, entryPrice: price, quantity,
        usdSize: config_1.PAPER_TRADE_SIZE_USD, entrySignal: signalLabel,
        entryScore: score, openedAt: new Date().toISOString(),
        currentPrice: price, pnlUsd: 0, pnlPct: 0,
    };
    positions.set(symbol, position);
    const log = {
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
            (0, child_process_1.execSync)(cmd, { timeout: 10000 });
        }
        catch { }
    }
    return `📂 OPENED ${side} ${symbol} @ $${price.toFixed(2)} (score: ${score > 0 ? '+' : ''}${score})`;
}
async function closePosition(symbol) {
    const pos = positions.get(symbol);
    if (!pos)
        return '';
    const price = await getCurrentPrice(symbol);
    const pnl = pos.side === 'LONG'
        ? (price - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - price) * pos.quantity;
    const log = {
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
async function updatePositions() {
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
function getPositions() {
    return Array.from(positions.values());
}
function getTradeLogs() {
    return tradeLogs;
}
function getTotalPnl() {
    return getPositions().reduce((sum, p) => sum + p.pnlUsd, 0);
}
