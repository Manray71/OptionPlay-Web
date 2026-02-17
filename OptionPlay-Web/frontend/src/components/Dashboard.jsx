import { useState, useEffect } from 'react';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Gauge,
    Zap,
    Shield,
    Target,
    AlertTriangle,
    ExternalLink,
    ChevronDown,
    Clock,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Mock data
// ──────────────────────────────────────────────────────────

const MOCK_VIX = 18.5;
const MOCK_REGIME = 'Normal';

const MOCK_PICKS = [
    { symbol: 'AAPL', strategy: 'Pullback', score: 7.8, signal: 'Strong', stability: 92, ivRank: 42 },
    { symbol: 'MSFT', strategy: 'Trend', score: 7.2, signal: 'Strong', stability: 88, ivRank: 35 },
    { symbol: 'GOOGL', strategy: 'Bounce', score: 6.9, signal: 'Moderate', stability: 85, ivRank: 51 },
    { symbol: 'AMZN', strategy: 'Pullback', score: 6.5, signal: 'Moderate', stability: 82, ivRank: 63 },
    { symbol: 'META', strategy: 'Breakout', score: 6.3, signal: 'Moderate', stability: 79, ivRank: 58 },
];

const MOCK_MARKET = [
    { symbol: 'SPY', price: 592.34, change: 1.25, direction: 'up' },
    { symbol: 'QQQ', price: 518.89, change: 0.88, direction: 'up' },
    { symbol: 'IWM', price: 224.56, change: -0.32, direction: 'down' },
    { symbol: 'DIA', price: 438.12, change: 0.45, direction: 'up' },
    { symbol: 'GLD', price: 186.70, change: 0.62, direction: 'up' },
    { symbol: 'TLT', price: 92.15, change: -0.18, direction: 'down' },
    { symbol: 'VIX', price: 18.50, change: 5.2, direction: 'alert' },
];

// ── Diverse position types (synced with Portfolio) ──

const MOCK_POSITIONS = [
    { id: 'D001', symbol: 'NVDA', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 115, longStrike: 110, expiration: '2026-04-17', dte: 59, qty: 2, credit: 1.45, currentValue: 0.84, status: 'open' },
    { id: 'D002', symbol: 'AAPL', type: 'naked-put', strategy: 'Pullback', shortStrike: 215, longStrike: null, expiration: '2026-03-21', dte: 32, qty: 1, credit: 2.85, currentValue: 1.30, status: 'open' },
    { id: 'D003', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 340, shortStrike: null, expiration: '2026-06-19', dte: 122, qty: 5, debit: 18.50, currentValue: 24.30, status: 'open' },
    { id: 'D004', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 620, shortStrike: 650, expiration: '2026-04-17', dte: 59, qty: 2, debit: 8.20, currentValue: 12.50, status: 'open' },
    { id: 'D005', symbol: 'AMD', type: 'bull-put-spread', strategy: 'Bounce', shortStrike: 100, longStrike: 95, expiration: '2026-03-21', dte: 32, qty: 3, credit: 1.20, currentValue: 0.87, status: 'open' },
    { id: 'D006', symbol: 'CRM', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 280, longStrike: 275, expiration: '2026-04-17', dte: 59, qty: 1, credit: 1.10, currentValue: 1.42, status: 'open' },
];

const TYPE_LABELS = {
    'bull-put-spread': 'Bull Put',
    'naked-put': 'Naked Put',
    'long-call': 'Long Call',
    'bull-call-spread': 'Bull Call',
};

const TYPE_COLORS = {
    'bull-put-spread': 'badge-indigo',
    'naked-put': 'badge-amber',
    'long-call': 'badge-green',
    'bull-call-spread': 'badge-green',
};

// ── P&L helpers ──

function isCredit(p) {
    return p.type === 'bull-put-spread' || p.type === 'naked-put';
}

function positionPnlPerContract(p) {
    if (isCredit(p)) return (p.credit - p.currentValue) * 100;
    return (p.currentValue - p.debit) * 100;
}

