import { useState, useEffect, useCallback } from 'react';
import { useMarketData } from '../contexts/MarketDataContext';
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
import RRGChart from './RRGChart';
import { exportDashboardPdf } from '../utils/exportDashboardPdf';
import {
    fetchVixJson,
    fetchQuotesJson,
    fetchEventsJson,
    fetchSectorsJson,
    fetchStockRSJson,
    fetchEarningsCalendarJson,
    fetchMarketNewsJson,
    fetchRegimeJson,
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
        <div className="card-header-toggle" onClick={onToggle} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
            <div className="header-left">
                <h3>{icon} {title}</h3>
            </div>
            <div className="header-right">
                <span onClick={(e) => e.stopPropagation()}>{right}</span>
                <ChevronDown size={16} className={`chevron${collapsed ? ' collapsed' : ''}`} />
            </div>
        </div>
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
    if (value >= 33) color = 'var(--red)';
    else if (value >= 27) color = '#ff6b6b';
    else if (value >= 22) color = 'var(--amber)';
    else if (value >= 17) color = 'var(--text-accent)';

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
// Quadrant badge for RRG sectors (v2) / legacy regime badge (v1)
// ──────────────────────────────────────────────────────────

function QuadrantBadge({ quadrant }) {
    const map = {
        leading: 'badge-green',
        improving: 'badge-indigo',
        weakening: 'badge-amber',
        lagging: 'badge-red',
        // v1 fallback
        STRONG: 'badge-green',
        WEAK: 'badge-red',
        CRISIS: 'badge-red',
    };
    const cls = map[quadrant] || 'badge-muted';
    const label = (quadrant || '').charAt(0).toUpperCase() + (quadrant || '').slice(1);
    return <span className={`badge ${cls}`} style={{ fontSize: 10 }}>{label}</span>;
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
    const [marketOpen, setMarketOpen] = useState(true);
    const [marketSession, setMarketSession] = useState('market_open');
    const [vixDataSource, setVixDataSource] = useState('live');
    const [vixAsOf, setVixAsOf] = useState(null);
    const [events, setEvents] = useState([]);
    const [sectors, setSectors] = useState([]);
    const [stockRS, setStockRS] = useState([]);
    const [drillSector, setDrillSector] = useState(null);
    const [drillLoading, setDrillLoading] = useState(false);
    const [hideEarnings, setHideEarnings] = useState(false);
    const [regimeParams, setRegimeParams] = useState(null);
    const [earnings, setEarnings] = useState([]);
    const [news, setNews] = useState([]);

    const applyData = useCallback((data) => {
        if (data.vix != null) { setVix(data.vix); setVixChange(data.vixChange ?? null); setVixChangePct(data.vixChangePct ?? null); setRegime(data.regime); }
        if (data.market?.length) setMarket(data.market);
        if (data.marketOpen != null) setMarketOpen(data.marketOpen);
        if (data.marketSession) setMarketSession(data.marketSession);
        if (data.vixDataSource) setVixDataSource(data.vixDataSource);
        if (data.vixAsOf) setVixAsOf(data.vixAsOf);
        if (data.events) setEvents(data.events);
        if (data.sectors) setSectors(data.sectors);
        if (data.regimeParams) setRegimeParams(data.regimeParams);
        if (data.earnings) setEarnings(data.earnings);
        if (data.news) setNews(data.news);
        setDemoMode(data.demoMode || false);
        setCacheTime(data.ts || Date.now());
    }, []);

    // ── SSE live overlay — overwrites state when streaming data arrives ──
    const liveData = useMarketData();

    useEffect(() => {
        if (liveData.vix) {
            setVix(liveData.vix.vix);
            setVixChange(liveData.vix.change ?? null);
            setVixChangePct(liveData.vix.change_pct ?? null);
            setRegime(liveData.vix.regime);
            setMarketOpen(liveData.vix.market_open ?? true);
            setVixDataSource(liveData.vix.data_source || 'live');
        }
    }, [liveData.vix]);

    useEffect(() => {
        if (liveData.quotes?.quotes?.length) {
            setMarket(liveData.quotes.quotes);
            if (liveData.quotes.market_session) setMarketSession(liveData.quotes.market_session);
        }
    }, [liveData.quotes]);

    const fetchFresh = useCallback(async () => {
        const results = await Promise.allSettled([
            fetchVixJson(),
            fetchQuotesJson(MARKET_SYMBOLS),
            fetchEventsJson(30),
            fetchSectorsJson(),
            fetchEarningsCalendarJson(8),
            fetchMarketNewsJson(5),
            fetchRegimeJson(),
        ]);

        let usedFallback = false;
        const data = { ts: Date.now(), demoMode: false };

        if (results[0].status === 'fulfilled' && !results[0].value.error) {
            data.vix = results[0].value.vix;
            data.vixChange = results[0].value.change;
            data.vixChangePct = results[0].value.change_pct;
            data.regime = results[0].value.regime;
            data.vixDataSource = results[0].value.data_source || 'live';
            data.vixAsOf = results[0].value.as_of || null;
            if (results[0].value.market_open != null) data.marketOpen = results[0].value.market_open;
        } else { usedFallback = true; }

        if (results[1].status === 'fulfilled' && results[1].value.quotes?.length) {
            data.market = results[1].value.quotes;
            if (results[1].value.market_open != null) data.marketOpen = results[1].value.market_open;
            if (results[1].value.market_session) data.marketSession = results[1].value.market_session;
        } else { usedFallback = true; }

        if (results[2].status === 'fulfilled' && results[2].value.events) data.events = results[2].value.events;
        if (results[3].status === 'fulfilled' && results[3].value.sectors) data.sectors = results[3].value.sectors;
        if (results[4].status === 'fulfilled' && results[4].value.earnings) data.earnings = results[4].value.earnings;
        if (results[5].status === 'fulfilled' && results[5].value.news) data.news = results[5].value.news;
        if (results[6]?.status === 'fulfilled' && !results[6].value.error) data.regimeParams = results[6].value;

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
                // Refresh in background for new data
                fetchFresh();
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

    const drillIntoSector = async (sectorName, earningsFilter = hideEarnings) => {
        setDrillSector(sectorName);
        setDrillLoading(true);
        try {
            const res = await fetchStockRSJson(sectorName, earningsFilter ? 45 : 0);
            if (res.stocks) setStockRS(res.stocks);
        } catch (e) { console.error('Drill-down failed:', e); }
        setDrillLoading(false);
    };
    const resetDrill = () => { setDrillSector(null); setStockRS([]); setHideEarnings(false); };
    const toggleEarningsFilter = () => {
        const next = !hideEarnings;
        setHideEarnings(next);
        if (drillSector) drillIntoSector(drillSector, next);
    };

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
                        onClick={() => exportDashboardPdf({ vix, vixChange, vixChangePct, regime, market, events, sectors, earnings, news, cacheTime })}
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
                        {/* ─── Market Session Banner ─── */}
                        {!marketOpen && (
                            <div className="analysis-section fade-in" style={{ marginBottom: 0 }}>
                                <div style={{
                                    padding: '8px 16px',
                                    background: marketSession === 'pre_market' ? 'rgba(99, 102, 241, 0.08)'
                                        : marketSession === 'post_market' ? 'rgba(99, 102, 241, 0.08)'
                                        : 'rgba(139, 92, 246, 0.08)',
                                    border: `1px solid ${marketSession === 'pre_market' || marketSession === 'post_market' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(139, 92, 246, 0.25)'}`,
                                    borderRadius: 8,
                                    fontSize: 12,
                                    color: 'var(--text-accent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}>
                                    <Info size={13} />
                                    {marketSession === 'pre_market'
                                        ? 'Pre-Market — prices may include pre-market quotes'
                                        : marketSession === 'post_market'
                                        ? 'After Hours — prices may include post-market quotes'
                                        : 'Market closed — showing last trading day closing prices'}
                                    {vixAsOf && marketSession === 'closed' && <span style={{ color: 'var(--text-muted)' }}>({vixAsOf})</span>}
                                </div>
                            </div>
                        )}

                        {/* ─── Top Stats Row ─── */}
                        <div className="grid-4 analysis-section fade-in">
                            <div className="stat-card" style={{ textAlign: 'center' }}>
                                <div className="stat-label">VIX — {regime}</div>
                                <VixGauge value={vix} regime={regime} />
                                <div className="stat-value" style={{ color: vix >= 33 ? 'var(--red)' : vix >= 27 ? '#ff6b6b' : vix >= 22 ? 'var(--amber)' : vix >= 17 ? 'var(--text-accent)' : 'var(--green)' }}>{vix.toFixed(1)}</div>
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

                        {/* ─── Regime Parameters (v2) ─── */}
                        {regimeParams && (
                            <div className="analysis-section fade-in" style={{ animationDelay: '0.03s' }}>
                                <div className="card" style={{ padding: '14px 20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', margin: 0 }}>
                                            Regime Parameters
                                        </h3>
                                        <span className={`badge ${
                                            ['STRESS', 'EXTREME'].includes(regimeParams.regime) ? 'badge-red'
                                            : ['HIGH_VOL', 'ELEVATED'].includes(regimeParams.regime) ? 'badge-amber'
                                            : regimeParams.regime === 'NORMAL' ? 'badge-indigo'
                                            : 'badge-green'
                                        }`} style={{ fontSize: 10 }}>
                                            {regimeParams.regime?.replace(/_/g, ' ')}
                                        </span>
                                        {regimeParams.stress_adjusted && (
                                            <span className="badge badge-red" style={{ fontSize: 9 }}>STRESS</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                                        {[
                                            ['Min Score', regimeParams.min_score?.toFixed(1)],
                                            ['Max Positions', regimeParams.max_positions],
                                            ['Max/Sector', regimeParams.max_per_sector],
                                            ['Spread Width', `$${regimeParams.spread_width?.toFixed(2)}`],
                                            ['Earnings Buffer', `${regimeParams.earnings_buffer_days}d`],
                                        ].map(([label, val]) => (
                                            <div key={label} style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                                                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>{val}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

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
                                                    const isDbFallback = m.data_source === 'local_db';
                                                    const sessionLabel = m.session === 'pre_market' ? 'Pre' : m.session === 'post_market' ? 'AH' : null;
                                                    return (
                                                        <tr key={m.symbol}>
                                                            <td className="symbol">{m.symbol}</td>
                                                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.name || m.symbol}</td>
                                                            <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }} title={isDbFallback && m.as_of ? `Close ${m.as_of}` : m.session === 'pre_market' ? 'Pre-market price' : m.session === 'post_market' ? 'After-hours price' : undefined}>
                                                                {fmtPrice}
                                                                {sessionLabel && <span style={{ fontSize: 9, color: 'var(--text-accent)', marginLeft: 4, fontWeight: 600 }}>{sessionLabel}</span>}
                                                            </td>
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

                        {/* ─── Sector / Stock Relative Strength (RRG) ─── */}
                        <div className="card fade-in analysis-section" style={{ animationDelay: '0.2s' }}>
                            <CollapsibleHeader
                                icon={<BarChart3 size={14} style={{ verticalAlign: 'middle' }} />}
                                title={drillSector ? `${drillSector} — Stocks` : 'Sector Relative Strength'}
                                right={drillSector ? (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button onClick={(e) => { e.stopPropagation(); toggleEarningsFilter(); }}
                                            style={{ background: hideEarnings ? 'var(--amber)' : 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 10px', color: hideEarnings ? '#000' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: hideEarnings ? 600 : 400 }}>
                                            {hideEarnings ? 'Earnings hidden' : 'Hide Earnings'}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); resetDrill(); }}
                                            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 10px', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                                            Reset
                                        </button>
                                    </div>
                                ) : (
                                    <span className="badge badge-indigo">{sectors.length} sectors</span>
                                )}
                                collapsed={collapsed.sectors}
                                onToggle={() => toggleSection('sectors')}
                            />
                            <div className={`card-body-collapsible${collapsed.sectors ? ' collapsed' : ''}`}>
                                {sectors.length === 0 ? (
                                    <div className="card-body" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                        Sector data loading...
                                    </div>
                                ) : sectors[0].rs_ratio != null ? (
                                    /* ── v2: RRG Chart + Table with Drill-Down ── */
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
                                        <div style={{ padding: '16px', position: 'relative' }}>
                                            {drillLoading && (
                                                <div style={{ position: 'absolute', top: 16, right: 16, color: 'var(--text-muted)', fontSize: 11 }}>Loading...</div>
                                            )}
                                            {drillSector && stockRS.length > 0 ? (
                                                <RRGChart
                                                    data={stockRS.map(s => ({
                                                        sector: s.sector,
                                                        etf: s.symbol,
                                                        industry: s.industry || null,
                                                        rsRatio: s.rs_ratio,
                                                        rsMomentum: s.rs_momentum,
                                                        quadrant: s.quadrant,
                                                        trail: s.trail,
                                                        daysToEarnings: s.days_to_earnings,
                                                    }))}
                                                    width={630}
                                                    height={500}
                                                    onSectorClick={(s) => {
                                                        const url = `${window.location.origin}?page=analysis&symbol=${s.etf}`;
                                                        window.open(url, '_blank');
                                                    }}
                                                />
                                            ) : drillSector && !drillLoading ? (
                                                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                                                    All {drillSector} stocks have earnings within 45 days.
                                                    <br />
                                                    <button onClick={() => { setHideEarnings(false); drillIntoSector(drillSector, false); }}
                                                        style={{ marginTop: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '5px 14px', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                                                        Show all stocks
                                                    </button>
                                                </div>
                                            ) : (
                                                <RRGChart
                                                    data={sectors.map(s => ({
                                                        sector: s.sector,
                                                        etf: s.etf,
                                                        rsRatio: s.rs_ratio,
                                                        rsMomentum: s.rs_momentum,
                                                        quadrant: s.quadrant,
                                                        trail: s.trail,
                                                    }))}
                                                    width={630}
                                                    height={500}
                                                    onSectorClick={(s) => drillIntoSector(s.sector)}
                                                />
                                            )}
                                        </div>
                                        {!drillSector && (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>Sector</th><th>ETF</th><th>Quadrant</th><th style={{ textAlign: 'right' }}>RS Ratio</th><th style={{ textAlign: 'right' }}>RS Mom</th><th style={{ textAlign: 'right' }}>Mod</th></tr>
                                                </thead>
                                                <tbody>
                                                    {sectors.map((s, i) => (
                                                        <tr key={i} onClick={() => drillIntoSector(s.sector)}
                                                            style={{ cursor: 'pointer' }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                                                            <td style={{ fontWeight: 600 }}>{s.sector}</td>
                                                            <td className="symbol">{s.etf}</td>
                                                            <td><QuadrantBadge quadrant={s.quadrant} /></td>
                                                            <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: s.rs_ratio >= 100 ? 'var(--green)' : 'var(--red)' }}>
                                                                {s.rs_ratio.toFixed(2)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: s.rs_momentum >= 100 ? 'var(--green)' : 'var(--red)' }}>
                                                                {s.rs_momentum.toFixed(2)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: s.score_modifier > 0 ? 'var(--green)' : s.score_modifier < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                                                                {s.score_modifier > 0 ? '+' : ''}{s.score_modifier.toFixed(1)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        )}
                                    </div>
                                ) : (
                                    /* ── v1 fallback: legacy momentum table ── */
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
                                                            {s.momentum_factor?.toFixed(3) ?? '—'}
                                                        </td>
                                                        <td><QuadrantBadge quadrant={s.regime} /></td>
                                                        <td style={{ textAlign: 'right', color: s.rs_30d >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
                                                            {s.rs_30d >= 0 ? '+' : ''}{s.rs_30d?.toFixed(2) ?? '—'}%
                                                        </td>
                                                        <td style={{ textAlign: 'right', color: s.rs_60d >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
                                                            {s.rs_60d >= 0 ? '+' : ''}{s.rs_60d?.toFixed(2) ?? '—'}%
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{s.breadth?.toFixed(3) ?? '—'}</td>
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
