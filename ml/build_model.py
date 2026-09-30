"""
LockyLines model trainer — 15+ seasons of nflverse data, recency-decayed.

Pipeline (offline; the Next app never trains):
  1. Load nflverse games.csv (scores, closing lines, rest, roof, div).
  2. Engineer LEAK-FREE pre-game features in chronological order — cross-season
     Elo (regressed to the mean each new season) + rolling form + market priors.
  3. Train XGBoost margin & total regressors with SEASON-LEVEL EXPONENTIAL DECAY
     sample weights, so 2015 football counts far less than last month — schemes,
     QBs and pace drift, and the model should trust recent seasons more.
  4. WALK-FORWARD validation: for each recent season, train only on prior
     seasons and grade ATS / Over-Under / Moneyline ROI at real -110 prices.
  5. Export artifacts (XGBoost JSON + model.json contract) for the TS app.

Run:  python ml/build_model.py
Docs: ml/README.md
"""
from __future__ import annotations

import io
import json
import math
import os
import urllib.request
import warnings
from collections import defaultdict, deque

warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LogisticRegression, PoissonRegressor, Ridge
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

# ----------------------------- config --------------------------------------
GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
ART_DIR = os.path.join(HERE, "artifacts")
APP_ARTIFACT = os.path.join(HERE, "..", "data", "store", "ml-model.json")

N_SEASONS = 15          # seasons of history to train on
SEASON_DECAY = 0.85     # weight = DECAY ** (maxSeason - season); recency weighting
WALK_FORWARD = 5        # validate on this many most-recent completed seasons
ROLL = 10               # rolling window (games) for form features
ELO_K = 20.0
ELO_HFA = 48.0          # ~1.9 pts of home edge, in Elo
ELO_REVERT = 0.33       # regress toward mean between seasons
ELO_START = 1500.0
PROFIT_110 = 100 / 110  # profit on a winning -110 bet

FEATURES = [
    "elo_diff", "home_elo", "away_elo",
    "home_rest", "away_rest", "rest_diff",
    "div_game", "is_dome", "week",
    "home_roll_margin", "away_roll_margin",
    "home_roll_pf", "home_roll_pa", "away_roll_pf", "away_roll_pa",
    "spread_line", "total_line",
]


