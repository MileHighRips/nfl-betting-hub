"""
LockyLines PROPS trainer — 15 seasons of nflverse player game logs.

Honest scope: nflverse gives us what players actually DID (yards, catches, TDs)
but NOT the historical prop lines the book offered, so we cannot compute a true
prop betting ROI offline. What we CAN do — and what most improves the app — is
train a well-calibrated **anytime-touchdown probability** model and validate its
calibration walk-forward (predicted P(TD) vs. realized). The app's anytime-TD
market is its worst (~35%), and a calibrated 15-season TD prior compared against
the live DraftKings price is the honest way to find +EV there. We also report
receiving/rushing-yard projection accuracy (MAE) as a foundation for yardage
props once a prop-line feed is added.

Run:  python ml/build_props.py
"""
from __future__ import annotations

import io
import json
import os
import urllib.request
import warnings

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss
from xgboost import XGBClassifier, XGBRegressor

warnings.filterwarnings("ignore")

BASE = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/stats_player_week_{}.csv"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data", "players")
APP_ARTIFACT = os.path.join(HERE, "..", "data", "store", "props-model.json")

N_SEASONS = 15
SEASON_DECAY = 0.85
WALK_FORWARD = 5
ROLL = 10                # rolling window (games)
MIN_TOUCHES = 3.0        # only grade players who'd realistically have a TD market
SKILL = ("QB", "RB", "WR", "TE")

TD_FEATURES = [
    "r_td_rate", "r_rush_tds", "r_rec_tds",
    "r_carries", "r_targets", "r_receptions",
    "r_rush_yds", "r_rec_yds", "r_target_share", "r_air_yards_share", "r_wopr",
    "opp_pos_td_allowed", "is_RB", "is_WR", "is_TE", "is_QB", "week",
]


def load_players() -> pd.DataFrame:
    os.makedirs(DATA_DIR, exist_ok=True)
    # Probe the latest season by trying downwards from a ceiling.
    frames = []
    ceiling = 2026
    seasons = range(ceiling - N_SEASONS, ceiling + 1)
    for yr in seasons:
        cache = os.path.join(DATA_DIR, f"{yr}.csv")
        raw = None
        if os.path.exists(cache) and os.path.getsize(cache) > 0:
            raw = open(cache, "rb").read()
        else:
            try:
                req = urllib.request.Request(BASE.format(yr), headers={"User-Agent": "Mozilla/5.0"})
                raw = urllib.request.urlopen(req, timeout=90).read()
                open(cache, "wb").write(raw)
            except Exception:  # noqa: BLE001
                continue
        try:
            frames.append(pd.read_csv(io.BytesIO(raw), low_memory=False))
        except Exception:  # noqa: BLE001
            continue
    df = pd.concat(frames, ignore_index=True)
    if "season_type" in df:
        df = df[df.season_type == "REG"]
    df = df[df.position.isin(SKILL)].copy()
    for c in ["carries", "targets", "receptions", "rushing_yards", "receiving_yards",
              "rushing_tds", "receiving_tds", "target_share", "air_yards_share", "wopr",
              "passing_yards"]:
        if c not in df:
            df[c] = 0.0
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    df["scored_td"] = ((df.rushing_tds + df.receiving_tds) > 0).astype(int)
    df["touches"] = df.carries + df.targets
    df = df.sort_values(["season", "week"]).reset_index(drop=True)
    return df


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("player_id", group_keys=False)

    def roll(col):
        return g[col].apply(lambda s: s.shift(1).rolling(ROLL, min_periods=1).mean())

    df["r_td_rate"] = roll("scored_td")
    df["r_rush_tds"] = roll("rushing_tds")
    df["r_rec_tds"] = roll("receiving_tds")
    df["r_carries"] = roll("carries")
    df["r_targets"] = roll("targets")
    df["r_receptions"] = roll("receptions")
    df["r_rush_yds"] = roll("rushing_yards")
    df["r_rec_yds"] = roll("receiving_yards")
    df["r_target_share"] = roll("target_share")
    df["r_air_yards_share"] = roll("air_yards_share")
    df["r_wopr"] = roll("wopr")
    df["r_pass_yds"] = roll("passing_yards")
    df["r_touches"] = g["touches"].apply(lambda s: s.shift(1).rolling(ROLL, min_periods=1).mean())

    # Opponent defense: how many TDs this opponent allows to this position (leak-free).
    od = df.groupby(["opponent_team", "position"], group_keys=False)["scored_td"]
    df["opp_pos_td_allowed"] = od.apply(lambda s: s.shift(1).expanding().mean())

    for p in ("RB", "WR", "TE", "QB"):
        df[f"is_{p}"] = (df.position == p).astype(int)

    df[TD_FEATURES] = df[TD_FEATURES].fillna(0.0)
    return df


def season_weights(seasons, ref):
    return SEASON_DECAY ** (ref - seasons)


def walk_forward_td(df: pd.DataFrame):
    seasons = sorted(df.season.unique())
    test_seasons = seasons[-WALK_FORWARD:]
    preds, actuals, bases = [], [], []
    for s in test_seasons:
        tr = df[(df.season < s) & (df.r_touches >= 1)]
        te = df[(df.season == s) & (df.r_touches >= MIN_TOUCHES)]
        if len(tr) < 2000 or te.empty:
            continue
        w = season_weights(tr.season.values, s - 1)
        clf = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.03,
                            subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                            reg_lambda=1.5, eval_metric="logloss", n_jobs=4)
        clf.fit(tr[TD_FEATURES].values, tr["scored_td"].values, sample_weight=w)
        p = clf.predict_proba(te[TD_FEATURES].values)[:, 1]
        # Baseline: position base rate from training.
        base_rate = tr.groupby("position")["scored_td"].mean().to_dict()
        b = te.position.map(base_rate).fillna(tr["scored_td"].mean()).values
        preds.append(p); actuals.append(te["scored_td"].values); bases.append(b)
    p = np.concatenate(preds); y = np.concatenate(actuals); b = np.concatenate(bases)
    return p, y, b


