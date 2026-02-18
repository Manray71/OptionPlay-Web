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
    Info,
} from 'lucide-react';
import { fetchVixJson, fetchQuotesJson, runScanJson, fetchPortfolioPositions } from '../api';

// ──────────────────────────────────────────────────────────
// Fallback data (used when API is unavailable)
// ──────────────────────────────────────────────────────────

const FALLBACK_VIX = 18.5;
const FALLBACK_REGIME = 'Normal';

const FALLBACK_PICKS = [
    { symbol: 'AAPL', strategy: 'Pullback', score: 7.8, signal: 'Strong', stability: 92, ivRank: 42 },
    { symbol: 'MSFT', strategy: 'Trend', score: 7.2, signal: 'Strong', stability: 88, ivRank: 35 },
    { symbol: 'GOOGL', strategy: 'Bounce', score: 6.9, signal: 'Moderate', stability: 85, ivRank: 51 },
    { symbol: 'AMZN', strategy: 'Pullback', score: 6.5, signal: 'Moderate', stability: 82, ivRank: 63 },
    { symbol: 'META', strategy: 'Breakout', score: 6.3, signal: 'Moderate', stability: 79, ivRank: 58 },
];

const FALLBACK_MARKET = [
    { symbol: 'SPY', price: 592.34, change: 1.25, direction: 'up' },
    { symbol: 'QQQ', price: 518.89, change: 0.88, direction: 'up' },
    { symbol: 'IWM', price: 224.56, change: -0.32, direction: 'down' },
    { symbol: 'DIA', price: 438.12, change: 0.45, direction: 'up' },
    { symbol: 'GLD', price: 186.70, change: 0.62, direction: 'up' },
    { symbol: 'TLT', price: 92.15, change: -0.18, direction: 'down' },
    { symbol: 'VIX', price: 18.50, change: 5.2, direction: 'alert' },
];

const FALLBACK_POSITIONS = [
    { id: 'D001', symbol: 'NVDA', type: 'bull-put-spread', strategy: 'Pullback', shortStrike: 115, longStrike: 110, expiration: '2026-04-17', dte: 59, qty: 2, credit: 1.45, currentValue: 0.84, status: 'open' },
    { id: 'D002', symbol: 'AAPL', type: 'short-put', strategy: 'Pullback', shortStrike: 215, longStrike: null, expiration: '2026-03-21', dte: 32, qty: 1, credit: 2.85, currentValue: 1.30, status: 'open' },
    { id: 'D003', symbol: 'TSLA', type: 'long-call', strategy: 'Breakout', longStrike: 340, shortStrike: null, expiration: '2026-06-19', dte: 122, qty: 5, debit: 18.50, currentValue: 24.30, status: 'open' },
    { id: 'D004', symbol: 'META', type: 'bull-call-spread', strategy: 'Trend', longStrike: 620, shortStrike: 650, expiration: '2026-04-17', dte: 59, qty: 2, debit: 8.20, currentValue: 12.50, status: 'open' },
    { id: 'D005', symbol: 'AMD', type: 'bull-put-spread', strategy: 'Bounce', shortStrike: 100, longStrike: 95, expiration: '2026-03-21', dte: 32, qty: 3, credit: 1.20, currentValue: 0.87, status: 'open' },
    { id: 'D006', symbol: 'CRM', type: 'bull-put-spread', strategy: 'Trend', shortStrike: 280, longStrike: 275, expiration: '2026-04-17', dte: 59, qty: 1, credit: 1.10, currentValue: 1.42, status: 'open' },
];

// ── Map API scan signal to dashboard pick format ──

function signalToPick(signal) {
    const strength = signal.strength || '';
    return {
        symbol: signal.symbol,
        strategy: (signal.strategy || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        score: signal.score ?? 0,
        signal: strength.charAt(0).toUpperCase() + strength.slice(1).toLowerCase(),
        stability: signal.details?.stability_score ?? signal.details?.stability?.stability_score ?? 0,
        ivRank: signal.details?.iv_rank ?? 0,
    };
}

// ── Map API portfolio position to dashboard format ──

function apiPositionToDashboard(p) {
    // IBKR live positions have flat fields
    if (p.source === 'ibkr') {
        const type = p.strategy?.toLowerCase()?.replace(/\s+/g, '-') || 'other';
        return {
            id: p.id,
            symbol: p.symbol,
            type,
            strategy: p.strategy ?? '—',
            shortStrike: p.short_strike ?? null,
            longStrike: p.long_strike ?? null,
            expiration: p.expiration ?? '',
            dte: p.dte ?? 0,
            qty: p.contracts ?? Math.abs(p.quantity ?? 1),
            credit: p.net_credit ?? 0,
            debit: p.debit ?? null,
            unrealizedPnl: p.unrealized_pnl ?? null,
            maxProfit: p.max_profit ?? null,
            maxLoss: p.max_loss ?? null,
            ibkr: true,
            status: p.status === 'open' ? 'open' : 'closed',
        };
    }

    // Local PortfolioManager format
    const shortStrike = p.short_leg?.strike ?? null;
    const longStrike = p.long_leg?.strike ?? null;
    const expiration = p.short_leg?.expiration ?? p.long_leg?.expiration ?? '';
    const now = new Date();
    const exp = new Date(expiration);
    const dte = Math.max(0, Math.round((exp - now) / (1000 * 60 * 60 * 24)));
    const credit = Math.abs(p.short_leg?.premium ?? 0) + Math.abs(p.long_leg?.premium ?? 0);
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
        credit,
        currentValue: credit * 0.6,
        status: p.status === 'open' ? 'open' : 'closed',
    };
}

