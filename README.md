# 🏈 LockyLines — NFL Football Sports Betting Hub

A sleek, mathematically-grounded NFL betting hub built on **Ken Barkley's** 2026 models. It gives
you each week's lines from **DraftKings & FanDuel**, a transparent weighted confidence engine,
every futures market, a value board for out-of-whack prices, one high-confidence player prop per
game, and a bankroll tracker that shows live profit & loss.

> Built for personal use. For entertainment only — bet responsibly.

## Features

- **Dashboard** — top model plays, underdog upsets, Ken's actual bets, biggest value, live P/L.
- **Weekly Slate** — every game with DK/FanDuel spread, total & moneyline (line-shopped), model
  spread/total/ML picks with confidence %, an underdog upset radar, and the single
  highest-confidence prop per game. Each pick shows a recommended unit size and a one-tap
  **Place** button.
- **Futures & Awards** — Super Bowl, MVP, OPOY, DPOY, OROY, DROY, Coach of the Year, Comeback,
  win totals and divisions. Ken's real bets and predictions are flagged.
- **Value Board** — "sharp alerts" for the biggest mispricings, a longshot watch for great prices,
  and the week's top edges.
- **Bet Tracker** — configurable unit size (1u = $10 to start), settle bets won/lost/push, and a
  live record, ROI and net profit/loss. Persists to a local file **and** localStorage.
- **The Model** — a full write-up of Ken's core models and the weighted engine's factor stack.

## The confidence engine

Each game pick is an explainable stack, not a black box:

1. Power-rating differential (neutral field)
2. Home-field advantage
3. Rest / bye differential
4. QB availability
5. Divisional dampener
6. Ken's pass-defense regression signal
7. Market anchor (vig-removed consensus)

The projected margin becomes a win/cover probability via an NFL-calibrated normal curve, blended
with the market price. **Edge = model probability − market probability**, and stakes use
quarter-Kelly (capped at 3u).

## Live data (free, no key)

The primary feed is **ESPN's free API** — real schedule, real **DraftKings** odds, and live
scores/status for every week, with **no key required**. The current week is detected from the
date, and completed results feed an in-season Elo-style model that sharpens the ratings each week.

To also line-shop **FanDuel**, add a free key from
[the-odds-api.com](https://the-odds-api.com/) (free tier ≈ 500 requests/month):

```bash
cp .env.example .env.local
# paste your key into ODDS_API_KEY
```

FanDuel prices then overlay alongside DraftKings automatically.

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3000
```

Other scripts:

```bash
npm run build        # production build
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
npm run lint         # ESLint
```

## Tech

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Prettier · lucide-react.

## Weekly workflow

1. Update team power ratings / injuries in `src/lib/teams.ts` as results come in.
2. Swap in the new week's matchups in `src/data/games.ts` (or rely on the live odds feed).
3. Review the Slate & Value Board, place your picks, and settle last week's on the Tracker.

---

Adapted from Ken Barkley's publicly-described 2026 NFL betting methodology.
