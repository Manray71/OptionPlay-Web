import { Briefcase, DollarSign, Clock, ChevronDown, Info } from 'lucide-react';
import { useState, useEffect } from 'react';
import { fetchPortfolioPositions } from '../api';

// ──────────────────────────────────────────────────────────
// Position types:
//   bull-put-spread  — short put + long put (credit)
//   short-put        — short put only (credit)
//   long-call        — long call only (debit)
//   bull-call-spread — long call + short call (debit)
// ──────────────────────────────────────────────────────────

const MOCK_POSITIONS = [
    // ── Bull Put Spreads ──
    { id: 'P001', symbol: 'NVDA', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 115, longStrike: 110, expiration: '2026-04-17', dte: 59, qty: 2, credit: 1.45, currentValue: 0.84, status: 'open' },
    { id: 'P002', symbol: 'AMD', type: 'bull-put-spread', strategy: 'Bounce', shortStrike: 100, longStrike: 95, expiration: '2026-03-21', dte: 32, qty: 3, credit: 1.20, currentValue: 0.87, status: 'open' },
    { id: 'P003', symbol: 'CRM', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 280, longStrike: 275, expiration: '2026-04-17', dte: 59, qty: 1, credit: 1.10, currentValue: 1.42, status: 'open' },

    // ── Naked Short Puts ──
    { id: 'P004', symbol: 'AAPL', type: 'short-put', strategy: 'Pullback', shortStrike: 215, longStrike: null, expiration: '2026-03-21', dte: 32, qty: 1, credit: 2.85, currentValue: 1.30, status: 'open' },
    { id: 'P005', symbol: 'GOOGL', type: 'short-put', strategy: 'Trend', shortStrike: 170, longStrike: null, expiration: '2026-04-17', dte: 59, qty: 2, credit: 3.40, currentValue: 2.10, status: 'open' },

    // ── Long Calls ──
    { id: 'P006', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 340, shortStrike: null, expiration: '2026-06-19', dte: 122, qty: 5, debit: 18.50, currentValue: 24.30, status: 'open' },
    { id: 'P007', symbol: 'AMZN', type: 'long-call', strategy: 'Pullback', longStrike: 220, shortStrike: null, expiration: '2026-05-15', dte: 87, qty: 3, debit: 12.80, currentValue: 10.45, status: 'open' },

    // ── Bull Call Spreads ──
    { id: 'P008', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 620, shortStrike: 650, expiration: '2026-04-17', dte: 59, qty: 2, debit: 8.20, currentValue: 12.50, status: 'open' },
    { id: 'P009', symbol: 'SPY', type: 'bull-call-spread', strategy: 'Pullback', longStrike: 595, shortStrike: 610, expiration: '2026-03-21', dte: 32, qty: 4, debit: 5.60, currentValue: 7.85, status: 'open' },

    // ── Closed Trades ──
    { id: 'C001', symbol: 'AAPL', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 180, longStrike: 175, expiration: '2026-02-21', dte: 0, qty: 2, credit: 1.30, currentValue: 0.00, closedAt: 0.00, status: 'expired' },
    { id: 'C002', symbol: 'MSFT', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 400, longStrike: 395, expiration: '2026-02-07', dte: 0, qty: 1, credit: 1.15, currentValue: 0.00, closedAt: 0.55, status: 'closed' },
    { id: 'C003', symbol: 'NVDA', type: 'short-put', strategy: 'Pullback', shortStrike: 120, longStrike: null, expiration: '2026-01-17', dte: 0, qty: 1, credit: 3.90, currentValue: 0.00, closedAt: 0.80, status: 'closed' },
    { id: 'C004', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 280, shortStrike: null, expiration: '2026-01-17', dte: 0, qty: 3, debit: 14.20, currentValue: 0.00, closedAt: 22.60, status: 'closed' },
    { id: 'C005', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 580, shortStrike: 610, expiration: '2026-02-07', dte: 0, qty: 2, debit: 7.50, currentValue: 0.00, closedAt: 19.40, status: 'closed' },
];

const STRATEGIES_MAP = { Pullback: 'pullback', Bounce: 'bounce', Breakout: 'breakout', Trend: 'trend', 'Earnings Dip': 'dip' };

// ── Map API portfolio position to component format ──

