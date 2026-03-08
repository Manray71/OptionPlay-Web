"""Standalone script to fetch IBKR portfolio positions and detect spreads.

Called via subprocess from json_routes.py — all user inputs passed as CLI args
to avoid f-string code injection.
"""

import argparse
import asyncio
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Fetch IBKR portfolio")
    parser.add_argument("--host", default="127.0.0.1", help="TWS host")
    parser.add_argument("--port", type=int, default=7497, help="TWS port")
    parser.add_argument(
        "--optionplay-dir", required=True, help="Path to OptionPlay root"
    )
    args = parser.parse_args()

    sys.path.insert(0, args.optionplay_dir)

    async def fetch():
        from ib_insync import IB

        ib = IB()
        await ib.connectAsync(args.host, args.port, clientId=99, timeout=10)
        raw = ib.portfolio()

        positions = []
        for item in raw:
            c = item.contract
            pos = {
                "symbol": c.symbol,
                "sec_type": c.secType,
                "quantity": item.position,
                "avg_cost": item.averageCost,
                "market_value": item.marketValue,
                "unrealized_pnl": item.unrealizedPNL,
                "realized_pnl": item.realizedPNL,
            }
            if c.secType == "OPT":
                pos["strike"] = c.strike
                pos["right"] = c.right
                pos["expiry"] = c.lastTradeDateOrContractMonth
            positions.append(pos)

        ib.disconnect()

        options = [p for p in positions if p["sec_type"] == "OPT"]
        stocks = [p for p in positions if p["sec_type"] == "STK"]

        groups = {}
        for o in options:
            key = (o["symbol"], o.get("expiry", ""))
            groups.setdefault(key, []).append(o)

        spreads = []
        M = set()  # matched ids

        for (sym, expiry), opts in groups.items():
            puts = sorted(
                [o for o in opts if o["right"] == "P"], key=lambda x: x["strike"]
            )
            calls = sorted(
                [o for o in opts if o["right"] == "C"], key=lambda x: x["strike"]
            )
            sp_ = [p for p in puts if p["quantity"] < 0]
            lp_ = [p for p in puts if p["quantity"] > 0]
            sc_ = [c for c in calls if c["quantity"] < 0]
            lc_ = [c for c in calls if c["quantity"] > 0]

            def avail(*legs):
                return all(id(l) not in M for l in legs)

            def mark(*legs):
                for l in legs:
                    M.add(id(l))

            def nc2(a, b):
                return (a["avg_cost"] - b["avg_cost"]) / 100

            def pnl(*legs):
                return sum(l.get("unrealized_pnl", 0) or 0 for l in legs)

            def mktv(*legs):
                return sum(l.get("market_value", 0) or 0 for l in legs)

            # ── PASS 1: 4-leg (Iron Condor / Iron Butterfly) ──
            for lp in lp_:
                for sp in sp_:
                    for sc in sc_:
                        for lc in lc_:
                            if not avail(lp, sp, sc, lc):
                                continue
                            q = abs(lp["quantity"])
                            if not (
                                abs(sp["quantity"])
                                == abs(sc["quantity"])
                                == abs(lc["quantity"])
                                == q
                            ):
                                continue
                            if not (
                                lp["strike"] < sp["strike"]
                                and sp["strike"] <= sc["strike"]
                                and sc["strike"] < lc["strike"]
                            ):
                                continue
                            pw = sp["strike"] - lp["strike"]
                            cw = lc["strike"] - sc["strike"]
                            nc = nc2(sp, lp) + nc2(sc, lc)
                            tp = (
                                "Iron Butterfly"
                                if sp["strike"] == sc["strike"]
                                else "Iron Condor"
                            )
                            spreads.append(
                                {
                                    "type": tp,
                                    "symbol": sym,
                                    "expiry": expiry,
                                    "short_strike": sp["strike"],
                                    "long_strike": lp["strike"],
                                    "short_call_strike": sc["strike"],
                                    "long_call_strike": lc["strike"],
                                    "width": max(pw, cw),
                                    "contracts": int(q),
                                    "net_credit": nc,
                                    "unrealized_pnl": pnl(lp, sp, sc, lc),
                                    "market_value": mktv(lp, sp, sc, lc),
                                }
                            )
                            mark(lp, sp, sc, lc)

            # ── PASS 2: 3-leg (Butterfly) ──
            # Call Butterfly: long low + 2x short mid + long high
            for i, lc1 in enumerate(lc_):
                if not avail(lc1):
                    continue
                for sc in sc_:
                    if not avail(sc):
                        continue
                    if sc["strike"] <= lc1["strike"]:
                        continue
                    if abs(sc["quantity"]) != 2 * abs(lc1["quantity"]):
                        continue
                    for lc2 in lc_[i + 1 :]:
                        if not avail(lc2):
                            continue
                        if lc2["strike"] <= sc["strike"]:
                            continue
                        if abs(lc2["quantity"]) != abs(lc1["quantity"]):
                            continue
                        if (
                            sc["strike"] - lc1["strike"]
                            != lc2["strike"] - sc["strike"]
                        ):
                            continue
                        w = sc["strike"] - lc1["strike"]
                        nd = (
                            lc1["avg_cost"] + lc2["avg_cost"] - sc["avg_cost"]
                        ) / 100
                        spreads.append(
                            {
                                "type": "Call Butterfly",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sc["strike"],
                                "long_strike": lc1["strike"],
                                "long_call_strike": lc2["strike"],
                                "width": w,
                                "contracts": int(abs(lc1["quantity"])),
                                "net_credit": -nd,
                                "unrealized_pnl": pnl(lc1, sc, lc2),
                                "market_value": mktv(lc1, sc, lc2),
                            }
                        )
                        mark(lc1, sc, lc2)
                        break
                    else:
                        continue
                    break

            # Put Butterfly: long high + 2x short mid + long low
            for i, lp1 in enumerate(reversed(lp_)):
                if not avail(lp1):
                    continue
                for sp in reversed(sp_):
                    if not avail(sp):
                        continue
                    if sp["strike"] >= lp1["strike"]:
                        continue
                    if abs(sp["quantity"]) != 2 * abs(lp1["quantity"]):
                        continue
                    for lp2 in lp_:
                        if not avail(lp2):
                            continue
                        if lp2["strike"] >= sp["strike"]:
                            continue
                        if abs(lp2["quantity"]) != abs(lp1["quantity"]):
                            continue
                        if (
                            lp1["strike"] - sp["strike"]
                            != sp["strike"] - lp2["strike"]
                        ):
                            continue
                        w = lp1["strike"] - sp["strike"]
                        nd = (
                            lp1["avg_cost"] + lp2["avg_cost"] - sp["avg_cost"]
                        ) / 100
                        spreads.append(
                            {
                                "type": "Put Butterfly",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sp["strike"],
                                "long_strike": lp2["strike"],
                                "long_put_strike": lp1["strike"],
                                "width": w,
                                "contracts": int(abs(lp1["quantity"])),
                                "net_credit": -nd,
                                "unrealized_pnl": pnl(lp1, sp, lp2),
                                "market_value": mktv(lp1, sp, lp2),
                            }
                        )
                        mark(lp1, sp, lp2)
                        break
                    else:
                        continue
                    break

            # ── PASS 3a: Straddle / Strangle ──
            for c in sc_ + lc_:
                if not avail(c):
                    continue
                for p in sp_ + lp_:
                    if not avail(p):
                        continue
                    if abs(c["quantity"]) != abs(p["quantity"]):
                        continue
                    if (c["quantity"] > 0) != (p["quantity"] > 0):
                        continue
                    is_long = c["quantity"] > 0
                    if c["strike"] == p["strike"]:
                        tp = "Long Straddle" if is_long else "Short Straddle"
                    elif c["strike"] > p["strike"]:
                        tp = "Long Strangle" if is_long else "Short Strangle"
                    else:
                        continue
                    prem = (c["avg_cost"] + p["avg_cost"]) / 100
                    spreads.append(
                        {
                            "type": tp,
                            "symbol": sym,
                            "expiry": expiry,
                            "short_strike": p["strike"] if not is_long else None,
                            "long_strike": c["strike"] if is_long else None,
                            "put_strike": p["strike"],
                            "call_strike": c["strike"],
                            "width": abs(c["strike"] - p["strike"]),
                            "contracts": int(abs(c["quantity"])),
                            "net_credit": prem if not is_long else -prem,
                            "unrealized_pnl": pnl(c, p),
                            "market_value": mktv(c, p),
                        }
                    )
                    mark(c, p)
                    break

            # ── PASS 3b: 2-leg vertical spreads ──
            # Bull Put Spread
            for sp in sp_:
                if not avail(sp):
                    continue
                for lp in lp_:
                    if not avail(lp):
                        continue
                    if (
                        lp["strike"] < sp["strike"]
                        and abs(lp["quantity"]) == abs(sp["quantity"])
                    ):
                        spreads.append(
                            {
                                "type": "Bull Put Spread",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sp["strike"],
                                "long_strike": lp["strike"],
                                "width": sp["strike"] - lp["strike"],
                                "contracts": int(abs(sp["quantity"])),
                                "net_credit": nc2(sp, lp),
                                "unrealized_pnl": pnl(sp, lp),
                                "market_value": mktv(sp, lp),
                            }
                        )
                        mark(sp, lp)
                        break

            # Call verticals
            for sc in sc_:
                if not avail(sc):
                    continue
                for lc in lc_:
                    if not avail(lc):
                        continue
                    if abs(lc["quantity"]) != abs(sc["quantity"]):
                        continue
                    w = abs(lc["strike"] - sc["strike"])
                    if sc["strike"] < lc["strike"]:
                        spreads.append(
                            {
                                "type": "Bear Call Spread",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sc["strike"],
                                "long_strike": lc["strike"],
                                "width": w,
                                "contracts": int(abs(sc["quantity"])),
                                "net_credit": nc2(sc, lc),
                                "unrealized_pnl": pnl(sc, lc),
                                "market_value": mktv(sc, lc),
                            }
                        )
                    else:
                        nd = nc2(lc, sc)
                        spreads.append(
                            {
                                "type": "Bull Call Spread",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sc["strike"],
                                "long_strike": lc["strike"],
                                "width": w,
                                "contracts": int(abs(sc["quantity"])),
                                "net_credit": -nd,
                                "unrealized_pnl": pnl(sc, lc),
                                "market_value": mktv(sc, lc),
                            }
                        )
                    mark(sc, lc)
                    break

            # Bear Put Spread
            for lp in lp_:
                if not avail(lp):
                    continue
                for sp in sp_:
                    if not avail(sp):
                        continue
                    if (
                        sp["strike"] < lp["strike"]
                        and abs(sp["quantity"]) == abs(lp["quantity"])
                    ):
                        nd = nc2(lp, sp)
                        spreads.append(
                            {
                                "type": "Bear Put Spread",
                                "symbol": sym,
                                "expiry": expiry,
                                "short_strike": sp["strike"],
                                "long_strike": lp["strike"],
                                "width": lp["strike"] - sp["strike"],
                                "contracts": int(abs(sp["quantity"])),
                                "net_credit": -nd,
                                "unrealized_pnl": pnl(sp, lp),
                                "market_value": mktv(sp, lp),
                            }
                        )
                        mark(sp, lp)
                        break

        # ── PASS 4: Remaining unmatched ──
        naked = []
        for o in options:
            if id(o) not in M:
                naked.append(
                    {
                        "symbol": o["symbol"],
                        "sec_type": o["sec_type"],
                        "strike": o["strike"],
                        "right": o["right"],
                        "expiry": o.get("expiry", ""),
                        "quantity": o["quantity"],
                        "avg_cost": o["avg_cost"],
                        "unrealized_pnl": o.get("unrealized_pnl", 0),
                        "market_value": o.get("market_value", 0),
                    }
                )

        result = {
            "positions": positions,
            "spreads": spreads,
            "naked": naked,
            "stocks": stocks,
        }
        print(json.dumps(result))

    asyncio.run(fetch())


if __name__ == "__main__":
    main()