# ----------------------------- data ----------------------------------------
def load_games() -> pd.DataFrame:
    os.makedirs(DATA_DIR, exist_ok=True)
    cache = os.path.join(DATA_DIR, "games.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        raw = open(cache, "rb").read()
    else:
        req = urllib.request.Request(GAMES_URL, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=90).read()
        open(cache, "wb").write(raw)
    df = pd.read_csv(io.BytesIO(raw))
    df = df[df.game_type == "REG"].copy()
    df = df.dropna(subset=["result", "total", "spread_line", "total_line"])
    df["gameday"] = pd.to_datetime(df["gameday"])
    df = df.sort_values("gameday").reset_index(drop=True)
    max_season = int(df.season.max())
    df = df[df.season >= max_season - N_SEASONS].copy()
    return df.reset_index(drop=True)


# ----------------------- leak-free feature build ---------------------------
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    elo: dict[str, float] = defaultdict(lambda: ELO_START)
    margins: dict[str, deque] = defaultdict(lambda: deque(maxlen=ROLL))
    pf: dict[str, deque] = defaultdict(lambda: deque(maxlen=ROLL))
    pa: dict[str, deque] = defaultdict(lambda: deque(maxlen=ROLL))
    seen_season: dict[str, int] = {}
    rows = []

    def avg(d: deque, default=0.0) -> float:
        return float(np.mean(d)) if len(d) else default

    for g in df.itertuples(index=False):
        h, a, season = g.home_team, g.away_team, int(g.season)
        # Between seasons, regress Elo toward the mean (new rosters/schemes).
        for t in (h, a):
            if seen_season.get(t) not in (None, season):
                elo[t] = ELO_START + (elo[t] - ELO_START) * (1 - ELO_REVERT)
            seen_season[t] = season

        is_dome = 1 if str(g.roof) in ("dome", "closed") else 0
        rows.append({
            "season": season,
            "elo_diff": elo[h] + ELO_HFA - elo[a],
            "home_elo": elo[h], "away_elo": elo[a],
            "home_rest": g.home_rest, "away_rest": g.away_rest,
            "rest_diff": g.home_rest - g.away_rest,
            "div_game": int(g.div_game), "is_dome": is_dome, "week": int(g.week),
            "home_roll_margin": avg(margins[h]), "away_roll_margin": avg(margins[a]),
            "home_roll_pf": avg(pf[h], 22.0), "home_roll_pa": avg(pa[h], 22.0),
            "away_roll_pf": avg(pf[a], 22.0), "away_roll_pa": avg(pa[a], 22.0),
            "spread_line": g.spread_line, "total_line": g.total_line,
            "margin": g.result, "total": g.total,
            "home_pts": g.home_score, "away_pts": g.away_score,
        })

        # ---- update state AFTER recording features (no leakage) ----
        exp_home = 1 / (1 + 10 ** (-(elo[h] + ELO_HFA - elo[a]) / 400))
        home_win = 1.0 if g.result > 0 else (0.5 if g.result == 0 else 0.0)
        mov = math.log(abs(g.result) + 1) * (
            2.2 / (((elo[h] + ELO_HFA - elo[a]) if g.result > 0 else (elo[a] - elo[h] - ELO_HFA)) * 0.001 + 2.2)
        )
        delta = ELO_K * mov * (home_win - exp_home)
        elo[h] += delta
        elo[a] -= delta
        hs, as_ = g.home_score, g.away_score
        margins[h].append(g.result); margins[a].append(-g.result)
        pf[h].append(hs); pa[h].append(as_)
        pf[a].append(as_); pa[a].append(hs)

    return pd.DataFrame(rows), elo


def season_weights(seasons: np.ndarray, ref_season: int) -> np.ndarray:
    return SEASON_DECAY ** (ref_season - seasons)


# ------------------------------ model zoo ----------------------------------
# Each entry trains a margin + total predictor. Tree models use raw features and
# decay weights; scaled models (net/linear/Poisson) get StandardScaler + weights
# (MLP has no sample_weight, so it trains unweighted — noted in the report).
ENSEMBLE_MARGIN = ["xgb", "rf", "mlp", "ridge", "poisson"]
ENSEMBLE_TOTAL = ["xgb", "rf", "poisson"]


def _xgb():
    return XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.03,
                        subsample=0.8, colsample_bytree=0.8, min_child_weight=5,
                        reg_lambda=1.5, objective="reg:squarederror", n_jobs=4)


def _rf():
    return RandomForestRegressor(n_estimators=300, max_depth=8, min_samples_leaf=20,
                                 n_jobs=4, random_state=0)


def _mlp():
    return MLPRegressor(hidden_layer_sizes=(32, 16), alpha=1e-3, max_iter=400,
                        early_stopping=True, random_state=0)


