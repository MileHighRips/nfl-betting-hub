# LockyLines ML trainer (offline)

Trains gradient-boosted (XGBoost) margin & total models on **15+ seasons** of
nflverse data with **season-level recency decay**, then **walk-forward validates**
by grading ATS / Over-Under / Moneyline ROI at real prices. The Next app never
trains — it only ever reads the exported JSON artifact.

## Run

```powershell
python -m pip install -r ml/requirements.txt
python ml/build_model.py   # game lines: margin/total zoo + walk-forward + segments
python ml/build_props.py    # player props: 15-season anytime-TD calibration
```

Outputs:
- `ml/artifacts/margin.json`, `ml/artifacts/total.json` — XGBoost native models.
- `data/store/ml-model.json` — the app contract (metadata, walk-forward results,
  latest team Elo). Safe to commit; the app treats it as read-only reference.

## Recency weighting

Each training game is weighted `SEASON_DECAY ** (maxSeason - season)` with
`SEASON_DECAY = 0.85`, so last month counts ~5× a game from 2015. This is the
requested handling of scheme / QB / pace drift. Tune `SEASON_DECAY`, `N_SEASONS`,
and the XGBoost params at the top of `build_model.py`.

## Honest result (why this is NOT wired into live picks yet)

Walk-forward (2022-2026), grading against the **closing** spread:

| Season | ATS ROI |
| --- | --- |
| 2022 | −2.0% |
| 2023 | +7.3% |
| 2024 | −12.4% |
| 2025 | −10.5% |
| 2026 | −6.7% |
| **avg** | **−4.9%** |

A from-scratch XGBoost on team/box-score features **does not beat the closing
line** — the market is too efficient, and −5% is roughly paying the vig. This is
the expected, well-documented reality of NFL sides, and it's exactly why we
validate before betting. Wiring this model into live picks as-is would *lose*
money, so it stays a reference artifact until it clears breakeven out-of-sample.

## Where the edge actually is (next iterations)

1. **EPA / success-rate features** from `nflverse` play-by-play (sharper than box
   score) — add a `--with-epa` path that aggregates team-week EPA.
2. **Softer markets, not the efficient closing spread** — props, some totals,
   live/derivatives. Train per-market models there.
3. **Grade vs the OPENING line / CLV**, not the close — the edge is beating the
   number *before* it moves, which the closing-line test cannot reward.
4. Only after a config clears breakeven walk-forward do we build the TS inference
   bridge and let it influence stakes.

## Player props (`build_props.py` → `data/store/props-model.json`)

nflverse has 15 seasons of player game logs but **no historical prop lines**, so
prop betting ROI cannot be computed offline. Instead we train a calibrated
**anytime-touchdown probability** model and validate it walk-forward:

- Anytime-TD Brier **beats** the position-baseline (0.176 vs 0.189), and
  calibration is tight across 18k player-games (pred 24% → real 24%).
  Trustworthy enough to anchor the app's anytime-TD market — bet only when the
  live DK price implies LESS than this model's probability.
- Yardage projection MAE ≈ a naive rolling average (no edge yet) — beating
  yardage props needs snap/route data or the actual lines.

## Artifact contract (`data/store/ml-model.json`)

```jsonc
{
  "meta": { "trainedAt", "seasons": [from, to], "nGames", "seasonDecay",
            "features": [...], "marginResidualSd" },
  "walkForward": [ { "season", "games", "ats": {...}, "ou": {...}, "ml": {...} } ],
  "walkForwardSummary": { "atsRoi", "atsSelectiveRoi", "ouRoi" },
  "teamElo": [ { "team", "elo" }, ... ]   // latest ratings, high → low
}
```