const TYPE_LABELS = {
    'bull-put-spread': 'Bull Put',
    'bear-call-spread': 'Bear Call',
    'bull-call-spread': 'Bull Call',
    'bear-put-spread': 'Bear Put',
    'iron-condor': 'Iron Condor',
    'iron-butterfly': 'Iron Bfly',
    'call-butterfly': 'Call Bfly',
    'put-butterfly': 'Put Bfly',
    'short-straddle': 'Short Straddle',
    'long-straddle': 'Long Straddle',
    'short-strangle': 'Short Strangle',
    'long-strangle': 'Long Strangle',
    'short-put': 'Naked Put',
    'short-call': 'Naked Call',
    'long-call': 'Long Call',
    'long-put': 'Long Put',
    'stock': 'Stock',
};

const TYPE_COLORS = {
    'bull-put-spread': 'badge-indigo',
    'bear-call-spread': 'badge-amber',
    'bull-call-spread': 'badge-green',
    'bear-put-spread': 'badge-red',
    'iron-condor': 'badge-indigo',
    'iron-butterfly': 'badge-indigo',
    'call-butterfly': 'badge-green',
    'put-butterfly': 'badge-amber',
    'short-straddle': 'badge-amber',
    'long-straddle': 'badge-green',
    'short-strangle': 'badge-amber',
    'long-strangle': 'badge-green',
    'short-put': 'badge-amber',
    'short-call': 'badge-red',
    'long-call': 'badge-green',
    'long-put': 'badge-red',
    'stock': 'badge-indigo',
};

// ── P&L helpers ──

function isCredit(p) {
    return p.type === 'bull-put-spread' || p.type === 'short-put';
}

function positionPnlTotal(p) {
    if (p.ibkr && p.unrealizedPnl != null) return p.unrealizedPnl;
    if (isCredit(p) && p.currentValue != null) return (p.credit - p.currentValue) * 100 * p.qty;
    if (p.currentValue != null && p.debit) return (p.currentValue - p.debit) * 100 * p.qty;
    return 0;
}

function positionPnlPct(p) {
    if (p.ibkr && p.unrealizedPnl != null) {
        const basis = p.maxLoss || (p.credit ? p.credit * p.qty * 100 : p.debit ? p.debit * p.qty * 100 : 1);
        return basis ? (p.unrealizedPnl / basis) * 100 : 0;
    }
    if (isCredit(p) && p.currentValue != null && p.credit) {
        return ((p.credit - p.currentValue) / p.credit) * 100;
    }
    if (p.currentValue != null && p.debit) {
        return ((p.currentValue - p.debit) / p.debit) * 100;
    }
    return 0;
}

function formatStrikes(p) {
    const t = p.type;
    if (t === 'bull-put-spread' || t === 'bear-put-spread') return `${p.shortStrike}/${p.longStrike}p`;
    if (t === 'bull-call-spread' || t === 'bear-call-spread') return `${p.longStrike}/${p.shortStrike}c`;
    if (t === 'short-put' || t === 'long-put') return `${p.shortStrike ?? p.longStrike}p`;
    if (t === 'short-call' || t === 'long-call') return `${p.longStrike ?? p.shortStrike}c`;
    if (p.shortStrike && p.longStrike) return `${p.shortStrike}/${p.longStrike}`;
    if (p.shortStrike) return `${p.shortStrike}`;
    if (p.longStrike) return `${p.longStrike}`;
    return '—';
}