def train_zoo(tr: pd.DataFrame, w: np.ndarray, scaler: StandardScaler):
    """Fit every model; return dict name -> {'margin': arr_fn, 'total': arr_fn}."""
    Xtr = tr[FEATURES].values
    Xs = scaler.transform(Xtr)
    ym, yt = tr["margin"].values, tr["total"].values
    yhp, yap = tr["home_pts"].values, tr["away_pts"].values
    models = {}

    for name, raw in (("xgb", True), ("rf", True)):
        fm = (_xgb() if name == "xgb" else _rf()).fit(Xtr, ym, sample_weight=w)
        ft = (_xgb() if name == "xgb" else _rf()).fit(Xtr, yt, sample_weight=w)
        models[name] = {"margin": fm, "total": ft, "scaled": False}

    mlm = _mlp().fit(Xs, ym)
    mlt = _mlp().fit(Xs, yt)
    models["mlp"] = {"margin": mlm, "total": mlt, "scaled": True}

    rgm = Ridge(alpha=5.0).fit(Xs, ym, sample_weight=w)
    rgt = Ridge(alpha=5.0).fit(Xs, yt, sample_weight=w)
    models["ridge"] = {"margin": rgm, "total": rgt, "scaled": True}

    # Poisson on each team's points → margin & total fall out.
    phm = PoissonRegressor(alpha=1e-3, max_iter=300).fit(Xs, yhp, sample_weight=w)
    pam = PoissonRegressor(alpha=1e-3, max_iter=300).fit(Xs, yap, sample_weight=w)
    models["poisson"] = {"home": phm, "away": pam, "scaled": True}

    # Direct regularized-logistic ATS classifier (predicts home cover).
    logit = LogisticRegression(C=0.5, max_iter=500).fit(
        Xs, (tr["margin"].values > tr["spread_line"].values).astype(int), sample_weight=w)
    models["logit"] = {"classifier": logit, "scaled": True}
    return models


def predict_zoo(models, te: pd.DataFrame, scaler: StandardScaler):
    X = te[FEATURES].values
    Xs = scaler.transform(X)
    pm, pt = {}, {}
    for name in ("xgb", "rf"):
        pm[name] = models[name]["margin"].predict(X)
        pt[name] = models[name]["total"].predict(X)
    for name in ("mlp", "ridge"):
        pm[name] = models[name]["margin"].predict(Xs)
        pt[name] = models[name]["total"].predict(Xs)
    hp = models["poisson"]["home"].predict(Xs)
    ap = models["poisson"]["away"].predict(Xs)
    pm["poisson"], pt["poisson"] = hp - ap, hp + ap
    pm["ENSEMBLE"] = np.mean([pm[n] for n in ENSEMBLE_MARGIN], axis=0)
    pt["ENSEMBLE"] = np.mean([pt[n] for n in ENSEMBLE_TOTAL], axis=0)
    logit_cover = models["logit"]["classifier"].predict_proba(Xs)[:, 1]
    return pm, pt, logit_cover


# ------------------------------ grading ------------------------------------
def _norm_cdf(x):
    return 0.5 * (1 + np.vectorize(math.erf)(x / math.sqrt(2)))


def _outcomes(prob, won_mask, push_mask):
    """Per-game (picked_win, decided) picking the side the model favors."""
    bet_yes = prob >= 0.5
    picked_win = np.where(bet_yes, won_mask, ~won_mask)
    return picked_win, ~push_mask


def _roi(picked_win, decided, sel_mask=None):
    m = decided if sel_mask is None else (decided & sel_mask)
    n = int(m.sum())
    wins = int((picked_win & m).sum())
    losses = n - wins
    return n, wins, losses, (wins * PROFIT_110 - losses)


class Tally:
    def __init__(self):
        self.n = self.w = self.l = 0
        self.sn = self.sw = self.sl = 0

    def add(self, prob, won, push):
        pw, dec = _outcomes(prob, won, push)
        n, w, l, _ = _roi(pw, dec)
        self.n += n; self.w += w; self.l += l
        sel = np.abs(prob - 0.5) >= 0.06
        sn, sw, sl, _ = _roi(pw, dec, sel)
        self.sn += sn; self.sw += sw; self.sl += sl

    def summary(self):
        roi = (self.w * PROFIT_110 - self.l) / self.n if self.n else 0
        sroi = (self.sw * PROFIT_110 - self.sl) / self.sn if self.sn else 0
        return {
            "n": self.n, "wins": self.w, "losses": self.l,
            "acc": round(self.w / self.n, 4) if self.n else 0,
            "roi": round(roi, 4),
            "sel_n": self.sn, "sel_acc": round(self.sw / self.sn, 4) if self.sn else 0,
            "sel_roi": round(sroi, 4),
        }


