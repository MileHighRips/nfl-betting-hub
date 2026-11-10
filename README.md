# 🏈 LockyLines — NFL Football Sports Betting Hub

A sleek, mathematically-grounded NFL betting hub built on **Ken Barkley's** 2026 models. It gives
you each week's lines from **DraftKings**, a transparent weighted confidence engine,
every futures market, a value board for out-of-whack prices, one high-confidence player prop per
game, and a bankroll tracker that shows live profit & loss.

> Built for personal use. For entertainment only — bet responsibly.

## ⚡ Quickstart (clone & run)

All live feeds (DraftKings, ESPN, Open-Meteo weather, news RSS) are **keyless public endpoints**,
so there's nothing to configure — clone, install, run:

```bash
git clone https://github.com/MileHighRips/nfl-betting-hub.git
cd nfl-betting-hub
npm install
npm run dev          # open http://localhost:3000
```

Each install keeps its **own** bankroll: placed bets, unit size and P/L are stored locally in
`data/store/` (git-ignored) and mirrored to your browser — so a second person who clones gets a
clean, independent tracker. The shared model, picks and the committed ML artifacts
(`data/store/ml-model.json`, `data/store/props-model.json`) come with the clone, so the full
calibrated model works immediately. No API keys, no accounts, no database.

_Optional — retrain the ML artifacts yourself (needs Python 3.12):_

```bash
pip install -r ml/requirements.txt
python ml/build_model.py     # 15-season game-lines model
python ml/build_props.py      # anytime-TD calibration + prop sigmas
```

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

   No environment variables are required — every data feed is a keyless public endpoint.
   Note: Vercel's filesystem is read-only, so the file-backed bankroll/locks/CLV writes only
   persist when self-hosting on a writable host (or running locally). For a couple of users,
   cloning and running locally is the simplest path.

> Note: this app uses server rendering + API routes, so plain **GitHub Pages won't run it** —
> Vercel (or any Node host) is the right target for a live URL.

## Features

- **Dashboard** — top model plays, underdog upsets, Ken's actual bets, biggest value, live P/L.
- **Weekly Slate** — every game with live **DraftKings** spread, total & moneyline, drive-level
  model picks with confidence %, an underdog upset radar, live weather/injury flags, and the single
  highest-confidence prop per game. Each pick shows a recommended unit size and a one-tap
  **Place** button.
