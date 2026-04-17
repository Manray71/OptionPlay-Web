[![CI](https://github.com/Manray71/OptionPlay-Web/actions/workflows/ci.yml/badge.svg)](https://github.com/Manray71/OptionPlay-Web/actions/workflows/ci.yml)

# OptionPlay Web

Web interface for the [OptionPlay](https://github.com/Manray71/OptionPlay) v5.0.0 options trading analysis system. Provides a real-time dashboard, multi-strategy scanner, symbol analysis, portfolio management, and shadow trade tracking through a modern React frontend backed by a FastAPI server.

## Features

- **Market Overview** - VIX gauge, market indices, sector momentum (RRG quadrants), upcoming events & earnings, news with sentiment analysis
- **Scanner** - Multi-strategy options scanner (Pullback, Support Bounce) with VIX Regime v2 filtering, sorting, and PDF export
- **Analysis** - Deep symbol analysis with IV percentile, strategy scores, momentum indicators, support/resistance levels, trade recommendations, analyst data, and news
- **Portfolio** - Position tracking, P&L monitoring, and position detail view with exit levels
- **Shadow Tracker** - Shadow trade review and performance statistics with filtering by strategy, regime, score bucket
- **Admin** - Live configuration editing for trading rules, scoring weights, system settings, and watchlists
- **PDF Export** - One-page A4 reports for Dashboard, Scanner results, and Analysis

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Lucide Icons, jsPDF |
| Backend | Python, FastAPI, Uvicorn |
| Data | Interactive Brokers TWS (primary) |
| Core | [OptionPlay](https://github.com/Manray71/OptionPlay) v5.0.0 engine |

## Project Structure

```
OptionPlay-Web/
├── frontend/
│   └── src/
│       ├── components/     # Dashboard, Scanner, Analysis, Portfolio, ShadowTracker, Admin
│       ├── contexts/       # MarketDataContext
│       ├── utils/          # PDF export (Scanner, Analysis, Dashboard)
│       ├── api.js          # API client
│       └── App.jsx         # Main app with routing and state
├── backend/
│   ├── api/
│   │   ├── json_routes.py  # Main JSON API endpoints (~1,600 LOC)
│   │   ├── routes.py       # OptionPlay server integration (composition handlers)
│   │   ├── admin.py        # Config management endpoints
│   │   ├── auth.py         # Symbol validation
│   │   ├── sse_routes.py   # Server-sent events endpoint
│   │   └── news_sentiment.py
│   ├── services/
│   │   ├── ibkr_helpers.py
│   │   ├── market_data_cache.py
│   │   └── polling_loop.py
│   ├── scripts/
│   │   ├── ibkr_news.py
│   │   ├── ibkr_portfolio.py
│   │   └── ibkr_quote.py
│   ├── tests/              # 7 test files, 42 tests
│   └── main.py             # FastAPI app
```

**Codebase size:** Backend 26 modules, ~4,100 LOC | Frontend 16 files, ~5,700 LOC

## Backend Integration

The backend integrates with OptionPlay via `sys.path` at startup (no pip install). The OptionPlay directory must be present at `../OptionPlay` relative to this repo. Config files (`config/*.yaml`) are read directly from the OptionPlay directory; this repo has no own `config/` directory.

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- [OptionPlay](https://github.com/Manray71/OptionPlay) v5.0.0 installed and configured at `../OptionPlay`
- Interactive Brokers TWS running on localhost:7497 (for live data)

### Installation

```bash
# Clone
git clone https://github.com/Manray71/OptionPlay-Web.git
cd OptionPlay-Web

# Frontend
cd frontend
npm install
cd ..

# Backend
pip install -r backend/requirements.txt
```

### Running

```bash
# Backend (port 8000)
python3 -m uvicorn backend.main:app --reload --port 8000

# Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

## Known Limitations

- **News degradation:** `src.data_providers.yahoo_news` has been removed from OptionPlay. News endpoints (`/news/{symbol}`, `/market-news`, `/analyze/{symbol}` fallback) degrade silently to empty responses when IBKR is not available. No crash at startup (imports are inside try/except blocks).
- **Dead sector fallback:** The `/sectors` endpoint contains a fallback import of `SectorCycleService` (v1, deleted). The fallback is never reached because `SectorRSService` (v2) loads first, but the dead code remains.
- **Path binding:** The backend is bound to the OptionPlay source tree via `sys.path`. There is no version pinning; any change in OptionPlay takes effect immediately.

## Related

- [OptionPlay](https://github.com/Manray71/OptionPlay) - Core trading engine with scanner, analyzers, and risk management (v5.0.0)

## License

[MIT](LICENSE)