# --------------------------- walk-forward ----------------------------------
def walk_forward(feat: pd.DataFrame):
    seasons = sorted(feat.season.unique())
    test_seasons = seasons[-WALK_FORWARD:]
    names = ENSEMBLE_MARGIN + ["ENSEMBLE"]
    ats = {n: Tally() for n in names}
    ats["logit"] = Tally()
    ou = {n: Tally() for n in ENSEMBLE_TOTAL + ["ENSEMBLE"]}
    seg_rows = []

    for s in test_seasons:
        tr = feat[feat.season < s]
        te = feat[feat.season == s]
        if len(tr) < 200 or te.empty:
            continue
        w = season_weights(tr.season.values, s - 1)
        scaler = StandardScaler().fit(tr[FEATURES].values)
        models = train_zoo(tr, w, scaler)
        pm, pt, logit_cover = predict_zoo(models, te, scaler)

        sl, tl = te["spread_line"].values, te["total_line"].values
        am, at = te["margin"].values, te["total"].values
        home_cover, cover_push = am > sl, am == sl
        over_hit, over_push = at > tl, at == tl

        # Regression models → cover/over probabilities via residual sigma.
        for n in ENSEMBLE_MARGIN + ["ENSEMBLE"]:
            sd = float(np.std(am - pm[n])) or 13.2
            ats[n].add(1 - _norm_cdf((sl - pm[n]) / sd), home_cover, cover_push)
        ats["logit"].add(logit_cover, home_cover, cover_push)
        for n in ENSEMBLE_TOTAL + ["ENSEMBLE"]:
            sd = float(np.std(at - pt[n])) or 10.0
            ou[n].add(1 - _norm_cdf((tl - pt[n]) / sd), over_hit, over_push)

        # Segment rows use the ensemble.
        sd_m = float(np.std(am - pm["ENSEMBLE"])) or 13.2
        sd_t = float(np.std(at - pt["ENSEMBLE"])) or 10.0
        cp = 1 - _norm_cdf((sl - pm["ENSEMBLE"]) / sd_m)
        op = 1 - _norm_cdf((tl - pt["ENSEMBLE"]) / sd_t)
        seg_rows.append(pd.DataFrame({
            "spread_line": sl, "total_line": tl, "margin": am, "total": at,
            "div_game": te["div_game"].values, "rest_diff": te["rest_diff"].values,
            "cover_prob": cp, "home_cover": home_cover, "cover_push": cover_push,
            "over_prob": op, "over_hit": over_hit, "over_push": over_push,
        }))

    return (
        {n: t.summary() for n, t in ats.items()},
        {n: t.summary() for n, t in ou.items()},
        pd.concat(seg_rows, ignore_index=True) if seg_rows else pd.DataFrame(),
    )


def segment_report(df: pd.DataFrame) -> list[dict]:
    """Hunt for soft pockets: ROI of the ensemble within situational segments."""
    if df.empty:
        return []
    segs = {
        "ALL": np.ones(len(df), bool),
        "high_total (>=47)": df.total_line >= 47,
        "low_total (<=41)": df.total_line <= 41,
        "divisional": df.div_game == 1,
        "big_rest_edge (|Δ|>=3)": df.rest_diff.abs() >= 3,
        "big_favorite (|spr|>=7)": df.spread_line.abs() >= 7,
        "pickem (|spr|<=3)": df.spread_line.abs() <= 3,
    }
    out = []
    for name, mask in segs.items():
        d = df[mask]
        if len(d) < 40:
            continue
        # OU in this segment (usually the softer market).
        pw, dec = _outcomes(d.over_prob.values, d.over_hit.values, d.over_push.values)
        n, wins, losses, units = _roi(pw, dec)
        # ATS in this segment.
        apw, adec = _outcomes(d.cover_prob.values, d.home_cover.values, d.cover_push.values)
        an, aw, al, aunits = _roi(apw, adec)
        out.append({
            "segment": name, "n": int(len(d)),
            "ou_roi": round(units / n, 4) if n else 0, "ou_acc": round(wins / n, 4) if n else 0,
            "ats_roi": round(aunits / an, 4) if an else 0, "ats_acc": round(aw / an, 4) if an else 0,
        })
    return out


