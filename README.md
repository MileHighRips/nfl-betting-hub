# 🏈 LockyLines — NFL Football Sports Betting Hub

A sleek, mathematically-grounded NFL betting hub built on **Ken Barkley's** 2026 models. It gives
you each week's lines from **DraftKings & FanDuel**, a transparent weighted confidence engine,
every futures market, a value board for out-of-whack prices, one high-confidence player prop per
game, and a bankroll tracker that shows live profit & loss.

> Built for personal use. For entertainment only — bet responsibly.

## 🔗 Links & opening on your phone (Safari)

- **GitHub repo:** https://github.com/MileHighRips/nfl-betting-hub
  _(rename in this README if your GitHub username/repo differ)._

A GitHub repo only hosts the **code** — to actually open the running app in Safari on your phone,
use one of these:

1. **Same Wi‑Fi (instant):** with `npm run dev` running on your computer, the terminal prints a
   `Network:` URL like `http://192.168.x.x:3000`. Open that in Safari on your phone while on the
   same network.
2. **Anywhere via a public HTTPS link (recommended):** deploy free to Vercel and open the
   `*.vercel.app` URL in Safari. One‑click deploy from the repo:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/MileHighRips/nfl-betting-hub)

   Or from the project folder:

   ```bash
   npm i -g vercel
   vercel            # first run links/creates the project
   vercel --prod     # gives you the public https URL for Safari
   ```

   Add your `ODDS_API_KEY` (and optional `ODDS_API_PROPS`) in the Vercel project's
   Environment Variables to enable FanDuel + live prop lines in production.

> Note: this app uses server rendering + API routes, so plain **GitHub Pages won't run it** —
> Vercel (or any Node host) is the right target for a live URL.

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
