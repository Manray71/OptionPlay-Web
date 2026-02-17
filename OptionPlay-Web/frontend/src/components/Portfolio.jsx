import { Briefcase, DollarSign, Clock, ChevronDown } from 'lucide-react';
import { useState } from 'react';

// ──────────────────────────────────────────────────────────
// Position types:
//   bull-put-spread  — short put + long put (credit)
//   naked-put        — short put only (credit)
//   long-call        — long call only (debit)
//   bull-call-spread — long call + short call (debit)
// ──────────────────────────────────────────────────────────

const MOCK_POSITIONS = [
    // ── Bull Put Spreads ──
    { id: 'P001', symbol: 'NVDA', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 115, longStrike: 110, expiration: '2026-04-17', dte: 59, qty: 2, credit: 1.45, currentValue: 0.84, status: 'open' },
    { id: 'P002', symbol: 'AMD', type: 'bull-put-spread', strategy: 'Bounce', shortStrike: 100, longStrike: 95, expiration: '2026-03-21', dte: 32, qty: 3, credit: 1.20, currentValue: 0.87, status: 'open' },
    { id: 'P003', symbol: 'CRM', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 280, longStrike: 275, expiration: '2026-04-17', dte: 59, qty: 1, credit: 1.10, currentValue: 1.42, status: 'open' },

    // ── Naked Short Puts ──
    { id: 'P004', symbol: 'AAPL', type: 'naked-put', strategy: 'Pullback', shortStrike: 215, longStrike: null, expiration: '2026-03-21', dte: 32, qty: 1, credit: 2.85, currentValue: 1.30, status: 'open' },
    { id: 'P005', symbol: 'GOOGL', type: 'naked-put', strategy: 'Trend', shortStrike: 170, longStrike: null, expiration: '2026-04-17', dte: 59, qty: 2, credit: 3.40, currentValue: 2.10, status: 'open' },

    // ── Long Calls ──
    { id: 'P006', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 340, shortStrike: null, expiration: '2026-06-19', dte: 122, qty: 5, debit: 18.50, currentValue: 24.30, status: 'open' },
    { id: 'P007', symbol: 'AMZN', type: 'long-call', strategy: 'Pullback', longStrike: 220, shortStrike: null, expiration: '2026-05-15', dte: 87, qty: 3, debit: 12.80, currentValue: 10.45, status: 'open' },

    // ── Bull Call Spreads ──
    { id: 'P008', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 620, shortStrike: 650, expiration: '2026-04-17', dte: 59, qty: 2, debit: 8.20, currentValue: 12.50, status: 'open' },
    { id: 'P009', symbol: 'SPY', type: 'bull-call-spread', strategy: 'Pullback', longStrike: 595, shortStrike: 610, expiration: '2026-03-21', dte: 32, qty: 4, debit: 5.60, currentValue: 7.85, status: 'open' },

    // ── Closed Trades ──
    { id: 'C001', symbol: 'AAPL', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 180, longStrike: 175, expiration: '2026-02-21', dte: 0, qty: 2, credit: 1.30, currentValue: 0.00, closedAt: 0.00, status: 'expired' },
    { id: 'C002', symbol: 'MSFT', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 400, longStrike: 395, expiration: '2026-02-07', dte: 0, qty: 1, credit: 1.15, currentValue: 0.00, closedAt: 0.55, status: 'closed' },
    { id: 'C003', symbol: 'NVDA', type: 'naked-put', strategy: 'Pullback', shortStrike: 120, longStrike: null, expiration: '2026-01-17', dte: 0, qty: 1, credit: 3.90, currentValue: 0.00, closedAt: 0.80, status: 'closed' },
    { id: 'C004', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 280, shortStrike: null, expiration: '2026-01-17', dte: 0, qty: 3, debit: 14.20, currentValue: 0.00, closedAt: 22.60, status: 'closed' },
    { id: 'C005', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 580, shortStrike: 610, expiration: '2026-02-07', dte: 0, qty: 2, debit: 7.50, currentValue: 0.00, closedAt: 19.40, status: 'closed' },
];

const STRATEGIES_MAP = { Pullback: 'pullback', Bounce: 'bounce', Breakout: 'breakout', Trend: 'trend', 'Earnings Dip': 'dip' };

const TYPE_LABELS = {
    'bull-put-spread': 'Bull Put Spread',
    'naked-put': 'Naked Put',
    'long-call': 'Long Call',
    'bull-call-spread': 'Bull Call Spread',
};

// ── P&L helpers ──

function isCredit(p) {
    return p.type === 'bull-put-spread' || p.type === 'naked-put';
}

function positionPnlPerContract(p) {
    if (isCredit(p)) {
        return (p.credit - (p.closedAt ?? p.currentValue)) * 100;
    }
    return ((p.closedAt ?? p.currentValue) - p.debit) * 100;
}

function positionPnlTotal(p) {
    return positionPnlPerContract(p) * p.qty;
}

