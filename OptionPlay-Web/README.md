[![CI](https://github.com/Manray71/OptionPlay-Web/actions/workflows/ci.yml/badge.svg)](https://github.com/Manray71/OptionPlay-Web/actions/workflows/ci.yml)

# OptionPlay Web

Web interface for the [OptionPlay](https://github.com/Manray71/OptionPlay) options trading analysis system. Provides a real-time dashboard, multi-strategy scanner, symbol analysis, and portfolio management through a modern React frontend backed by a FastAPI server.

## Features

- **Market Overview** &mdash; VIX gauge, market indices, sector momentum, upcoming events & earnings, news with sentiment analysis
- **Scanner** &mdash; Multi-strategy options scanner (Pullback, Support Bounce, ATH Breakout, Earnings Dip, Trend Continuation) with filtering, sorting, and PDF export
- **Analysis** &mdash; Deep symbol analysis with IV percentile, strategy scores, momentum indicators, support/resistance levels, trade recommendations, analyst data, and news
- **Portfolio** &mdash; Position tracking and P&L monitoring
- **Admin** &mdash; Live configuration editing for analyzer thresholds, scanner settings, and scoring weights
- **PDF Export** &mdash; One-page A4 reports for Dashboard, Scanner results, and Analysis

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Lucide Icons, jsPDF |
| Backend | Python, FastAPI, Uvicorn |
| Data | Interactive Brokers (ib_insync), yfinance |
| Core | [OptionPlay](https://github.com/Manray71/OptionPlay) engine |

## Project Structure

```
OptionPlay-Web/
├── frontend/
│   └── src/
│       ├── components/     # Dashboard, Scanner, Analysis, Portfolio, Admin
│       ├── utils/          # PDF export (Scanner, Analysis, Dashboard)
│       ├── api.js          # API client
│       └── App.jsx         # Main app with routing and state
├── backend/
│   ├── api/
│   │   ├── json_routes.py  # JSON API endpoints
│   │   ├── routes.py       # OptionPlay server integration
│   │   ├── admin.py        # Config management endpoints
│   │   └── news_sentiment.py
│   └── main.py             # FastAPI app
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- [OptionPlay](https://github.com/Manray71/OptionPlay) installed and configured
- Interactive Brokers TWS or Gateway (for live data)

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

## Related

- [OptionPlay](https://github.com/Manray71/OptionPlay) &mdash; Core trading engine with scanner, analyzer, backtesting, and risk management

## License

[MIT](LICENSE)