def calibration_table(p, y, edges=(0, 0.1, 0.2, 0.3, 0.45, 1.01)):
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum() < 20:
            continue
        rows.append({"lo": lo, "hi": hi, "n": int(m.sum()),
                     "pred": round(float(p[m].mean()), 4),
                     "real": round(float(y[m].mean()), 4)})
    return rows


def yardage_mae(df: pd.DataFrame, target: str, pos_filter):
    seasons = sorted(df.season.unique())
    errs = []
    for s in seasons[-WALK_FORWARD:]:
        tr = df[(df.season < s) & df.position.isin(pos_filter) & (df.r_touches >= 1)]
        te = df[(df.season == s) & df.position.isin(pos_filter) & (df.r_touches >= MIN_TOUCHES)]
        if len(tr) < 1000 or te.empty:
            continue
        w = season_weights(tr.season.values, s - 1)
        reg = XGBRegressor(n_estimators=250, max_depth=4, learning_rate=0.03,
                           subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                           reg_lambda=1.5, n_jobs=4)
        reg.fit(tr[TD_FEATURES].values, tr[target].values, sample_weight=w)
        pred = reg.predict(te[TD_FEATURES].values)
        errs.append(np.abs(pred - te[target].values))
        # naive baseline = player's rolling average of the target
        naive_col = {"receiving_yards": "r_rec_yds", "rushing_yards": "r_rush_yds"}[target]
        naive_err = np.abs(te[naive_col].values - te[target].values)
    return float(np.mean(np.concatenate(errs))), float(np.mean(naive_err))


def residual_sd(df: pd.DataFrame, actual: str, roll_col: str, pos, min_line: float) -> float:
    """SD of (actual - recent baseline) for players who'd realistically have a line."""
    d = df[df.position.isin(pos) & (df[roll_col] >= min_line) & (df.r_touches >= MIN_TOUCHES)]
    if len(d) < 500:
        return float("nan")
    return float(np.std(d[actual].values - d[roll_col].values))


def main():
    print("Loading nflverse player weeks (15 seasons)…")
    df = load_players()
    print(f"  {len(df)} skill-player games, seasons {int(df.season.min())}-{int(df.season.max())}")

    print("Building leak-free rolling features…")
    df = build_features(df)

    print(f"Walk-forward anytime-TD calibration (last {WALK_FORWARD} seasons)…")
    p, y, b = walk_forward_td(df)
    brier = brier_score_loss(y, p)
    brier_base = brier_score_loss(y, b)
    print(f"  graded {len(y)} player-games | base TD rate {y.mean():.1%}")
    print(f"  Brier: model {brier:.4f}  vs position-baseline {brier_base:.4f}"
          f"  ({'better' if brier < brier_base else 'worse'} by {abs(brier_base - brier):.4f})")
    cal = calibration_table(p, y)
    print("  calibration (predicted -> realized):")
    for r in cal:
        print(f"    {r['lo']:.2f}-{r['hi']:.2f}: pred {r['pred']:.1%} -> real {r['real']:.1%} (n={r['n']})")

    print("Walk-forward yardage projection MAE…")
    rec_mae, rec_naive = yardage_mae(df, "receiving_yards", ("WR", "TE", "RB"))
    rush_mae, rush_naive = yardage_mae(df, "rushing_yards", ("RB", "QB"))
    print(f"  receiving_yards MAE model {rec_mae:.1f} vs naive rolling-avg {rec_naive:.1f}")
    print(f"  rushing_yards   MAE model {rush_mae:.1f} vs naive rolling-avg {rush_naive:.1f}")

    print("Measuring real prop residual SDs (15 seasons)…")
    prop_sd = {
        "Pass Yards": residual_sd(df, "passing_yards", "r_pass_yds", ("QB",), 120),
        "Rush Yards": residual_sd(df, "rushing_yards", "r_rush_yds", ("RB", "QB"), 20),
        "Receiving Yards": residual_sd(df, "receiving_yards", "r_rec_yds", ("WR", "TE", "RB"), 20),
        "Receptions": residual_sd(df, "receptions", "r_receptions", ("WR", "TE", "RB"), 2),
    }
    for k, v in prop_sd.items():
        print(f"    {k:<16} residual SD {v:.2f}")

    contract = {
        "meta": {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "seasons": [int(df.season.min()), int(df.season.max())],
            "nPlayerGames": int(len(df)),
            "seasonDecay": SEASON_DECAY,
            "features": TD_FEATURES,
            "note": "Anytime-TD probability model. No historical prop lines offline; "
                    "compare these calibrated probabilities to live DK prices for +EV.",
        },
        "anytimeTd": {
            "gradedGames": int(len(y)),
            "baseRate": round(float(y.mean()), 4),
            "brierModel": round(float(brier), 4),
            "brierBaseline": round(float(brier_base), 4),
            "calibration": cal,
        },
        "yardageMae": {
            "receiving": {"model": round(rec_mae, 2), "naive": round(rec_naive, 2)},
            "rushing": {"model": round(rush_mae, 2), "naive": round(rush_naive, 2)},
        },
        "propResidualSd": {k: (round(v, 2) if v == v else None) for k, v in prop_sd.items()},
    }
    os.makedirs(os.path.dirname(APP_ARTIFACT), exist_ok=True)
    with open(APP_ARTIFACT, "w") as f:
        json.dump(contract, f, indent=2)
    print(f"Wrote {APP_ARTIFACT}")


if __name__ == "__main__":
    main()