function positionPnlPct(p) {
    if (isCredit(p)) {
        const maxProfit = p.credit * 100;
        return (positionPnlPerContract(p) / maxProfit) * 100;
    }
    return (positionPnlPerContract(p) / (p.debit * 100)) * 100;
}

function formatStrikes(p) {
    if (p.type === 'bull-put-spread') return `${p.shortStrike}/${p.longStrike}p`;
    if (p.type === 'naked-put') return `${p.shortStrike}p`;
    if (p.type === 'long-call') return `${p.longStrike}c`;
    if (p.type === 'bull-call-spread') return `${p.longStrike}/${p.shortStrike}c`;
    return '—';
}

function maxRisk(p) {
    if (p.type === 'bull-put-spread') return ((p.shortStrike - p.longStrike) * 100 - p.credit * 100) * p.qty;
    if (p.type === 'naked-put') return (p.shortStrike * 100 - p.credit * 100) * p.qty;
    if (p.type === 'long-call') return p.debit * 100 * p.qty;
    if (p.type === 'bull-call-spread') return p.debit * 100 * p.qty;
    return 0;
}

// ──────────────────────────────────────────────────────────
// Collapsible header (shared pattern)
// ──────────────────────────────────────────────────────────

function CollapsibleHeader({ icon, title, right, collapsed, onToggle }) {
    return (
        <button className="card-header-toggle" onClick={onToggle} type="button">
            <div className="header-left">
                <h3>{icon} {title}</h3>
            </div>
            <div className="header-right">
                {right}
                <ChevronDown size={16} className={`chevron${collapsed ? ' collapsed' : ''}`} />
            </div>
        </button>
    );
}

// ──────────────────────────────────────────────────────────
// Status badge logic
// ──────────────────────────────────────────────────────────

function StatusBadge({ position }) {
    const pct = positionPnlPct(position);
    const p = position;

    if (isCredit(p)) {
        if (pct >= 50) return <span className="badge badge-green">Take Profit</span>;
        if (pct < -50) return <span className="badge badge-red">Defend</span>;
        if (p.dte <= 7) return <span className="badge badge-amber">Expiring</span>;
        return <span className="badge badge-indigo">Holding</span>;
    }
    // Debit positions
    if (pct >= 50) return <span className="badge badge-green">Take Profit</span>;
    if (pct <= -30) return <span className="badge badge-red">Watch</span>;
    if (p.dte <= 14) return <span className="badge badge-amber">Time Decay</span>;
    return <span className="badge badge-indigo">Holding</span>;
}

function ClosedOutcomeBadge({ position }) {
    const pnl = positionPnlPerContract(position);
    if (position.status === 'expired') return <span className="badge badge-green">Expired Worthless</span>;
    if (pnl > 0) return <span className="badge badge-green">Profit</span>;
    return <span className="badge badge-red">Loss</span>;
}

// ──────────────────────────────────────────────────────────
// Type badge with color
// ──────────────────────────────────────────────────────────