function StatusBadge({ position }) {
    const pnl = positionPnlTotal(position);
    const p = position;
    if (p.dte <= 7) return <span className="badge badge-amber">Expiring</span>;
    if (p.ibkr && p.maxProfit && pnl >= p.maxProfit * 0.5) return <span className="badge badge-green">Take Profit</span>;
    if (p.ibkr && p.maxLoss && pnl <= -p.maxLoss * 0.5) return <span className="badge badge-red">Defend</span>;
    if (pnl > 0) return <span className="badge badge-green">Profit</span>;
    if (pnl < 0 && p.dte <= 14) return <span className="badge badge-amber">Watch</span>;
    if (pnl < 0) return <span className="badge badge-red">Loss</span>;
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
    const [demoMode, setDemoMode] = useState(false);

    const [vix, setVix] = useState(FALLBACK_VIX);
    const [regime, setRegime] = useState(FALLBACK_REGIME);
    const [picks, setPicks] = useState(FALLBACK_PICKS);
    const [market, setMarket] = useState(FALLBACK_MARKET);
    const [positions, setPositions] = useState(FALLBACK_POSITIONS);

    useEffect(() => {
        let cancelled = false;
        async function loadData() {
            const results = await Promise.allSettled([
                fetchVixJson(),
                fetchQuotesJson(['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'TLT']),
                runScanJson({ strategy: 'multi', max_results: 5 }),
                fetchPortfolioPositions('open'),
            ]);
            if (cancelled) return;

            let usedFallback = false;

            // VIX
            if (results[0].status === 'fulfilled' && !results[0].value.error) {
                setVix(results[0].value.vix);
                setRegime(results[0].value.regime);
            } else { usedFallback = true; }

            // Market quotes
            if (results[1].status === 'fulfilled' && results[1].value.quotes?.length) {
                const quotes = results[1].value.quotes;
                setMarket(quotes.map(q => ({
                    symbol: q.symbol,
                    price: q.price ?? 0,
                    change: q.change_pct ?? 0,
                    direction: (q.change_pct ?? 0) > 0 ? 'up' : (q.change_pct ?? 0) < 0 ? 'down' : 'up',
                })));
            } else { usedFallback = true; }

            // Top picks from scan
            if (results[2].status === 'fulfilled' && results[2].value.signals?.length) {
                setPicks(results[2].value.signals.map(signalToPick));
            } else { usedFallback = true; }

            // Portfolio positions
            if (results[3].status === 'fulfilled' && results[3].value.positions) {
                if (results[3].value.positions.length) {
                    setPositions(results[3].value.positions.map(apiPositionToDashboard));
                } else {
                    setPositions([]);
                }
            } else { usedFallback = true; }

            setDemoMode(usedFallback);
            setLoading(false);
        }
        loadData();
        return () => { cancelled = true; };
    }, []);

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    // Compute aggregate stats
    const totalPnl = positions.reduce((sum, p) => sum + positionPnlTotal(p), 0);
    const profitable = positions.filter(p => positionPnlTotal(p) > 0).length;

    const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Market overview and daily trading signals</p>
                {demoMode && (
                    <span style={{ fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Info size={12} /> Demo mode — some data is simulated
                    </span>
                )}
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
                                <div className="stat-value indigo">{positions.length}</div>
                                <div className="stat-change" style={{ color: 'var(--green)' }}>{profitable} profitable</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Unrealized P&L</div>
                                <div className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`}>
                                    {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
                                </div>
                                <div className="stat-change" style={{ color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    across {positions.length} positions
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
                                                    {market.map(m => {
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
                                        <span className="badge badge-indigo">{picks.length} picks</span>
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
                                            {picks.map((pick, i) => (
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
                                right={<span className="badge badge-indigo">{positions.length} open</span>}
                                collapsed={collapsed.positions}
                                onToggle={() => toggleSection('positions')}
                            />
                            <div className={`card-body-collapsible${collapsed.positions ? ' collapsed' : ''}`}>
                                {positions.length === 0 ? (
                                    <div className="card-body" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)' }}>
                                        No active positions — paper TWS account is empty
                                    </div>
                                ) : (
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
                                                {positions.map((p) => {
                                                    const pnl = positionPnlTotal(p);
                                                    const pnlPct = positionPnlPct(p);
                                                    return (
                                                        <tr
                                                            key={p.id}
                                                            onClick={() => onSymbolClick?.(p.symbol)}
                                                            className="clickable-row"
                                                        >
                                                            <td className="symbol">{p.symbol}</td>
                                                            <td><span className={`badge ${TYPE_COLORS[p.type] || 'badge-indigo'}`} style={{ fontSize: 10 }}>{TYPE_LABELS[p.type] || p.type}</span></td>
                                                            <td>{p.ibkr ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live</span> : <StrategyBadge strategy={p.strategy} />}</td>
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
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
