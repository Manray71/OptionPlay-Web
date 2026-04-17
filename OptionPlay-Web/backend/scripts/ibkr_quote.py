"""Standalone script to fetch IBKR quotes via Gateway.

Called via subprocess from json_routes.py — fetches quotes
for one or more symbols without triggering write-access warnings.
Requests delayed data if live market data subscription is unavailable.
"""

import argparse
import asyncio
import json


def main():
    parser = argparse.ArgumentParser(description="Fetch IBKR quotes")
    parser.add_argument("--host", default="127.0.0.1", help="Gateway host")
    parser.add_argument("--port", type=int, default=7497, help="TWS port")
    parser.add_argument("--symbols", required=True, help="Comma-separated symbols")
    args = parser.parse_args()

    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        print(json.dumps({"quotes": {}}))
        return

    async def fetch():
        from ib_insync import IB, Stock, Index

        ib = IB()
        await ib.connectAsync(args.host, args.port, clientId=98, timeout=10, readonly=True)

        # Switch to delayed (frozen) data — avoids "subscription required" errors
        ib.reqMarketDataType(3)  # 3 = delayed, 4 = delayed-frozen

        results = {}

        # Build contracts — ^VIX is an Index, everything else is Stock
        contracts = []
        sym_map = []
        for sym in symbols:
            if sym == "VIX" or sym == "^VIX":
                c = Index("VIX", "CBOE")
                sym_map.append(("VIX", c))
            else:
                c = Stock(sym, "SMART", "USD")
                sym_map.append((sym, c))
            contracts.append(c)

        # Qualify contracts
        await ib.qualifyContractsAsync(*contracts)

        # Request market data (streaming, not snapshot — delayed snapshots often empty)
        tickers = []
        for sym, contract in sym_map:
            if contract.conId:  # qualified successfully
                ticker = ib.reqMktData(contract)
                tickers.append((sym, ticker))

        # Wait for data to arrive (up to 8 seconds)
        for _ in range(80):
            await asyncio.sleep(0.1)
            if all(
                (t.last and t.last > 0)
                or (t.close and t.close > 0)
                or (t.marketPrice() and t.marketPrice() > 0
                    and t.marketPrice() != float('inf'))
                for _, t in tickers
            ):
                break

        for sym, ticker in tickers:
            price = None
            prev_close = None

            # Try multiple price sources
            mp = ticker.marketPrice()
            if mp and mp > 0 and mp != float('inf'):
                price = mp
            elif ticker.last and ticker.last > 0:
                price = ticker.last
            elif ticker.close and ticker.close > 0:
                price = ticker.close

            if ticker.close and ticker.close > 0:
                prev_close = ticker.close

            if price is not None:
                results[sym] = {
                    "price": round(price, 4),
                    "prev_close": round(prev_close, 4) if prev_close else None,
                    "bid": round(ticker.bid, 4) if ticker.bid and ticker.bid > 0 else None,
                    "ask": round(ticker.ask, 4) if ticker.ask and ticker.ask > 0 else None,
                }

        # Cancel market data
        for _, ticker in tickers:
            ib.cancelMktData(ticker.contract)

        ib.disconnect()
        print(json.dumps({"quotes": results}))

    asyncio.run(fetch())


if __name__ == "__main__":
    main()