# ------------------------------ export -------------------------------------
def main():
    print("Loading nflverse games…")
    df = load_games()
    print(f"  {len(df)} REG games, seasons {int(df.season.min())}-{int(df.season.max())}")

    print("Building leak-free features…")
    feat, latest_elo = build_features(df)

    print(f"Walk-forward: model zoo, last {WALK_FORWARD} seasons, decay={SEASON_DECAY}…")
    ats, ou, seg = walk_forward(feat)

    print("\n  ATS (vs closing spread)        acc     ROI  | selective acc   ROI  (n)")
    for n in ENSEMBLE_MARGIN + ["logit", "ENSEMBLE"]:
        r = ats[n]
        print(f"    {n:<10} {r['wins']:>4}-{r['losses']:<4} {r['acc']:.1%}  {r['roi']:+.1%}"
              f"  | {r['sel_acc']:.1%} {r['sel_roi']:+.1%} ({r['sel_n']})")
    print("\n  Over/Under (vs closing total)  acc     ROI")
    for n in ENSEMBLE_TOTAL + ["ENSEMBLE"]:
        r = ou[n]
        print(f"    {n:<10} {r['wins']:>4}-{r['losses']:<4} {r['acc']:.1%}  {r['roi']:+.1%}")

    seg_rep = segment_report(seg)
    print("\n  Soft-market hunt (ensemble ROI by segment):")
    print(f"    {'segment':<24} {'n':>4}  {'OU ROI':>7} {'OU acc':>7}  {'ATS ROI':>7} {'ATS acc':>7}")
    for r in seg_rep:
        print(f"    {r['segment']:<24} {r['n']:>4}  {r['ou_roi']:>+7.1%} {r['ou_acc']:>7.1%}"
              f"  {r['ats_roi']:>+7.1%} {r['ats_acc']:>7.1%}")

    print("\nTraining final export models on all seasons (decayed)…")
    ref = int(feat.season.max())
    w = season_weights(feat.season.values, ref)
    margin_model = _xgb().fit(feat[FEATURES].values, feat["margin"].values, sample_weight=w)
    total_model = _xgb().fit(feat[FEATURES].values, feat["total"].values, sample_weight=w)
    resid_sd = float(np.std(feat["margin"].values - margin_model.predict(feat[FEATURES].values)))

    os.makedirs(ART_DIR, exist_ok=True)
    margin_model.get_booster().save_model(os.path.join(ART_DIR, "margin.json"))
    total_model.get_booster().save_model(os.path.join(ART_DIR, "total.json"))

    ratings = sorted(({"team": t, "elo": round(e, 1)} for t, e in latest_elo.items()),
                     key=lambda r: -r["elo"])
    contract = {
        "meta": {
            "trainedAt": pd.Timestamp.utcnow().isoformat(),
            "seasons": [int(feat.season.min()), int(feat.season.max())],
            "nGames": int(len(feat)), "seasonDecay": SEASON_DECAY,
            "features": FEATURES, "marginResidualSd": round(resid_sd, 3),
            "models": ENSEMBLE_MARGIN + ["logit"],
        },
        "atsWalkForward": ats,
        "ouWalkForward": ou,
        "segments": seg_rep,
        "teamElo": ratings,
    }
    os.makedirs(os.path.dirname(APP_ARTIFACT), exist_ok=True)
    with open(APP_ARTIFACT, "w") as f:
        json.dump(contract, f, indent=2)
    print(f"\nWrote {APP_ARTIFACT}")
    print("Top 5 Elo:", ", ".join(f"{r['team']} {r['elo']}" for r in ratings[:5]))


if __name__ == "__main__":
    main()
