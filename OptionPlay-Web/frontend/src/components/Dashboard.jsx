import { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Calendar,
    BarChart3,
    Newspaper,
    ChevronDown,
    Info,
    Minus,
    RefreshCw,
    Download,
} from 'lucide-react';
import { exportDashboardPdf } from '../utils/exportDashboardPdf';
import {
    fetchVixJson,
    fetchQuotesJson,
    fetchEventsJson,
    fetchSectorsJson,
    fetchEarningsCalendarJson,
    fetchMarketNewsJson,
} from '../api';

// ──────────────────────────────────────────────────────────
// Fallback data
// ──────────────────────────────────────────────────────────

const FALLBACK_VIX = 18.5;
const FALLBACK_REGIME = 'Normal';

const MARKET_SYMBOLS = ['SPX', 'SPY', 'QQQ', 'DJI', 'NDQ', 'DEU40', 'XAUUSD', 'XAGUSD', 'CL1!', 'EURUSD'];

const FALLBACK_MARKET = [
    { symbol: 'SPX', name: 'S&P 500', price: 6082.00, change_pct: 0.52 },
    { symbol: 'SPY', name: 'SPDR S&P 500', price: 605.12, change_pct: 0.48 },
    { symbol: 'QQQ', name: 'Invesco QQQ', price: 533.20, change_pct: 0.65 },
    { symbol: 'DJI', name: 'Dow Jones', price: 44500.00, change_pct: 0.31 },
    { symbol: 'NDQ', name: 'Nasdaq Comp.', price: 19890.00, change_pct: 0.72 },
    { symbol: 'DEU40', name: 'DAX 40', price: 22400.00, change_pct: -0.15 },
    { symbol: 'XAUUSD', name: 'Gold', price: 2935.00, change_pct: 0.42 },
    { symbol: 'XAGUSD', name: 'Silver', price: 32.80, change_pct: 0.88 },
    { symbol: 'CL1!', name: 'Crude Oil', price: 72.50, change_pct: -0.65 },
    { symbol: 'EURUSD', name: 'EUR/USD', price: 1.0485, change_pct: 0.12 },
];

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
// VIX Gauge (inline SVG for stat card)
// ──────────────────────────────────────────────────────────

function VixGauge({ value }) {
    const maxVix = 40;
    const angle = Math.min((value / maxVix) * 180, 180);
    const needleX = 110 + 80 * Math.cos((Math.PI * (180 - angle)) / 180);
    const needleY = 100 - 80 * Math.sin((Math.PI * (180 - angle)) / 180);

    let color = 'var(--green)';
    if (value > 25) color = 'var(--red)';
    else if (value > 20) color = 'var(--amber)';
    else if (value > 15) color = 'var(--text-accent)';

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: 120, margin: '2px auto' }}>
            <svg viewBox="0 0 220 110">
                <path d="M 20 100 A 90 90 0 0 1 200 100" fill="none" stroke="rgba(71, 85, 105, 0.3)" strokeWidth="12" strokeLinecap="round" />
                <path d="M 20 100 A 90 90 0 0 1 65 30" fill="none" stroke="var(--green)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                <path d="M 65 30 A 90 90 0 0 1 110 10" fill="none" stroke="#818cf8" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                <path d="M 110 10 A 90 90 0 0 1 155 30" fill="none" stroke="var(--amber)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                <path d="M 155 30 A 90 90 0 0 1 200 100" fill="none" stroke="var(--red)" strokeWidth="12" strokeLinecap="round" opacity="0.6" />
                <line x1="110" y1="100" x2={needleX} y2={needleY} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="110" cy="100" r="5" fill={color} />
            </svg>
        </div>
    );
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
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-line w-100" />)}
                </div>
            </div>
            {[0, 1, 2].map(i => (
                <div key={i} className="skeleton-card analysis-section fade-in" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                    <div className="skeleton skeleton-title" />
                    {[0, 1, 2].map(j => <div key={j} className="skeleton skeleton-line w-100" />)}
                </div>
            ))}
        </>
    );
}

// ──────────────────────────────────────────────────────────
// Impact badge for events
// ──────────────────────────────────────────────────────────

function ImpactBadge({ impact }) {
    const cls = impact === 'HIGH' || impact === 'CRITICAL' ? 'badge-red'
        : impact === 'MEDIUM' ? 'badge-amber'
        : 'badge-muted';
    return <span className={`badge ${cls}`} style={{ fontSize: 10 }}>{impact}</span>;
}