function positionPnlTotal(p) {
    return positionPnlPerContract(p) * p.qty;
}

function positionPnlPct(p) {
    if (isCredit(p)) return (positionPnlPerContract(p) / (p.credit * 100)) * 100;
    return (positionPnlPerContract(p) / (p.debit * 100)) * 100;
}

function formatStrikes(p) {
    if (p.type === 'bull-put-spread') return `${p.shortStrike}/${p.longStrike}p`;
    if (p.type === 'naked-put') return `${p.shortStrike}p`;
    if (p.type === 'long-call') return `${p.longStrike}c`;
    if (p.type === 'bull-call-spread') return `${p.longStrike}/${p.shortStrike}c`;
    return '—';
}

function StatusBadge({ position }) {
    const pct = positionPnlPct(position);
    const p = position;
    if (isCredit(p)) {
        if (pct >= 50) return <span className="badge badge-green">Take Profit</span>;
        if (pct < -50) return <span className="badge badge-red">Defend</span>;
        if (p.dte <= 7) return <span className="badge badge-amber">Expiring</span>;
        return <span className="badge badge-indigo">Holding</span>;
    }
    if (pct >= 50) return <span className="badge badge-green">Take Profit</span>;
    if (pct <= -30) return <span className="badge badge-red">Watch</span>;
    if (p.dte <= 14) return <span className="badge badge-amber">Time Decay</span>;
    return <span className="badge badge-indigo">Holding</span>;
}

// ──────────────────────────────────────────────────────────
// Collapsible header
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
// VIX Gauge
// ──────────────────────────────────────────────────────────

function VixGauge({ value, regime }) {
    const maxVix = 40;
    const angle = Math.min((value / maxVix) * 180, 180);
    const needleX = 110 + 80 * Math.cos((Math.PI * (180 - angle)) / 180);
    const needleY = 100 - 80 * Math.sin((Math.PI * (180 - angle)) / 180);

    let color = 'var(--green)';
    let regimeClass = 'regime-low';
    if (value > 25) { color = 'var(--red)'; regimeClass = 'regime-high'; }
    else if (value > 20) { color = 'var(--amber)'; regimeClass = 'regime-elevated'; }
    else if (value > 15) { color = 'var(--text-accent)'; regimeClass = 'regime-normal'; }

    return (
        <div className="vix-gauge-container">
            <div className="vix-gauge">
                <svg viewBox="0 0 220 120">
                    <path d="M 20 100 A 90 90 0 0 1 200 100" fill="none" stroke="rgba(71, 85, 105, 0.3)" strokeWidth="12" strokeLinecap="round" />
                    <path d="M 20 100 A 90 90 0 0 1 65 30" fill="none" stroke="var(--green)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                    <path d="M 65 30 A 90 90 0 0 1 110 10" fill="none" stroke="#818cf8" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                    <path d="M 110 10 A 90 90 0 0 1 155 30" fill="none" stroke="var(--amber)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                    <path d="M 155 30 A 90 90 0 0 1 200 100" fill="none" stroke="var(--red)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                    <line x1="110" y1="100" x2={needleX} y2={needleY} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="110" cy="100" r="5" fill={color} />
                </svg>
            </div>
            <div className="vix-value" style={{ color }}>{value.toFixed(1)}</div>
            <div className={`vix-regime ${regimeClass}`}>
                <Shield size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {regime} Volatility
            </div>
        </div>
    );
}

function StrategyBadge({ strategy }) {
    const cls = `strategy-chip strategy-${strategy.toLowerCase()}`;
    return <span className={cls}>{strategy}</span>;
}

