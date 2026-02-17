import { Briefcase, TrendingUp, TrendingDown, DollarSign, Clock } from 'lucide-react';

const MOCK_POSITIONS = [
    { id: 'P001', symbol: 'NVDA', strategy: 'Pullback', shortStrike: 175, longStrike: 170, expiration: '2026-04-17', dte: 59, credit: 1.45, currentValue: 0.84, pnl: 61, pnlPct: 42.1, status: 'open' },
    { id: 'P002', symbol: 'AMD', strategy: 'Bounce', shortStrike: 155, longStrike: 150, expiration: '2026-03-21', dte: 32, credit: 1.20, currentValue: 0.87, pnl: 33, pnlPct: 27.5, status: 'open' },
    { id: 'P003', symbol: 'CRM', strategy: 'Trend', shortStrike: 280, longStrike: 275, expiration: '2026-04-17', dte: 59, credit: 1.10, currentValue: 1.19, pnl: -9, pnlPct: -8.2, status: 'open' },
    { id: 'P004', symbol: 'AAPL', strategy: 'Pullback', shortStrike: 180, longStrike: 175, expiration: '2026-02-21', dte: 0, credit: 1.30, currentValue: 0.00, pnl: 130, pnlPct: 100.0, status: 'expired' },
    { id: 'P005', symbol: 'MSFT', strategy: 'Trend', shortStrike: 400, longStrike: 395, expiration: '2026-02-07', dte: 0, credit: 1.15, currentValue: 0.55, pnl: 60, pnlPct: 52.2, status: 'closed' },
];

const STRATEGIES_MAP = { Pullback: 'pullback', Bounce: 'bounce', Breakout: 'breakout', Trend: 'trend', 'Earnings Dip': 'dip' };

export default function Portfolio() {
    const open = MOCK_POSITIONS.filter((p) => p.status === 'open');
    const closed = MOCK_POSITIONS.filter((p) => p.status !== 'open');
    const totalPnl = open.reduce((sum, p) => sum + p.pnl, 0);
    const totalCredit = open.reduce((sum, p) => sum + p.credit * 100, 0);

    return (
        <>
            <div className="page-header">
                <h2>Portfolio</h2>
                <p>Track open positions and trading performance</p>
            </div>

            <div className="page-content">
                {/* Summary Cards */}
                <div className="grid-4 fade-in" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                        <div className="stat-label">Open Positions</div>
                        <div className="stat-value indigo">{open.length}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Total Credit</div>
                        <div className="stat-value green">${totalCredit.toFixed(0)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Unrealized P&L</div>
                        <div className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`}>${totalPnl >= 0 ? '+' : ''}{totalPnl}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Closed Trades</div>
                        <div className="stat-value indigo">{closed.length}</div>
                    </div>
                </div>

                {/* Open Positions */}
                <div className="card fade-in" style={{ animationDelay: '0.1s', marginBottom: 20 }}>
                    <div className="card-header">
                        <h3><Briefcase size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Open Positions</h3>
                        <span className="badge badge-indigo">{open.length} active</span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Strategy</th>
                                    <th>Strikes</th>
                                    <th>Expiration</th>
                                    <th>DTE</th>
                                    <th>Credit</th>
                                    <th>Current</th>
                                    <th>P&L ($)</th>
                                    <th>P&L (%)</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {open.map((p) => (
                                    <tr key={p.id}>
                                        <td className="symbol">{p.symbol}</td>
                                        <td><span className={`strategy-chip strategy-${STRATEGIES_MAP[p.strategy]}`}>{p.strategy}</span></td>
                                        <td>{p.shortStrike}/{p.longStrike}</td>
                                        <td style={{ fontSize: 12 }}>{p.expiration}</td>
                                        <td>
                                            <span style={{ color: p.dte <= 14 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                {p.dte <= 7 && <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                                                {p.dte}d
                                            </span>
                                        </td>
                                        <td>${p.credit.toFixed(2)}</td>
                                        <td>${p.currentValue.toFixed(2)}</td>
                                        <td style={{ fontWeight: 600, color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                            {p.pnl >= 0 ? '+' : ''}${p.pnl}
                                        </td>
                                        <td style={{ fontWeight: 600, color: p.pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                            {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(1)}%
                                        </td>
                                        <td>
                                            {p.pnlPct >= 50 ? (
                                                <span className="badge badge-green">Take Profit</span>
                                            ) : p.pnlPct < -20 ? (
                                                <span className="badge badge-red">Watch</span>
                                            ) : (
                                                <span className="badge badge-indigo">Holding</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Closed Positions */}
                <div className="card fade-in" style={{ animationDelay: '0.2s' }}>
                    <div className="card-header">
                        <h3><DollarSign size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Closed Trades</h3>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Strategy</th>
                                    <th>Strikes</th>
                                    <th>Credit</th>
                                    <th>P&L</th>
                                    <th>Return</th>
                                    <th>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {closed.map((p) => (
                                    <tr key={p.id}>
                                        <td className="symbol">{p.symbol}</td>
                                        <td><span className={`strategy-chip strategy-${STRATEGIES_MAP[p.strategy]}`}>{p.strategy}</span></td>
                                        <td>{p.shortStrike}/{p.longStrike}</td>
                                        <td>${p.credit.toFixed(2)}</td>
                                        <td style={{ fontWeight: 600, color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                            {p.pnl >= 0 ? '+' : ''}${p.pnl}
                                        </td>
                                        <td style={{ fontWeight: 600, color: 'var(--green)' }}>+{p.pnlPct.toFixed(1)}%</td>
                                        <td><span className="badge badge-green">{p.status === 'expired' ? 'Expired Worthless' : 'Closed at Profit'}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}