function apiPositionToPortfolio(p) {
    // IBKR live positions (source: "ibkr") have flat fields
    if (p.source === 'ibkr') {
        const statusVal = p.status === 'open' ? 'open' : p.status === 'expired' ? 'expired' : 'closed';
        const type = p.strategy?.toLowerCase()?.replace(/\s+/g, '-') || 'other';
        return {
            id: p.id,
            symbol: p.symbol,
            type,
            strategy: '—',
            shortStrike: p.short_strike ?? null,
            longStrike: p.long_strike ?? null,
            expiration: p.expiration ?? '',
            dte: p.dte ?? 0,
            qty: p.contracts ?? Math.abs(p.quantity ?? 1),
            credit: p.net_credit ?? 0,
            debit: p.debit ?? null,
            currentValue: null,
            closedAt: null,
            status: statusVal,
            maxProfit: p.max_profit,
            maxLoss: p.max_loss,
            unrealizedPnl: p.unrealized_pnl ?? null,
            underlyingPrice: p.underlying_price ?? null,
            breakeven: p.breakeven ?? null,
            distancePct: p.distance_pct ?? null,
            pnlPctOfMax: p.pnl_pct_of_max ?? null,
        };
    }

    // Local PortfolioManager positions (short_leg / long_leg format)
    const shortStrike = p.short_leg?.strike ?? null;
    const longStrike = p.long_leg?.strike ?? null;
    const expiration = p.short_leg?.expiration ?? p.long_leg?.expiration ?? '';
    const now = new Date();
    const exp = new Date(expiration);
    const dte = Math.max(0, Math.round((exp - now) / (1000 * 60 * 60 * 24)));
    const shortPremium = Math.abs(p.short_leg?.premium ?? 0);
    const longPremium = Math.abs(p.long_leg?.premium ?? 0);
    const credit = shortPremium - longPremium;
    const statusVal = p.status === 'open' ? 'open' : p.status === 'expired' ? 'expired' : 'closed';
    return {
        id: p.id,
        symbol: p.symbol,
        type: 'bull-put-spread',
        strategy: 'Pullback',
        shortStrike,
        longStrike,
        expiration,
        dte,
        qty: p.contracts ?? 1,
        credit: Math.max(credit, 0),
        currentValue: statusVal === 'open' ? Math.max(credit * 0.6, 0) : 0,
        closedAt: p.close_premium ?? 0,
        status: statusVal,
    };
}

const TYPE_LABELS = {
    'bull-put-spread': 'Bull Put',
    'bear-call-spread': 'Bear Call',
    'bull-call-spread': 'Bull Call',
    'bear-put-spread': 'Bear Put',
    'iron-condor': 'Iron Condor',
    'iron-butterfly': 'Iron Butterfly',
    'call-butterfly': 'Call Butterfly',
    'put-butterfly': 'Put Butterfly',
    'long-straddle': 'Long Straddle',
    'short-straddle': 'Short Straddle',
    'long-strangle': 'Long Strangle',
    'short-strangle': 'Short Strangle',
    'short-put': 'Short Put',
    'short-call': 'Short Call',
    'long-call': 'Long Call',
    'long-put': 'Long Put',
    'stock': 'Stock',
};

// ── P&L helpers ──

const CREDIT_TYPES = new Set([
    'bull-put-spread', 'bear-call-spread', 'iron-condor', 'iron-butterfly',
    'short-straddle', 'short-strangle', 'short-put', 'short-call',
]);

function isCredit(p) {
    return CREDIT_TYPES.has(p.type);
}

function positionPnlPerContract(p) {
    // IBKR positions: use unrealizedPnl directly (already total, not per-contract)
    if (p.unrealizedPnl != null) return null; // handled by positionPnlTotal
    if (isCredit(p)) {
        return (p.credit - (p.closedAt ?? p.currentValue ?? 0)) * 100;
    }
    return ((p.closedAt ?? p.currentValue ?? 0) - p.debit) * 100;
}

function positionPnlTotal(p) {
    // IBKR positions: unrealizedPnl is already the total P&L
    if (p.unrealizedPnl != null) return p.unrealizedPnl;
    const pnl = positionPnlPerContract(p);
    if (pnl == null) return null;
    return pnl * p.qty;
}

function positionPnlPct(p) {
    // IBKR positions: use pnlPctOfMax directly
    if (p.pnlPctOfMax != null) return p.pnlPctOfMax;
    const pnl = positionPnlPerContract(p);
    if (pnl == null) return null;
    if (isCredit(p)) {
        const maxProfit = p.credit * 100;
        return maxProfit > 0 ? (pnl / maxProfit) * 100 : 0;
    }
    return p.debit > 0 ? (pnl / (p.debit * 100)) * 100 : 0;
}