// ──────────────────────────────────────────────────────────
// Skeleton
// ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
    return (
        <>
            <div className="grid-4 analysis-section fade-in">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="skeleton skeleton-stat-card" />
                ))}
            </div>
            <div className="grid-2 analysis-section fade-in" style={{ animationDelay: '0.05s' }}>
                <div className="skeleton-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line w-60" style={{ margin: '20px auto 10px', height: 80 }} />
                    <div className="skeleton skeleton-line w-40" style={{ margin: '0 auto' }} />
                </div>
                <div className="skeleton-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line w-100" />
                    <div className="skeleton skeleton-line w-100" />
                    <div className="skeleton skeleton-line w-100" />
                    <div className="skeleton skeleton-line w-80" />
                </div>
            </div>
            <div className="skeleton-card analysis-section fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line w-100" />
                <div className="skeleton skeleton-line w-100" />
                <div className="skeleton skeleton-line w-80" />
            </div>
            <div className="skeleton-card fade-in" style={{ animationDelay: '0.15s' }}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line w-100" />
                <div className="skeleton skeleton-line w-100" />
                <div className="skeleton skeleton-line w-60" />
            </div>
        </>
    );
}

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Dashboard({ onSymbolClick }) {
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState({});

    useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    const vix = MOCK_VIX;
    const regime = MOCK_REGIME;

    // Compute aggregate stats
    const totalPnl = MOCK_POSITIONS.reduce((sum, p) => sum + positionPnlTotal(p), 0);
    const profitable = MOCK_POSITIONS.filter(p => positionPnlTotal(p) > 0).length;

    const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Market overview and daily trading signals</p>
            </div>

            <div className="page-content">
                {loading && <DashboardSkeleton />}

                {!loading && (
                    <>
                        {/* Top Stats Row */}
                        <div className="grid-4 analysis-section fade-in">
                            <div className="stat-card">
                                <div className="stat-label">VIX Level</div>
                                <div className="stat-value amber">{vix.toFixed(1)}</div>
                                <div className="stat-change" style={{ color: 'var(--text-muted)' }}>Regime: {regime}</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Active Positions</div>
                                <div className="stat-value indigo">{MOCK_POSITIONS.length}</div>
                                <div className="stat-change" style={{ color: 'var(--green)' }}>{profitable} profitable</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Unrealized P&L</div>
                                <div className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`}>
                                    {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
                                </div>
                                <div className="stat-change" style={{ color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    across {MOCK_POSITIONS.length} positions
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Win Rate (30d)</div>
                                <div className="stat-value green">87%</div>
                                <div className="stat-change" style={{ color: 'var(--text-muted)' }}>13/15 trades</div>
                            </div>
                        </div>

                        {/* VIX Gauge + Market Overview */}
                        <div className="grid-2 analysis-section">
                            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
                                <CollapsibleHeader
                                    icon={<Gauge size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="VIX Gauge"
                                    right={<span className="badge badge-indigo">Live</span>}
                                    collapsed={collapsed.vixGauge}
                                    onToggle={() => toggleSection('vixGauge')}
                                />
                                <div className={`card-body-collapsible${collapsed.vixGauge ? ' collapsed' : ''}`}>
                                    <VixGauge value={vix} regime={regime} />
                                </div>
                            </div>

                            <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                                <CollapsibleHeader
                                    icon={<Activity size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Market Overview"
                                    right={<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>}
                                    collapsed={collapsed.market}
                                    onToggle={() => toggleSection('market')}
                                />
                                <div className={`card-body-collapsible${collapsed.market ? ' collapsed' : ''}`}>
                                    <div className="card-body" style={{ padding: 0 }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>Index</th><th>Price</th><th>Change</th><th>Trend</th></tr>
                                                </thead>
                                                <tbody>
                                                    {MOCK_MARKET.map(m => {
                                                        const color = m.direction === 'up' ? 'var(--green)' : m.direction === 'down' ? 'var(--red)' : 'var(--amber)';
                                                        const Icon = m.direction === 'up' ? TrendingUp : m.direction === 'down' ? TrendingDown : AlertTriangle;
                                                        return (
                                                            <tr key={m.symbol}>
                                                                <td className="symbol">{m.symbol}</td>
                                                                <td>${m.price.toFixed(2)}</td>
                                                                <td style={{ color }}>{m.change >= 0 ? '+' : ''}{m.change}%</td>
                                                                <td><Icon size={14} style={{ color }} /></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Daily Top Picks */}
                        <div className="card fade-in analysis-section" style={{ animationDelay: '0.15s' }}>
                            <CollapsibleHeader
                                icon={<Zap size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Daily Top Picks"
                                right={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge badge-indigo">{MOCK_PICKS.length} picks</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click to analyze</span>
                                    </div>
                                }
                                collapsed={collapsed.picks}
                                onToggle={() => toggleSection('picks')}
                            />
                            <div className={`card-body-collapsible${collapsed.picks ? ' collapsed' : ''}`}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr><th>Rank</th><th>Symbol</th><th>Strategy</th><th>Score</th><th>Signal</th><th>IV Rank</th><th>Stability</th><th></th></tr>
                                        </thead>
                                        <tbody>
                                            {MOCK_PICKS.map((pick, i) => (
                                                <tr
                                                    key={pick.symbol}
                                                    onClick={() => onSymbolClick?.(pick.symbol)}
                                                    className="clickable-row"
                                                >
                                                    <td style={{ color: 'var(--text-muted)' }}>#{i + 1}</td>
                                                    <td className="symbol">{pick.symbol}</td>
                                                    <td><StrategyBadge strategy={pick.strategy} /></td>
                                                    <td className="score" style={{ color: pick.score >= 7 ? 'var(--green)' : 'var(--amber)' }}>{pick.score.toFixed(1)}</td>
                                                    <td>
                                                        <span className={`badge ${pick.signal === 'Strong' ? 'badge-green' : 'badge-amber'}`}>{pick.signal}</span>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: pick.ivRank >= 50 ? 'var(--amber)' : 'var(--text-secondary)' }}>{pick.ivRank}</span>
                                                    </td>
                                                    <td>
                                                        <div className="stability-bar-wrap">
                                                            <div className="stability-bar-track">
                                                                <div className="stability-bar-fill" style={{ width: `${pick.stability}%`, background: pick.stability >= 80 ? 'var(--green)' : 'var(--amber)' }} />
                                                            </div>
                                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pick.stability}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <ExternalLink size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Active Positions */}
                        <div className="card fade-in" style={{ animationDelay: '0.25s' }}>
                            <CollapsibleHeader
                                icon={<Target size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Active Positions"
                                right={<span className="badge badge-indigo">{MOCK_POSITIONS.length} open</span>}
                                collapsed={collapsed.positions}
                                onToggle={() => toggleSection('positions')}
                            />
                            <div className={`card-body-collapsible${collapsed.positions ? ' collapsed' : ''}`}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Symbol</th>
                                                <th>Type</th>
                                                <th>Strategy</th>
                                                <th>Strikes</th>
                                                <th>Qty</th>
                                                <th>DTE</th>
                                                <th>P&L ($)</th>
                                                <th>P&L (%)</th>
                                                <th>Status</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {MOCK_POSITIONS.map((p) => {
                                                const pnl = positionPnlTotal(p);
                                                const pnlPct = positionPnlPct(p);
                                                return (
                                                    <tr
                                                        key={p.id}
                                                        onClick={() => onSymbolClick?.(p.symbol)}
                                                        className="clickable-row"
                                                    >
                                                        <td className="symbol">{p.symbol}</td>
                                                        <td><span className={`badge ${TYPE_COLORS[p.type]}`} style={{ fontSize: 10 }}>{TYPE_LABELS[p.type]}</span></td>
                                                        <td><StrategyBadge strategy={p.strategy} /></td>
                                                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{formatStrikes(p)}</td>
                                                        <td>{p.qty}</td>
                                                        <td>
                                                            <span style={{ color: p.dte <= 14 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                                {p.dte <= 7 && <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                                                                {p.dte}d
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: 600, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}
                                                        </td>
                                                        <td style={{ fontWeight: 600, color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                        </td>
                                                        <td><StatusBadge position={p} /></td>
                                                        <td><ExternalLink size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} /></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