const TYPE_COLORS = {
    'bull-put-spread': 'badge-indigo',
    'naked-put': 'badge-amber',
    'long-call': 'badge-green',
    'bull-call-spread': 'badge-green',
};

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Portfolio() {
    const [collapsed, setCollapsed] = useState({});
    const [typeFilter, setTypeFilter] = useState('all');

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    const allOpen = MOCK_POSITIONS.filter((p) => p.status === 'open');
    const allClosed = MOCK_POSITIONS.filter((p) => p.status !== 'open');

    const open = typeFilter === 'all' ? allOpen : allOpen.filter(p => p.type === typeFilter);
    const closed = typeFilter === 'all' ? allClosed : allClosed.filter(p => p.type === typeFilter);

    const totalPnl = allOpen.reduce((sum, p) => sum + positionPnlTotal(p), 0);
    const totalCredit = allOpen.filter(p => isCredit(p)).reduce((sum, p) => sum + p.credit * 100 * p.qty, 0);
    const totalDebit = allOpen.filter(p => !isCredit(p)).reduce((sum, p) => sum + p.debit * 100 * p.qty, 0);
    const totalRisk = allOpen.reduce((sum, p) => sum + maxRisk(p), 0);

    const positionTypes = ['all', 'bull-put-spread', 'naked-put', 'long-call', 'bull-call-spread'];
    const typeLabels = { all: 'All', ...TYPE_LABELS };

    return (
        <>
            <div className="page-header">
                <h2>Portfolio</h2>
                <p>Track open positions and trading performance across all strategy types</p>
            </div>

            <div className="page-content">
                {/* Summary Cards */}
                <div className="grid-4 fade-in" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                        <div className="stat-label">Open Positions</div>
                        <div className="stat-value indigo">{allOpen.length}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            {allOpen.filter(p => isCredit(p)).length} credit · {allOpen.filter(p => !isCredit(p)).length} debit
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Capital Deployed</div>
                        <div className="stat-value green">${(totalCredit + totalDebit).toLocaleString()}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            ${totalCredit.toFixed(0)} credit · ${totalDebit.toFixed(0)} debit
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Unrealized P&L</div>
                        <div className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`}>
                            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            across {allOpen.length} positions
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Max Risk</div>
                        <div className="stat-value red">${totalRisk.toLocaleString()}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            {allClosed.length} closed trades
                        </div>
                    </div>
                </div>

                {/* Type Filter */}
                <div className="tabs fade-in" style={{ marginBottom: 20 }}>
                    {positionTypes.map(t => (
                        <button
                            key={t}
                            className={`tab${typeFilter === t ? ' active' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {typeLabels[t]}
                            {t !== 'all' && (
                                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                                    {allOpen.filter(p => p.type === t).length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Open Positions */}
                <div className="card fade-in" style={{ animationDelay: '0.1s', marginBottom: 20 }}>
                    <CollapsibleHeader
                        icon={<Briefcase size={14} style={{ verticalAlign: 'middle' }} />}
                        title="Open Positions"
                        right={<span className="badge badge-indigo">{open.length} active</span>}
                        collapsed={collapsed.open}
                        onToggle={() => toggleSection('open')}
                    />
                    <div className={`card-body-collapsible${collapsed.open ? ' collapsed' : ''}`}>
                        <div style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th>Type</th>
                                        <th>Strategy</th>
                                        <th>Strikes</th>
                                        <th>Qty</th>
                                        <th>Expiration</th>
                                        <th>DTE</th>
                                        <th>Cr/Dr</th>
                                        <th>Current</th>
                                        <th>P&L ($)</th>
                                        <th>P&L (%)</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {open.map((p) => {
                                        const pnl = positionPnlTotal(p);
                                        const pnlPct = positionPnlPct(p);
                                        return (
                                            <tr key={p.id}>
                                                <td className="symbol">{p.symbol}</td>
                                                <td><span className={`badge ${TYPE_COLORS[p.type]}`} style={{ fontSize: 10 }}>{TYPE_LABELS[p.type]}</span></td>
                                                <td><span className={`strategy-chip strategy-${STRATEGIES_MAP[p.strategy]}`}>{p.strategy}</span></td>
                                                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatStrikes(p)}</td>
                                                <td>{p.qty}</td>
                                                <td style={{ fontSize: 12 }}>{p.expiration}</td>
                                                <td>
                                                    <span style={{ color: p.dte <= 14 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                        {p.dte <= 7 && <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                                                        {p.dte}d
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ color: isCredit(p) ? 'var(--green)' : 'var(--text-accent)' }}>
                                                        {isCredit(p) ? `+$${p.credit.toFixed(2)}` : `-$${p.debit.toFixed(2)}`}
                                                    </span>
                                                </td>
                                                <td>${p.currentValue.toFixed(2)}</td>
                                                <td style={{ fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                                                </td>
                                                <td style={{ fontWeight: 600, color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                </td>
                                                <td><StatusBadge position={p} /></td>
                                            </tr>
                                        );
                                    })}
                                    {open.length === 0 && (
                                        <tr><td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No {typeFilter !== 'all' ? TYPE_LABELS[typeFilter] : ''} positions open</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Closed Positions */}
                <div className="card fade-in" style={{ animationDelay: '0.2s' }}>
                    <CollapsibleHeader
                        icon={<DollarSign size={14} style={{ verticalAlign: 'middle' }} />}
                        title="Closed Trades"
                        right={<span className="badge badge-green">{closed.length} completed</span>}
                        collapsed={collapsed.closed}
                        onToggle={() => toggleSection('closed')}
                    />
                    <div className={`card-body-collapsible${collapsed.closed ? ' collapsed' : ''}`}>
                        <div style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th>Type</th>
                                        <th>Strategy</th>
                                        <th>Strikes</th>
                                        <th>Qty</th>
                                        <th>Entry</th>
                                        <th>Exit</th>
                                        <th>P&L ($)</th>
                                        <th>Return</th>
                                        <th>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {closed.map((p) => {
                                        const pnl = positionPnlTotal(p);
                                        const pnlPct = positionPnlPct(p);
                                        return (
                                            <tr key={p.id}>
                                                <td className="symbol">{p.symbol}</td>
                                                <td><span className={`badge ${TYPE_COLORS[p.type]}`} style={{ fontSize: 10 }}>{TYPE_LABELS[p.type]}</span></td>
                                                <td><span className={`strategy-chip strategy-${STRATEGIES_MAP[p.strategy]}`}>{p.strategy}</span></td>
                                                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatStrikes(p)}</td>
                                                <td>{p.qty}</td>
                                                <td>
                                                    <span style={{ color: isCredit(p) ? 'var(--green)' : 'var(--text-accent)' }}>
                                                        {isCredit(p) ? `+$${p.credit.toFixed(2)}` : `-$${p.debit.toFixed(2)}`}
                                                    </span>
                                                </td>
                                                <td>${(p.closedAt ?? 0).toFixed(2)}</td>
                                                <td style={{ fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                                                </td>
                                                <td style={{ fontWeight: 600, color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                </td>
                                                <td><ClosedOutcomeBadge position={p} /></td>
                                            </tr>
                                        );
                                    })}
                                    {closed.length === 0 && (
                                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No closed trades</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