- **All Picks** — every value bet across the slate (and Ken's futures) with win %, price and unit
  size, filterable by type and confidence.
- **Futures & Awards** — Super Bowl, MVP, OPOY, DPOY, OROY, DROY, Coach of the Year, Comeback,
  win totals and divisions. Ken's real bets and predictions are flagged.
- **Value Board** — "sharp alerts" for the biggest mispricings, a longshot watch for great prices,
  and the week's top edges.
- **Bet Tracker** — configurable unit size (1u = $10 to start), settle bets won/lost/push, and a
  live record, ROI, net profit/loss, and CLV. While the Tracker is open, upcoming bets are checked
  for pre-kickoff closing snapshots; a local server scheduler also captures lines every five minutes
  for the active week and any week with an upcoming tracked bet while the Node server is running.
  The same scheduler archives Bet Now picks, filtered candidates, model version, and the available
  pregame model inputs every five minutes. Visit `/validation` to compare recommended picks with
  candidates the filters passed on. The `Hourly model capture` GitHub Actions workflow is designed
  to run on a hosted runner, restore the previous compressed research archive, capture markets and
  Bet Now candidates, and publish a rolling GitHub Actions artifact. The public artifact contains
  market history, model recommendations, and validation reports; it never includes placed bets or
  locked picks. Artifacts expire after 90 days and older copies are removed after a successful
  upload. Scheduled runs require the workflow to be on the default branch and Actions to be enabled.
  GitHub may delay or skip scheduled runs, so this is periodic capture, not an always-on guarantee.
  The authenticated capture route accepts a bearer token.
  Configure `CRON_SECRET` only in the server environment.
  CLV is explicitly marked unavailable if no valid pre-kickoff quote was captured; post-kickoff
  prices are never substituted as a close. Bet Now placements save their surface, book, price, line, and
  same-book no-vig placement probability when both sides are quoted, plus the model version and
  model/decision probabilities. The tracker separates market CLV from odds-based comparisons and
  averages only market CLV. Bet Now recommendations deduct the confirmed $0.50 per-ticket fee from
  expected value; this policy is versioned separately from older archived picks. Capture pauses when the local server
  is stopped. Persists to a local file **and** localStorage.
- **Bet Now handicap review** — each unlocked candidate has a collapsed, optional review with its
  quantitative/context signals, linked team news, and editable matchup/personnel,
  situational-production, and exact line/price notes. Picks can be placed without opening or saving
  a review. Saved reviews are tied to the exact recommendation snapshot; a changed line, price,
  probability, or stake requires a new review. The editable draft is
  prefilled from the prior week's ESPN box score when available, recent linked reporting, game
  context, and the current market/model comparison; it does not auto-approve a pick. It also
  interprets the projected score, pace, offense/defense efficiency matchup, and player-prop
  projection as a conditional game-plan/script read. Specific coverage-shell, blitz, personnel, and
  trench claims remain qualified because the feeds do not provide those structured details. When
  live odds are unavailable, seed fallback recommendations are suppressed and cannot be placed or
  archived as live picks. Locked pick snapshots remain frozen and retain their existing display and
  placement behavior.
- **The Model** — a full write-up of the drive-level engine, live data proxies, and Ken's models.

## The engine

Every game is played out **12,000 times, drive by drive**. Team scoring is built from first
principles — offensive efficiency vs the opponent's defense, scaled by pace — so the **total is
modeled, not pinned to the market** and real Over/Under value appears. Each possession resolves to
a TD/FG/none, which reproduces realistic scores and push-aware key numbers.

Factor stack: efficiency matchup · team-specific home field · rest/bye · travel & body clock ·
**live weather (wind/precip/temp)** · **injuries (QB + skill players out)** · pace · divisional
tightening · **in-season Elo learning** from real results. Edge = model probability − vig-free
market probability; until the live archive verifies calibration, stakes are blended heavily
toward the market. Bet Now can show the strongest positive model-value side, total, and player-prop
candidate for each game, each capped at $5; its expected-value filter deducts the confirmed $0.50
per-ticket fee.
Historical performance has not established that these model estimates are profitable, and multiple
picks in one game can be correlated. The `/api/backtest` scoreboard grades archived Bet Now
recommendations, while the Tracker persists available CLV to the bet store. Bet Now does not show
seed fallback data as actionable picks when the live feed is offline. The live-pick archive starts
when the default Bet Now page is visited while live odds are available; keep the local Node server
running and revisit before kickoff to capture changes.
The persistent scheduler captures automatically while the Node process is alive; serverless hosts
should invoke the authenticated cron route because process-local timers may pause between requests.
Historical picks that were never recorded cannot be reconstructed retroactively.

## Live data (free, no key)

The entire app runs on **free data, no key required**. From ESPN: real schedule, live DraftKings
odds, scores/status, and injuries. From Open-Meteo: live wind/precip/temperature at each outdoor
stadium. Rest/bye is derived from the schedule, and completed results feed an in-season Elo model
that re-rates every team weekly.

FanDuel's public feed also supplies a **limited, live subset** of alternate passing- and
receiving-yard props. These are kept separate from DraftKings prices and are not a complete
standard player-prop board. FanDuel's public player-props endpoint was unavailable during testing;
the app only uses markets present in the working public NFL feed.

Optionally, add a free key from [the-odds-api.com](https://the-odds-api.com/) to pull exact posted
**DraftKings player-prop lines**:

```bash
cp .env.example .env.local
# paste your key into ODDS_API_KEY and set ODDS_API_PROPS=true
```

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

1. Refresh the live slate, lines, injuries, rest, and weather inputs.
2. On Bet Now, compare model-versus-market numbers with cited matchup and situational evidence;
   approve only picks whose exact line and price still make sense, or pass.
3. Place approved picks and settle results on the Tracker. Assess calibration with recorded CLV and
   outcomes over many bets, not a single game's result.

---

Adapted from Ken Barkley's publicly-described 2026 NFL betting methodology.
