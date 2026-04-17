"""Standalone script to fetch IBKR news for a symbol.

Called via subprocess from json_routes.py — connects directly to
IBKR Gateway with readonly=True to avoid write-access warnings.
"""

import argparse
import asyncio
import json
import re
from datetime import datetime, timedelta


def main():
    parser = argparse.ArgumentParser(description="Fetch IBKR news")
    parser.add_argument("--symbol", required=True, help="Stock ticker symbol")
    parser.add_argument("--host", default="127.0.0.1", help="Gateway host")
    parser.add_argument("--port", type=int, default=7497, help="TWS port")
    parser.add_argument("--days", type=int, default=5, help="Days to look back")
    parser.add_argument("--count", type=int, default=5, help="Max headlines")
    args = parser.parse_args()

    def clean(h):
        return re.sub(r"\{[^}]*\}", "", h).strip()

    async def fetch():
        from ib_insync import IB, Stock

        ib = IB()
        await ib.connectAsync(
            args.host, args.port, clientId=97, timeout=10, readonly=True
        )

        symbol = args.symbol.upper()
        stock = Stock(symbol, "SMART", "USD")
        qualified = await ib.qualifyContractsAsync(stock)

        if not qualified or not stock.conId:
            ib.disconnect()
            print(json.dumps([]))
            return

        end_date = datetime.now()
        start_date = end_date - timedelta(days=args.days)

        try:
            headlines = await asyncio.wait_for(
                ib.reqHistoricalNewsAsync(
                    stock.conId,
                    providerCodes="DJ-N+DJ-RTA+DJ-RTE+BRFG+BRFUPDN",
                    startDateTime=start_date,
                    endDateTime=end_date,
                    totalResults=args.count,
                ),
                timeout=15,
            )
        except asyncio.TimeoutError:
            headlines = []

        result = []
        if headlines:
            for h in headlines:
                result.append({
                    "title": clean(h.headline),
                    "publisher": h.providerCode or "IBKR",
                    "link": None,
                    "timestamp": 0,
                    "date": h.time.isoformat() if h.time else "",
                })

        ib.disconnect()
        print(json.dumps(result))

    asyncio.run(fetch())


if __name__ == "__main__":
    main()