// ──────────────────────────────────────────────────────────
// Sector regime badge
// ──────────────────────────────────────────────────────────

function RegimeBadge({ regime }) {
    const cls = regime === 'STRONG' ? 'badge-green'
        : regime === 'WEAK' || regime === 'CRISIS' ? 'badge-red'
        : 'badge-muted';
    return <span className={`badge ${cls}`} style={{ fontSize: 10 }}>{regime}</span>;
}

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

// ── Cache helpers ──
const CACHE_KEY = 'optionplay_dashboard_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (Date.now() - cached.ts > CACHE_TTL) return null;
        return cached;
    } catch { return null; }
}

function writeCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
}

export default function Dashboard({ onSymbolClick }) {
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState({});
    const [demoMode, setDemoMode] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [cacheTime, setCacheTime] = useState(null);

    const [vix, setVix] = useState(FALLBACK_VIX);
    const [vixChange, setVixChange] = useState(null);
    const [vixChangePct, setVixChangePct] = useState(null);
    const [regime, setRegime] = useState(FALLBACK_REGIME);
    const [market, setMarket] = useState(FALLBACK_MARKET);
    const [events, setEvents] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [earnings, setEarnings] = useState([]);
    const [news, setNews] = useState([]);

    const applyData = useCallback((data) => {
        if (data.vix != null) { setVix(data.vix); setVixChange(data.vixChange ?? null); setVixChangePct(data.vixChangePct ?? null); setRegime(data.regime); }
        if (data.market?.length) setMarket(data.market);
        if (data.events) setEvents(data.events);
        if (data.sectors) setSectors(data.sectors);
        if (data.earnings) setEarnings(data.earnings);
        if (data.news) setNews(data.news);
        setDemoMode(data.demoMode || false);
        setCacheTime(data.ts || Date.now());
    }, []);

    const fetchFresh = useCallback(async () => {
        const results = await Promise.allSettled([
            fetchVixJson(),
            fetchQuotesJson(MARKET_SYMBOLS),
            fetchEventsJson(30),
            fetchSectorsJson(),
            fetchEarningsCalendarJson(8),
            fetchMarketNewsJson(5),
        ]);

        let usedFallback = false;
        const data = { ts: Date.now(), demoMode: false };

        if (results[0].status === 'fulfilled' && !results[0].value.error) {
            data.vix = results[0].value.vix;
            data.vixChange = results[0].value.change;
            data.vixChangePct = results[0].value.change_pct;
            data.regime = results[0].value.regime;
        } else { usedFallback = true; }

        if (results[1].status === 'fulfilled' && results[1].value.quotes?.length) {
            data.market = results[1].value.quotes;
        } else { usedFallback = true; }

        if (results[2].status === 'fulfilled' && results[2].value.events) data.events = results[2].value.events;
        if (results[3].status === 'fulfilled' && results[3].value.sectors) data.sectors = results[3].value.sectors;
        if (results[4].status === 'fulfilled' && results[4].value.earnings) data.earnings = results[4].value.earnings;
        if (results[5].status === 'fulfilled' && results[5].value.news) data.news = results[5].value.news;

        data.demoMode = usedFallback;
        writeCache(data);
        applyData(data);
        return data;
    }, [applyData]);

    useEffect(() => {
        let cancelled = false;
        async function init() {
            // Try cache first
            const cached = readCache();
            if (cached) {
                applyData(cached);
                setLoading(false);
                return;
            }
            // No cache — fetch fresh
            await fetchFresh();
            if (!cancelled) setLoading(false);
        }
        init();
        return () => { cancelled = true; };
    }, [applyData, fetchFresh]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchFresh();
        setRefreshing(false);
    };

    const toggleSection = (id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

    const lastUpdated = cacheTime
        ? new Date(cacheTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    // Extract SPY + QQQ from market for stat cards
    const spy = market.find(m => m.symbol === 'SPY');
    const qqq = market.find(m => m.symbol === 'QQQ');

    const fmtChg = (pct) => {
        if (pct == null) return '—';
        return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    };
    const chgColor = (pct) => pct > 0 ? 'green' : pct < 0 ? 'red' : '';

    return (
        <>
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h2>Market Overview</h2>
                    <p>Indices, volatility, events, sectors & earnings at a glance</p>
                    {demoMode && (
                        <span style={{ fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <Info size={12} /> Demo mode — some data is simulated
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{lastUpdated}</span>
                    <button
                        className="btn btn-secondary"
                        onClick={handleRefresh}
                        disabled={refreshing || loading}
                        style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                    >
                        <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => exportDashboardPdf({ vix, regime, market, events, sectors, earnings, news, cacheTime })}
                        disabled={loading}
                        style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                    >
                        <Download size={13} />
                        PDF
                    </button>
                </div>
            </div>

            <div className="page-content">
                {loading && <DashboardSkeleton />}

                {!loading && (
                    <>
                        {/* ─── Top Stats Row ─── */}
                        <div className="grid-4 analysis-section fade-in">
                            <div className="stat-card" style={{ textAlign: 'center' }}>
                                <div className="stat-label">VIX — {regime}</div>
                                <VixGauge value={vix} regime={regime} />
                                <div className="stat-value" style={{ color: vix > 25 ? 'var(--red)' : vix > 20 ? 'var(--amber)' : vix > 15 ? 'var(--text-accent)' : 'var(--green)' }}>{vix.toFixed(1)}</div>
                                <div className="stat-change" style={{ color: vixChange > 0 ? 'var(--red)' : vixChange < 0 ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                                    {vixChange != null ? `${vixChange >= 0 ? '+' : ''}${vixChange.toFixed(2)} (${vixChangePct >= 0 ? '+' : ''}${(vixChangePct ?? 0).toFixed(2)}%)` : '—'}
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">SPY</div>
                                <div className={`stat-value ${chgColor(spy?.change_pct)}`}>
                                    {spy ? `$${spy.price.toFixed(2)}` : '—'}
                                </div>
                                <div className="stat-change" style={{ color: spy?.change_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {fmtChg(spy?.change_pct)}
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">QQQ</div>
                                <div className={`stat-value ${chgColor(qqq?.change_pct)}`}>
                                    {qqq ? `$${qqq.price.toFixed(2)}` : '—'}
                                </div>
                                <div className="stat-change" style={{ color: qqq?.change_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {fmtChg(qqq?.change_pct)}
                                </div>
                            </div>
                            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('upcoming-events-section')?.scrollIntoView({ behavior: 'smooth' })}>
                                <div className="stat-label">Next 14 Days</div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div className="stat-value indigo">{events.filter(e => e.days_away <= 14).length}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Events</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div className="stat-value amber">{earnings.filter(e => e.days_away <= 14).length}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Earnings</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Market Indices ─── */}
                        <div className="analysis-section">
                            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
                                <CollapsibleHeader
                                    icon={<Activity size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Market Indices"
                                    right={<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>}
                                    collapsed={collapsed.market}
                                    onToggle={() => toggleSection('market')}
                                />
                                <div className={`card-body-collapsible${collapsed.market ? ' collapsed' : ''}`}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr><th>Symbol</th><th>Name</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Change</th><th></th></tr>
                                            </thead>
                                            <tbody>
                                                {market.map(m => {
                                                    const pct = m.change_pct;
                                                    const color = pct > 0 ? 'var(--green)' : pct < 0 ? 'var(--red)' : 'var(--text-muted)';
                                                    const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
                                                    const fmtPrice = m.price >= 10 ? m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : m.price.toFixed(4);
                                                    return (
                                                        <tr key={m.symbol}>
                                                            <td className="symbol">{m.symbol}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.name || m.symbol}</td>
                                                            <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice}</td>
                                                            <td style={{ textAlign: 'right', color, fontWeight: 600 }}>{fmtChg(pct)}</td>
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

                        {/* ─── Upcoming Events & Earnings ─── */}
                        <div id="upcoming-events-section" className="card fade-in analysis-section" style={{ animationDelay: '0.15s' }}>
                            <CollapsibleHeader
                                icon={<Calendar size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Upcoming Events & Earnings"
                                right={<span className="badge badge-indigo">{events.length + earnings.length}</span>}
                                collapsed={collapsed.events}
                                onToggle={() => toggleSection('events')}
                            />
                            <div className={`card-body-collapsible${collapsed.events ? ' collapsed' : ''}`}>
                                {/* Economic Events */}
                                {events.length > 0 && (
                                    <>
                                        <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Economic Events</div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>Date</th><th>Days</th><th>Event</th><th>Description</th><th>Impact</th></tr>
                                                </thead>
                                                <tbody>
                                                    {events.map((ev, i) => (
                                                        <tr key={i}>
                                                            <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, whiteSpace: 'nowrap' }}>{ev.date}</td>
                                                            <td style={{ fontWeight: 600, color: ev.days_away <= 3 ? 'var(--red)' : ev.days_away <= 7 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                                {ev.days_away}d
                                                            </td>
                                                            <td style={{ fontWeight: 600 }}>{ev.name}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{ev.description}</td>
                                                            <td><ImpactBadge impact={ev.impact} /></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}

                                {/* Earnings Calendar */}
                                {earnings.length > 0 && (
                                    <>
                                        <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: events.length > 0 ? '1px solid var(--border)' : 'none', marginTop: events.length > 0 ? 8 : 0 }}>Earnings Calendar</div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>Symbol</th><th>Date</th><th>Days</th><th>Status</th></tr>
                                                </thead>
                                                <tbody>
                                                    {earnings.map((e, i) => {
                                                        const statusCls = e.status === 'safe' ? 'badge-green' : e.status === 'caution' ? 'badge-amber' : 'badge-red';
                                                        return (
                                                            <tr
                                                                key={i}
                                                                onClick={() => onSymbolClick?.(e.symbol)}
                                                                className="clickable-row"
                                                            >
                                                                <td className="symbol">{e.symbol}</td>
                                                                <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{e.date}</td>
                                                                <td style={{ fontWeight: 600, color: e.days_away <= 14 ? 'var(--red)' : e.days_away <= 45 ? 'var(--amber)' : 'var(--text-secondary)' }}>
                                                                    {e.days_away}d
                                                                </td>
                                                                <td><span className={`badge ${statusCls}`} style={{ fontSize: 10 }}>{e.status}</span></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}

                                {events.length === 0 && earnings.length === 0 && (
                                    <div className="card-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                        No upcoming events or earnings
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ─── Sector Momentum ─── */}
                        <div className="card fade-in analysis-section" style={{ animationDelay: '0.2s' }}>
                            <CollapsibleHeader
                                icon={<BarChart3 size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Sector Momentum"
                                right={<span className="badge badge-indigo">{sectors.length} sectors</span>}
                                collapsed={collapsed.sectors}
                                onToggle={() => toggleSection('sectors')}
                            />
                            <div className={`card-body-collapsible${collapsed.sectors ? ' collapsed' : ''}`}>
                                {sectors.length === 0 ? (
                                    <div className="card-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                        Sector data loading...
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr><th>Sector</th><th>ETF</th><th style={{ textAlign: 'right' }}>Factor</th><th>Regime</th><th style={{ textAlign: 'right' }}>RS 30d</th><th style={{ textAlign: 'right' }}>RS 60d</th><th style={{ textAlign: 'right' }}>Breadth</th></tr>
                                            </thead>
                                            <tbody>
                                                {sectors.map((s, i) => (
                                                    <tr key={i}>
                                                        <td style={{ fontWeight: 600 }}>{s.sector}</td>
                                                        <td className="symbol">{s.etf}</td>
                                                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: s.momentum_factor >= 1.0 ? 'var(--green)' : s.momentum_factor < 0.85 ? 'var(--red)' : 'var(--text-secondary)' }}>
                                                            {s.momentum_factor.toFixed(3)}
                                                        </td>
                                                        <td><RegimeBadge regime={s.regime} /></td>
                                                        <td style={{ textAlign: 'right', color: s.rs_30d >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
                                                            {s.rs_30d >= 0 ? '+' : ''}{s.rs_30d.toFixed(2)}%
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: s.rs_60d >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
                                                            {s.rs_60d >= 0 ? '+' : ''}{s.rs_60d.toFixed(2)}%
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{s.breadth.toFixed(3)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ─── Top News ─── */}
                        <div className="analysis-section">
                            <div className="card fade-in" style={{ animationDelay: '0.25s' }}>
                                <CollapsibleHeader
                                    icon={<Newspaper size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Top News"
                                    right={<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{news.length} articles</span>}
                                    collapsed={collapsed.news}
                                    onToggle={() => toggleSection('news')}
                                />
                                <div className={`card-body-collapsible${collapsed.news ? ' collapsed' : ''}`}>
                                    {news.length === 0 ? (
                                        <div className="card-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                            No news available
                                        </div>
                                    ) : (
                                        <div className="news-list" style={{ padding: '8px 12px' }}>
                                            {news.map((n, i) => (
                                                <a
                                                    key={i}
                                                    href={n.link || n.url || '#'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="news-card-link"
                                                >
                                                    <div className="news-card">
                                                        <div className="news-title">{n.title}</div>
                                                        <div className="news-meta">
                                                            <span>{n.publisher || n.source || '—'}</span>
                                                            <span>{n.date || ''}</span>
                                                        </div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