function formatStrikes(p) {
    if (p.type === 'bull-put-spread') return `${p.shortStrike}/${p.longStrike}p`;
    if (p.type === 'bear-put-spread') return `${p.longStrike}/${p.shortStrike}p`;
    if (p.type === 'bear-call-spread') return `${p.shortStrike}/${p.longStrike}c`;
    if (p.type === 'bull-call-spread') return `${p.longStrike}/${p.shortStrike}c`;
    if (p.type === 'iron-condor' || p.type === 'iron-butterfly') {
        return `${p.longStrike}/${p.shortStrike}p ${p.shortCallStrike ?? p.shortStrike}/${p.longCallStrike ?? p.longStrike}c`;
    }
    if (p.type?.includes('butterfly')) return `${p.longStrike}/${p.shortStrike}/${p.longStrike2 ?? ''}`;
    if (p.type?.includes('straddle')) return `${p.putStrike ?? p.shortStrike ?? p.longStrike}`;
    if (p.type?.includes('strangle')) return `${p.putStrike ?? p.shortStrike ?? ''}/${p.callStrike ?? p.longStrike ?? ''}`;
    if (p.type === 'short-put') return `${p.shortStrike}p`;
    if (p.type === 'short-call') return `${p.shortStrike}c`;
    if (p.type === 'long-call') return `${p.longStrike}c`;
    if (p.type === 'long-put') return `${p.longStrike}p`;
    return '—';
}

