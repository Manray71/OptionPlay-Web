"""Standalone script to fetch IBKR news for a symbol.

Called via subprocess from json_routes.py — all user inputs passed as CLI args
to avoid f-string code injection.
"""

import argparse
import asyncio
import json
import re
import sys


def main():
    parser = argparse.ArgumentParser(description="Fetch IBKR news")
    parser.add_argument("--symbol", required=True, help="Stock ticker symbol")
    parser.add_argument("--days", type=int, default=5, help="Days to look back")
    parser.add_argument("--count", type=int, default=5, help="Max headlines")
    parser.add_argument(
        "--optionplay-dir", required=True, help="Path to OptionPlay root"
    )
    args = parser.parse_args()

    sys.path.insert(0, args.optionplay_dir)

    async def fetch():
        from src.ibkr.bridge import get_ibkr_bridge

        bridge = get_ibkr_bridge()
        news = await bridge.get_news(
            [args.symbol], days=args.days, max_per_symbol=args.count
        )

        def clean(h):
            return re.sub(r"\{[^}]*\}", "", h).strip()

        result = [
            {
                "title": clean(n.headline),
                "publisher": n.provider or "IBKR",
                "link": None,
                "timestamp": 0,
                "date": n.time or "",
            }
            for n in news
        ]
        print(json.dumps(result))

    asyncio.run(fetch())


if __name__ == "__main__":
    main()
