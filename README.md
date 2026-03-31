# 🐋 Smart Money Follows

> **Nansen CLI Build Challenge entry** — A Bloomberg-style terminal that watches what smart money wallets are doing on-chain, cross-references sentiment signals, and auto-executes paper trades when everything aligns.

![Nansen CLI](https://img.shields.io/badge/Nansen-CLI_v1.24-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## What It Does

Smart Money Follows is a live terminal dashboard that:

1. **Watches Nansen smart wallets** — netflows, DEX trades, perp positions, DCA activity, holdings
2. **Cross-references sentiment** — Fear & Greed Index + Hyperliquid funding rates
3. **Scores every token** — combines all signals into a weighted score → 🚀 STRONG BUY / 🟢 BUY / 🟡 NEUTRAL / 🔴 SELL / 💀 STRONG SELL
4. **Paper trades automatically** — opens/closes positions when signals cross thresholds
5. **Shows everything live** — colour-coded terminal UI with signal breakdowns, smart money feed, and P&L tracking

---

## Screenshot

```
┌─ 🐋 SMART MONEY FOLLOWS ─────────────────────────────────────────────────┐
│  F&G: 11 (Extreme Fear)  │  10:34 UTC  │  ⏱ 25s  │  Credits: 9,740     │
├──── 📊 SIGNALS ───────────┬──── 🔍 SIGNAL BREAKDOWN ─────────────────────┤
│  🟢 ETH   $2,026  BUY [+3] │  🟢 ETH — BUY  (score: +3)                │
│  🟢 BTC   $66,301 BUY [+3] │  Price: $2,026.35                          │
│  🟢 SOL   $80     BUY [+3] │                                             │
│  🟡 LINK  $8.56   NEU [-1] │    — Netflow: no data                       │
│  🟡 UNI   $3.45   NEU [+1] │    — DEX volume: no data                    │
│                              │    😱 F&G: 11 — Extreme Fear (contrarian)  │
│  [Tab] cycle signals        │    💸 Funding: -0.0009% (slightly bullish)  │
├──── 🐋 SMART MONEY FEED ─────────────────────────────────────────────────┤
│  10:34  📉 LINK: -$508K net flow (DEX)                                    │
│  10:34  📈 SYRUPUSDC: +$2.0M net flow (DEX)                              │
│  10:34  🐋 High Balance OPEN LONG SOL ($805)                              │
│  10:34  🐋 0x6b08… OPEN SHORT xyz:BRENTOIL ($162K)                       │
│  10:34  🏆 Top HL trader: Token Millionaire ($13.8M PnL)                  │
├──── 💰 PAPER POSITIONS ──────────────────────────────────────────────────┤
│  ASSET  SIDE   ENTRY       MARK        SIZE      P&L          %          │
│  ETH    LONG   $2,022.75   $2,026.35   $1000     +$1.78       +0.2%     │
│  BTC    LONG   $66,320.50  $66,301.50  $1000     -$0.29       -0.0%     │
│                                                                           │
│  Total Open P&L: +$1.49                                                  │
└───────────────────────────────────────────────────────────────────────────┘
  ✅ Nansen  │  ✅ Hyperliquid  │  ✅ F&G: 11  │  [Q] Quit  [Tab] Signals
```

---

## Signal Scoring Logic

```
score = 0

Smart Money Netflow (Nansen):
  netflow > $500K   → +3   (strong inflow)
  netflow > $100K   → +2
  netflow > 0       → +1
  netflow < -$500K  → -3   (strong outflow)
  netflow < -$100K  → -2
  netflow < 0       → -1

DEX Buy/Sell Pressure (Nansen):
  >65% buy volume   → +2
  >55% buy volume   → +1
  >65% sell volume  → -2
  >55% sell volume  → -1

Fear & Greed Index:
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

## Nansen API Calls Used (12 endpoints)

| # | Command | Purpose |
|---|---------|---------|
| 1 | `research token screener` | DEX volume, netflow, top movers |
| 2 | `research smart-money netflow` | Smart wallet net buy/sell direction |
| 3 | `research smart-money dex-trades` | Token swap activity |
| 4 | `research smart-money perp-trades` | Leveraged long/short positions |
| 5 | `research smart-money holdings` | Current wallet holdings |
| 6 | `research smart-money dcas` | Dollar-cost averaging patterns |
| 7 | `research perp leaderboard` | Who's winning on Hyperliquid |
| 8 | `research token dex-trades` | Per-token DEX volume (ETH) |
| 9 | `research token holders` | Top holder concentration (ETH) |
| 10 | `research profiler balance` | Smart wallet portfolio |
| 11 | `research smart-money netflow` (Solana) | Cross-chain netflow |
| 12 | `research token dex-trades` (LINK) | Per-token DEX volume |

All cached for 120 seconds to conserve credits.

---

## Free APIs (no key needed)

- **Fear & Greed Index** — `api.alternative.me/fng/`
- **Hyperliquid** — `api.hyperliquid.xyz/info` (funding rates, mark prices, all mids)

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

---

## Controls

| Key | Action |
|-----|--------|
| `Tab` / `J` | Next signal (cycle through tokens) |
| `Shift+Tab` / `K` | Previous signal |
| `Q` / `Esc` | Quit |

---

## Architecture

```
src/
├── config.ts      — Tokens to watch (with aliases), thresholds
├── nansen.ts      — Nansen CLI wrapper (12 endpoints, 120s cache)
├── sentiment.ts   — Fear & Greed + Hyperliquid funding fetchers
├── signal.ts      — Weighted signal scoring engine with breakdown
├── trader.ts      — Paper trade executor + batched P&L tracker
├── dashboard.ts   — Blessed terminal UI (4-panel layout)
└── index.ts       — Main loop (30s refresh, wires everything)
```

---

## Built for the Nansen CLI Build Challenge (Week 3)

> *"Built a Smart Money signal engine on the Nansen CLI. It watches what the best wallets are buying, checks funding rates + fear/greed, and paper-trades when everything aligns. Real alpha. No noise."*

[@nansen_ai](https://twitter.com/nansen_ai) #NansenCLI