function maxRisk(p) {
    if (p.type === 'bull-put-spread') return ((p.shortStrike - p.longStrike) * 100 - p.credit * 100) * p.qty;
    if (p.type === 'short-put') return (p.shortStrike * 100 - p.credit * 100) * p.qty;
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

    // No live P&L — show DTE-based status only
    if (pct == null) {
        if (p.dte <= 7) return <span className="badge badge-amber">Expiring</span>;
        if (p.dte <= 21) return <span className="badge badge-indigo">Monitor</span>;
        return <span className="badge badge-indigo">Holding</span>;
    }

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
    'bear-call-spread': 'badge-red',
    'bull-call-spread': 'badge-green',
    'bear-put-spread': 'badge-red',
    'iron-condor': 'badge-amber',
    'iron-butterfly': 'badge-amber',
    'call-butterfly': 'badge-amber',
    'put-butterfly': 'badge-amber',
    'long-straddle': 'badge-green',
    'short-straddle': 'badge-red',
    'long-strangle': 'badge-green',
    'short-strangle': 'badge-red',
    'short-put': 'badge-amber',
    'short-call': 'badge-red',
    'long-call': 'badge-green',
    'long-put': 'badge-green',
    'stock': 'badge-indigo',
};

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Portfolio() {
    const [collapsed, setCollapsed] = useState({});
    const [typeFilter, setTypeFilter] = useState('all');
    const [allPositions, setAllPositions] = useState(MOCK_POSITIONS);
    const [demoMode, setDemoMode] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            try {
                const data = await fetchPortfolioPositions('all');
                if (cancelled) return;
                if (data.error || !data.positions?.length) throw new Error('No positions');
                setAllPositions(data.positions.map(apiPositionToPortfolio));
                setDemoMode(false);
            } catch {
                if (!cancelled) setDemoMode(true);
            }
        }
        loadData();
        return () => { cancelled = true; };
    }, []);

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    const allOpen = allPositions.filter((p) => p.status === 'open');
    const allClosed = allPositions.filter((p) => p.status !== 'open');

    const open = typeFilter === 'all' ? allOpen : allOpen.filter(p => p.type === typeFilter);
    const closed = typeFilter === 'all' ? allClosed : allClosed.filter(p => p.type === typeFilter);

    const totalCredit = allOpen.filter(p => isCredit(p)).reduce((sum, p) => sum + (p.credit ?? 0) * 100 * p.qty, 0);
    const totalMaxProfit = allOpen.reduce((sum, p) => sum + (p.maxProfit ?? (p.credit ?? 0) * 100 * p.qty), 0);
    const totalMaxLoss = allOpen.reduce((sum, p) => sum + (p.maxLoss ?? maxRisk(p)), 0);
    const totalUnrealizedPnl = allOpen.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
    const hasLivePnl = allOpen.some(p => p.unrealizedPnl != null);

    // Dynamic type list from actual positions
    const activeTypes = [...new Set(allPositions.map(p => p.type))];
    const positionTypes = ['all', ...activeTypes];
    const typeLabels = { all: 'All', ...TYPE_LABELS };

    return (
        <>
            <div className="page-header">
                <h2>Portfolio</h2>
                <p>Track open positions and trading performance across all strategy types</p>
                {demoMode && (
                    <span style={{ fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Info size={12} /> Demo mode — using simulated data
                    </span>
                )}
            </div>

            <div className="page-content">
                {/* Summary Cards */}
                <div className="grid-4 fade-in" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                        <div className="stat-label">Open Positions</div>
                        <div className="stat-value indigo">{allOpen.length}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            {allOpen.filter(p => p.type === 'bull-put-spread').length} bull put spreads
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Unrealized P&L</div>
                        <div className={`stat-value ${totalUnrealizedPnl >= 0 ? 'green' : 'red'}`}>
                            {hasLivePnl ? `${totalUnrealizedPnl >= 0 ? '+' : ''}$${totalUnrealizedPnl.toFixed(0)}` : '—'}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            {hasLivePnl
                                ? `${totalMaxProfit > 0 ? Math.round(totalUnrealizedPnl / totalMaxProfit * 100) : 0}% of max profit`
                                : 'no live data'}
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Max Profit</div>
                        <div className="stat-value green">${totalMaxProfit.toLocaleString()}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            if all expire worthless
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Capital at Risk</div>
                        <div className="stat-value red">${totalMaxLoss.toLocaleString()}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>
                            total credit ${totalCredit.toLocaleString()}
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
                                        <th>Strikes</th>
                                        <th>Qty</th>
                                        <th>Underlying</th>
                                        <th>DTE</th>
                                        <th>Cr/Dr</th>
                                        <th>P&L</th>
                                        <th>% of Max</th>
                                        <th>Breakeven</th>
                                        <th>Distance</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {open.map((p) => {
                                        const pnl = positionPnlTotal(p);
                                        const pctMax = positionPnlPct(p);
                                        return (
                                        <tr key={p.id}>
                                            <td className="symbol">{p.symbol}</td>
                                            <td><span className={`badge ${TYPE_COLORS[p.type] || 'badge-indigo'}`} style={{ fontSize: 10 }}>{TYPE_LABELS[p.type] || p.type}</span></td>
                                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatStrikes(p)}</td>
                                            <td>{p.qty}</td>
                                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                                                {p.underlyingPrice != null ? `$${p.underlyingPrice.toFixed(2)}` : '—'}
                                            </td>
                                            <td>
                                                <span style={{ color: p.dte <= 14 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                    {p.dte <= 7 && <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                                                    {p.dte}d
                                                </span>
                                            </td>
                                            <td>
                                                {p.credit != null && p.credit > 0 ? (
                                                    <span style={{ color: 'var(--green)' }}>+${p.credit.toFixed(2)}</span>
                                                ) : p.debit != null ? (
                                                    <span style={{ color: 'var(--text-accent)' }}>-${p.debit.toFixed(2)}</span>
                                                ) : p.credit != null && p.credit < 0 ? (
                                                    <span style={{ color: 'var(--text-accent)' }}>-${Math.abs(p.credit).toFixed(2)}</span>
                                                ) : <span>—</span>}
                                            </td>
                                            <td style={{ fontWeight: 600, color: pnl != null ? (pnl >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' }}>
                                                {pnl != null ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}` : '—'}
                                            </td>
                                            <td>
                                                {pctMax != null ? (
                                                    <span style={{ fontWeight: 600, color: pctMax >= 50 ? 'var(--green)' : pctMax < 0 ? 'var(--red)' : 'var(--text-secondary)' }}>
                                                        {pctMax.toFixed(0)}%
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
                                                {p.breakeven != null ? `$${p.breakeven.toFixed(2)}` : '—'}
                                            </td>
                                            <td>
                                                {p.distancePct != null ? (
                                                    <span style={{
                                                        fontWeight: 600,
                                                        color: p.distancePct > 5 ? 'var(--green)' : p.distancePct > 2 ? 'var(--amber)' : 'var(--red)',
                                                    }}>
                                                        {p.distancePct > 0 ? '+' : ''}{p.distancePct.toFixed(1)}%
                                                    </span>
                                                ) : '—'}
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
                                                        {isCredit(p) ? `+$${(p.credit ?? 0).toFixed(2)}` : `-$${(p.debit ?? 0).toFixed(2)}`}
                                                    </span>
                                                </td>
                                                <td>${(p.closedAt ?? 0).toFixed(2)}</td>
                                                <td style={{ fontWeight: 600, color: (pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnl != null ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}` : '—'}
                                                </td>
                                                <td style={{ fontWeight: 600, color: (pnlPct ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                    {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : '—'}
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
