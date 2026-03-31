# 🐋 Smart Money Follows

> **Nansen CLI Build Challenge entry** — a Bloomberg-style terminal that watches what smart money wallets are doing on-chain, cross-references sentiment signals, and auto-executes paper trades when everything aligns.

![Smart Money Follows Terminal](https://img.shields.io/badge/Nansen-CLI-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## What It Does

Smart Money Follows is a live terminal dashboard that:

1. **Watches Nansen smart wallets** — netflows, DEX trades, perp positions, DCA activity, holdings
2. **Cross-references sentiment** — Fear & Greed Index + Hyperliquid funding rates
3. **Scores every token** — combines all signals into a weighted score → STRONG BUY / BUY / NEUTRAL / SELL / STRONG SELL
4. **Paper trades automatically** — opens/closes positions via kraken-cli when signals cross thresholds
5. **Shows everything live** — colour-coded terminal UI that refreshes every 30 seconds

---

## Signal Scoring Logic

```
score = 0

Smart Money Netflow:
  netflow > $500K   → +3
  netflow > 0       → +1
  netflow < -$500K  → -3
  netflow < 0       → -1

DEX Buy/Sell Pressure:
  >65% buy volume   → +2
  >55% buy volume   → +1
  >65% sell volume  → -2

Fear & Greed:
  ≤25 (Extreme Fear)  → +2   ← buy the panic
  ≤45 (Fear)          → +1
  ≥75 (Extreme Greed) → -2   ← sell the euphoria
  ≥55 (Greed)         → -1

Hyperliquid Funding Rate:
  < -0.01%  → +2  ← longs being paid = bullish
  < 0       → +1
  > +0.03%  → -2  ← shorts being paid = bearish
  > 0       → -1

Signal:
  score ≥ +5  → 🚀 STRONG BUY
  score ≥ +3  → 🟢 BUY
  score ≤ -5  → 💀 STRONG SELL
  score ≤ -3  → 🔴 SELL
  else        → 🟡 NEUTRAL
```

---

## Nansen API Calls Used (12 total)

| # | Command | Purpose |
|---|---------|---------|
| 1 | `research smart-money netflow` | Smart wallet net buy/sell direction |
| 2 | `research smart-money dex-trades` | Token swap activity |
| 3 | `research smart-money perp-trades` | Leveraged long/short positions |
| 4 | `research smart-money holdings` | Current wallet holdings |
| 5 | `research smart-money historical-holdings` | Position changes over time |
| 6 | `research smart-money dcas` | Dollar-cost averaging patterns |
| 7 | `research token screener` | Discover tokens smart money is entering |
| 8 | `research token dex-trades` | Per-token DEX volume breakdown |
| 9 | `research token transfers` | On-chain transfer activity |
| 10 | `research token holders` | Top holder concentration |
| 11 | `research perp leaderboard` | Who's winning on Hyperliquid |
| 12 | `research profiler balance` | Smart wallet portfolio snapshot |

---

## Free APIs (no key needed)

- **Fear & Greed Index** — `api.alternative.me/fng/`
- **Hyperliquid** — `api.hyperliquid.xyz/info` (funding rates, mark prices, open interest)

---

## Installation

```bash
# Prerequisites: Node.js 18+, Nansen CLI authenticated
npm install -g nansen-cli
nansen login --api-key YOUR_API_KEY

# Clone and install
git clone https://github.com/matjax8/smart-money-follows
cd smart-money-follows
npm install

# Run
npm start
```

### Optional: kraken-cli paper trading
```bash
npm install -g kraken-cli
```
If kraken-cli is not installed, the app gracefully degrades — signals still work, paper trades are tracked internally.

---

## Usage

```
npm start        # launch live dashboard
npm run build    # compile TypeScript
npm run start:compiled  # run compiled version
```

**Controls:**
- `Q` or `Ctrl+C` to quit
- Dashboard auto-refreshes every 30 seconds
- All paper trades logged to `trades.json`

---

## Architecture

```
src/
├── config.ts     — Tokens to watch, signal thresholds
├── nansen.ts     — Nansen CLI wrapper (12 endpoints, cached)
├── sentiment.ts  — Fear & Greed + Hyperliquid funding fetchers
├── signal.ts     — Weighted signal scoring engine
├── trader.ts     — Paper trade executor + P&L tracker
├── dashboard.ts  — Blessed terminal UI
└── index.ts      — Main loop (wires everything together)
```

---

## Built for the Nansen CLI Build Challenge (Week 3)

> *"Built a Smart Money signal engine on the Nansen CLI. It watches what the best wallets are buying, checks funding rates + fear/greed, and paper-trades on Kraken when everything aligns. Real alpha. No noise."*

[@nansen_ai](https://twitter.com/nansen_ai) #NansenCLI
