import { useState, useEffect, useRef } from 'react';
import { Search, BarChart3, Zap, Newspaper, Users, Target, Activity, ChevronDown, Info } from 'lucide-react';
import { fetchAnalysisJson } from '../api';

// ──────────────────────────────────────────────────────────
// Mock data generator
// ──────────────────────────────────────────────────────────

function generateMockAnalysis(sym) {
    const seed = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rng = (min, max) => min + ((seed * 9301 + 49297) % 233280) / 233280 * (max - min);
    const price = parseFloat((rng(80, 600)).toFixed(2));

    return {
        symbol: sym,
        price,
        change: parseFloat((rng(-3, 5)).toFixed(2)),
        stability: Math.round(rng(70, 98)),
        winRate: parseFloat((rng(75, 98)).toFixed(1)),
        sector: ['Technology', 'Healthcare', 'Financial', 'Consumer Cyc.', 'Industrials'][Math.round(rng(0, 4))],
        ivRank: Math.round(rng(15, 85)),
        ivPercentile: Math.round(rng(20, 90)),
        ivCurrent: parseFloat((rng(18, 65)).toFixed(1)),
        iv30d: parseFloat((rng(20, 55)).toFixed(1)),
        iv1y: parseFloat((rng(22, 60)).toFixed(1)),
        hvCurrent: parseFloat((rng(15, 50)).toFixed(1)),
        earningsDays: Math.round(rng(10, 80)),

        strategies: [
            { name: 'Pullback', score: parseFloat((rng(4, 9)).toFixed(1)), signal: rng(0, 1) > 0.5 ? 'Strong' : 'Moderate', components: { rsi: parseFloat((rng(0.5, 3.5)).toFixed(1)), support: parseFloat((rng(0.5, 2.5)).toFixed(1)), fibonacci: parseFloat((rng(0.3, 2.0)).toFixed(1)), volume: parseFloat((rng(0.2, 1.5)).toFixed(1)), ma: parseFloat((rng(0.2, 1.0)).toFixed(1)) } },
            { name: 'Trend', score: parseFloat((rng(3, 8)).toFixed(1)), signal: rng(0, 1) > 0.6 ? 'Strong' : 'Moderate', components: { sma_alignment: parseFloat((rng(0.5, 2.5)).toFixed(1)), stability: parseFloat((rng(0.5, 2.0)).toFixed(1)), buffer: parseFloat((rng(0.3, 2.0)).toFixed(1)), momentum: parseFloat((rng(0.2, 1.5)).toFixed(1)), volatility: parseFloat((rng(0.1, 1.0)).toFixed(1)) } },
            { name: 'Bounce', score: parseFloat((rng(2, 7)).toFixed(1)), signal: rng(0, 1) > 0.7 ? 'Moderate' : 'Weak', components: { support: parseFloat((rng(0.3, 2.0)).toFixed(1)), rsi: parseFloat((rng(0.2, 1.5)).toFixed(1)), volume: parseFloat((rng(0.2, 1.2)).toFixed(1)), confirmation: parseFloat((rng(0.1, 1.0)).toFixed(1)), trend: parseFloat((rng(0.1, 0.8)).toFixed(1)) } },
        ],

        levels: {
            resistances: [
                { price: parseFloat((price * 1.12).toFixed(2)), strength: 92, type: 'ATH', touches: 1 },
                { price: parseFloat((price * 1.08).toFixed(2)), strength: 78, type: 'Fib 1.618', touches: 2 },
                { price: parseFloat((price * 1.04).toFixed(2)), strength: 65, type: 'SMA 50', touches: 3 },
            ],
            supports: [
                { price: parseFloat((price * 0.97).toFixed(2)), strength: 85, type: 'SMA 20', touches: 4 },
                { price: parseFloat((price * 0.93).toFixed(2)), strength: 90, type: 'Fib 0.618', touches: 5 },
                { price: parseFloat((price * 0.88).toFixed(2)), strength: 72, type: 'SMA 200', touches: 3 },
                { price: parseFloat((price * 0.82).toFixed(2)), strength: 55, type: 'Prior Low', touches: 2 },
            ],
        },

        news: [
            { title: `${sym} beats Q4 earnings expectations with strong revenue growth`, source: 'Reuters', time: '2h ago', sentiment: 'positive' },
            { title: `Analysts raise price target for ${sym} after guidance update`, source: 'Bloomberg', time: '4h ago', sentiment: 'positive' },
            { title: `${sym} announces $5B stock buyback program`, source: 'CNBC', time: '6h ago', sentiment: 'positive' },
            { title: `Sector rotation may impact ${sym} momentum in coming weeks`, source: 'MarketWatch', time: '12h ago', sentiment: 'neutral' },
            { title: `Rising yields weigh on ${sym} and tech peers`, source: 'WSJ', time: '1d ago', sentiment: 'negative' },
        ],

        analysts: {
            buy: 18,
            overweight: 6,
            hold: 4,
            underweight: 1,
            sell: 1,
            priceTarget: parseFloat((price * 1.18).toFixed(2)),
            high: parseFloat((price * 1.35).toFixed(2)),
            low: parseFloat((price * 0.85).toFixed(2)),
            consensus: 'Buy',
        },

        recommendation: {
            strategy: 'Bull-Put Spread',
            shortStrike: Math.round(price * 0.93 / 5) * 5,
            longStrike: Math.round(price * 0.93 / 5) * 5 - 5,
            shortDelta: -0.18,
            longDelta: -0.12,
            dte: 67,
            expiration: '2026-04-17',
            creditEstimate: '$1.20',
            maxRisk: '$380',
            returnOnRisk: '31.6%',
            dataSource: 'calculated',
        },
    };
}

// ── Map API response to component format ──

function mapApiAnalysis(data, sym) {
    const mock = generateMockAnalysis(sym);

    const strategies = (data.strategies || []).map(s => {
        const strength = s.strength || '';
        const signal = strength.charAt(0).toUpperCase() + strength.slice(1).toLowerCase();
        const breakdown = s.details?.score_breakdown?.components || {};
        return {
            name: (s.strategy || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            score: s.score ?? 0,
            signal: signal === 'Strong' || signal === 'Moderate' || signal === 'Weak' ? signal : 'Moderate',
            components: {
                rsi: breakdown.rsi?.score ?? 0,
                support: breakdown.support?.score ?? 0,
                fibonacci: breakdown.fibonacci?.score ?? 0,
                volume: breakdown.volume?.score ?? 0,
                ma: breakdown.ma?.score ?? 0,
            },
        };
    });

    const iv = data.iv || {};
    const rec = data.recommendation || {};

    return {
        symbol: sym,
        price: data.price ?? mock.price,
        change: mock.change,
        stability: mock.stability,
        winRate: rec.score ? Math.min(95, 70 + rec.score * 2.5) : mock.winRate,
        sector: mock.sector,
        ivRank: iv.iv_rank ?? mock.ivRank,
        ivPercentile: iv.iv_percentile ?? mock.ivPercentile,
        ivCurrent: iv.current_iv ?? mock.ivCurrent,
        iv30d: mock.iv30d,
        iv1y: mock.iv1y,
        hvCurrent: iv.hv_20 ?? mock.hvCurrent,
        earningsDays: mock.earningsDays,
        strategies: strategies.length > 0 ? strategies : mock.strategies,
        levels: mock.levels,
        news: mock.news,
        analysts: mock.analysts,
        recommendation: mock.recommendation,
        _liveData: strategies.length > 0,
    };
}

// ──────────────────────────────────────────────────────────
// IV Percentile Gauge
// ──────────────────────────────────────────────────────────

function IVPercentileGauge({ percentile, rank, ivCurrent, iv30d, _iv1y, hvCurrent }) {
    const pct = Math.min(Math.max(percentile, 0), 100);
    const angle = (pct / 100) * 180;
    const rad = (Math.PI * (180 - angle)) / 180;
    const cx = 100, cy = 90, r = 70;
    const needleX = cx + r * Math.cos(rad);
    const needleY = cy - r * Math.sin(rad);

    let color = 'var(--green)';
    let label = 'Low';
    let glowBg = 'var(--green-glow)';
    if (pct >= 70) { color = 'var(--red)'; label = 'High'; glowBg = 'var(--red-glow)'; }
    else if (pct >= 40) { color = 'var(--amber)'; label = 'Medium'; glowBg = 'var(--amber-glow)'; }

    return (
        <div className="iv-gauge-wrap">
            <svg viewBox="0 0 200 105" className="iv-gauge-svg">
                <path d="M 15 90 A 85 85 0 0 1 185 90" fill="none" stroke="rgba(71,85,105,0.25)" strokeWidth="10" strokeLinecap="round" />
                <path d="M 15 90 A 85 85 0 0 1 47 27" fill="none" stroke="var(--green)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                <path d="M 47 27 A 85 85 0 0 1 130 13" fill="none" stroke="var(--amber)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                <path d="M 130 13 A 85 85 0 0 1 185 90" fill="none" stroke="var(--red)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="2" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="4" fill={color} />
            </svg>
            <div style={{ textAlign: 'center' }}>
                <div className="iv-gauge-value" style={{ color }}>{pct}%</div>
                <div className="iv-gauge-label" style={{ color, background: glowBg }}>
                    {label} IV
                </div>
            </div>
            <div className="iv-metrics-grid">
                <div className="iv-metric-cell">
                    <div className="metric-label">IV Current</div>
                    <div className="metric-value" style={{ color: 'var(--text-primary)' }}>{ivCurrent}%</div>
                </div>
                <div className="iv-metric-cell">
                    <div className="metric-label">IV Rank</div>
                    <div className="metric-value" style={{ color: 'var(--text-accent)' }}>{rank}</div>
                </div>
                <div className="iv-metric-cell">
                    <div className="metric-label">IV 30d Avg</div>
                    <div className="metric-value" style={{ color: 'var(--text-secondary)' }}>{iv30d}%</div>
                </div>
                <div className="iv-metric-cell">
                    <div className="metric-label">HV Current</div>
                    <div className="metric-value" style={{ color: 'var(--text-secondary)' }}>{hvCurrent}%</div>
                </div>
            </div>
        </div>
    );
}


// ──────────────────────────────────────────────────────────
// Horizontal Support & Resistance Bar
// ──────────────────────────────────────────────────────────

function SRChart({ price, levels }) {
    const allPrices = [
        ...levels.resistances.map(l => l.price),
        ...levels.supports.map(l => l.price),
        price,
    ];
    const minPrice = Math.min(...allPrices) * 0.97;
    const maxPrice = Math.max(...allPrices) * 1.03;
    const range = maxPrice - minPrice;

    const priceToX = (p) => ((p - minPrice) / range) * 100;
    const currentX = priceToX(price);

    const resistancesSorted = [...levels.resistances].sort((a, b) => a.price - b.price);
    const supportsSorted = [...levels.supports].sort((a, b) => b.price - a.price);

    return (
        <div className="sr-hbar-wrap">
            <div className="sr-labels-top">
                {resistancesSorted.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    const dist = ((lvl.price - price) / price * 100).toFixed(1);
                    return (
                        <div key={`r${i}`} className="sr-marker-label resistance" style={{ left: `${x}%` }}>
                            <div className="sr-marker-connector resistance" />
                            <div className="sr-marker-card resistance">
                                <div className="sr-marker-badge resistance">R{levels.resistances.indexOf(lvl) + 1}</div>
                                <div className="sr-marker-info">
                                    <span className="sr-marker-price">${lvl.price}</span>
                                    <span className="sr-marker-pct resistance">+{dist}%</span>
                                </div>
                                <div className="sr-marker-meta">
                                    <span className="sr-marker-type">{lvl.type}</span>
                                    <div className="sr-marker-strength-wrap">
                                        <div className="sr-mini-bar"><div className="sr-mini-fill resistance" style={{ width: `${lvl.strength}%` }} /></div>
                                        <span className="sr-mini-val">{lvl.strength}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="sr-hbar">
                <div className="sr-hbar-track">
                    <div className="sr-hbar-zone support" style={{ width: `${currentX}%` }} />
                    <div className="sr-hbar-zone resistance" style={{ width: `${100 - currentX}%` }} />
                </div>

                {levels.resistances.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    return (
                        <div key={`rt${i}`} className="sr-tick resistance" style={{ left: `${x}%` }}>
                            <div className="sr-tick-line" style={{ height: 6 + (lvl.strength / 100) * 18, opacity: 0.4 + (lvl.strength / 100) * 0.6 }} />
                        </div>
                    );
                })}

                {levels.supports.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    return (
                        <div key={`st${i}`} className="sr-tick support" style={{ left: `${x}%` }}>
                            <div className="sr-tick-line" style={{ height: 6 + (lvl.strength / 100) * 18, opacity: 0.4 + (lvl.strength / 100) * 0.6 }} />
                        </div>
                    );
                })}

                <div className="sr-current-needle" style={{ left: `${currentX}%` }}>
                    <div className="sr-needle-diamond" />
                    <div className="sr-needle-line" />
                    <div className="sr-needle-label">${price}</div>
                </div>
            </div>

            <div className="sr-labels-bottom">
                {supportsSorted.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    const dist = ((price - lvl.price) / price * 100).toFixed(1);
                    return (
                        <div key={`s${i}`} className="sr-marker-label support" style={{ left: `${x}%` }}>
                            <div className="sr-marker-connector support" />
                            <div className="sr-marker-card support">
                                <div className="sr-marker-badge support">S{levels.supports.indexOf(lvl) + 1}</div>
                                <div className="sr-marker-info">
                                    <span className="sr-marker-price">${lvl.price}</span>
                                    <span className="sr-marker-pct support">−{dist}%</span>
                                </div>
                                <div className="sr-marker-meta">
                                    <span className="sr-marker-type">{lvl.type}</span>
                                    <div className="sr-marker-strength-wrap">
                                        <div className="sr-mini-bar"><div className="sr-mini-fill support" style={{ width: `${lvl.strength}%` }} /></div>
                                        <span className="sr-mini-val">{lvl.strength}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="sr-price-axis">
                <span>${minPrice.toFixed(0)}</span>
                <span>${(minPrice + range * 0.25).toFixed(0)}</span>
                <span>${(minPrice + range * 0.5).toFixed(0)}</span>
                <span>${(minPrice + range * 0.75).toFixed(0)}</span>
                <span>${maxPrice.toFixed(0)}</span>
            </div>
        </div>
    );
}


// ──────────────────────────────────────────────────────────
// Skeleton Loading
// ──────────────────────────────────────────────────────────

function AnalysisSkeleton() {
    return (
        <>
            {/* Stat cards skeleton */}
            <div className="grid-4 analysis-section fade-in">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="skeleton skeleton-stat-card" />
                ))}
            </div>
            {/* Strategy + IV row skeleton */}
            <div className="analysis-strategy-row analysis-section fade-in" style={{ animationDelay: '0.05s' }}>
                <div className="skeleton-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line w-80" />
                    <div className="skeleton skeleton-line w-60" />
                    <div className="skeleton skeleton-line w-100" />
                    <div className="skeleton skeleton-line w-80" style={{ marginTop: 16 }} />
                    <div className="skeleton skeleton-line w-60" />
                </div>
                <div className="skeleton-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line w-60" style={{ margin: '20px auto 10px', height: 80 }} />
                    <div className="skeleton skeleton-line w-40" style={{ margin: '0 auto' }} />
                </div>
            </div>
            {/* S/R skeleton */}
            <div className="skeleton-card analysis-section fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line w-100" style={{ height: 20 }} />
                <div className="skeleton skeleton-line w-80" />
            </div>
        </>
    );
}


// ──────────────────────────────────────────────────────────
// Collapsible Card Header
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
// Section Anchors
// ──────────────────────────────────────────────────────────

const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'strategies', label: 'Strategies' },
    { id: 'sr', label: 'S&R' },
    { id: 'analysts', label: 'Analysts' },
    { id: 'news', label: 'News' },
    { id: 'tradeRec', label: 'Trade Rec' },
];

const POPULAR_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'SPY', 'QQQ'];


// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Analysis({ initialSymbol, onSymbolConsumed }) {
    const [symbol, setSymbol] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [collapsed, setCollapsed] = useState({});
    const hasConsumed = useRef(false);

    // Section refs for anchor nav
    const sectionRefs = {
        overview: useRef(null),
        strategies: useRef(null),
        sr: useRef(null),
        analysts: useRef(null),
        news: useRef(null),
        tradeRec: useRef(null),
    };

    useEffect(() => {
        if (initialSymbol && !hasConsumed.current) {
            hasConsumed.current = true;
            setSymbol(initialSymbol);
            runAnalysis(initialSymbol);
            onSymbolConsumed?.();
        }
        return () => { hasConsumed.current = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSymbol]);

    const addRecentSearch = (s) => {
        setRecentSearches(prev => {
            const filtered = prev.filter(x => x !== s);
            return [s, ...filtered].slice(0, 5);
        });
    };

    const [demoMode, setDemoMode] = useState(false);

    const runAnalysis = async (sym) => {
        const s = (sym || symbol).trim().toUpperCase();
        if (!s) return;
        setLoading(true);
        setSymbol(s);
        addRecentSearch(s);
        try {
            const data = await fetchAnalysisJson(s);
            if (data.error) throw new Error(data.error);
            setResult(mapApiAnalysis(data, s));
            setDemoMode(false);
        } catch {
            setResult(generateMockAnalysis(s));
            setDemoMode(true);
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = () => runAnalysis(symbol);

    const toggleSection = (id) => {
        setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const scrollToSection = (id) => {
        sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <>
            <div className="page-header">
                <h2>Analysis</h2>
                <p>Multi-strategy scoring, support & resistance, IV analysis, news, and analyst consensus</p>
                {demoMode && (
                    <span style={{ fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Info size={12} /> Demo mode — using simulated data
                    </span>
                )}
            </div>

            <div className="page-content">
                {/* Sticky Search Bar */}
                <div className="analysis-search-sticky">
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="form-label">Symbol</label>
                            <input
                                className="form-input"
                                placeholder="Enter ticker (e.g. AAPL)"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading} style={{ height: 42 }}>
                            {loading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Search size={14} />}
                            Analyze
                        </button>
                    </div>

                    {/* Recent searches chips */}
                    {recentSearches.length > 0 && (
                        <div className="analysis-chips-row">
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Recent:</span>
                            {recentSearches.map(s => (
                                <button key={s} className="analysis-chip" onClick={() => runAnalysis(s)}>{s}</button>
                            ))}
                        </div>
                    )}

                    {/* Section anchor nav — only when results exist */}
                    {result && !loading && (
                        <div className="analysis-anchor-nav">
                            <div className="tabs">
                                {SECTIONS.map(sec => (
                                    <button key={sec.id} className="tab" onClick={() => scrollToSection(sec.id)}>
                                        {sec.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Loading Skeleton */}
                {loading && <AnalysisSkeleton />}

                {result && !loading && (
                    <>
                        {/* ─── Overview Stats ─── */}
                        <div ref={sectionRefs.overview} className="grid-4 analysis-section fade-in">
                            <div className="stat-card">
                                <div className="stat-label">Symbol</div>
                                <div className="stat-value" style={{ fontSize: 24 }}>{result.symbol}</div>
                                <div className="stat-change" style={{ color: 'var(--text-muted)' }}>{result.sector}</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Price</div>
                                <div className="stat-value indigo">${result.price}</div>
                                <div className="stat-change" style={{ color: result.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                    {result.change >= 0 ? '+' : ''}{result.change}%
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Stability / Win Rate</div>
                                <div className="stat-value green">{result.stability}</div>
                                <div className="stat-change" style={{ color: 'var(--green)' }}>{result.winRate}% win rate</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Earnings</div>
                                <div className="stat-value amber">{result.earningsDays}d</div>
                                <div className="stat-change" style={{ color: 'var(--text-muted)' }}>until next report</div>
                            </div>
                        </div>

                        {/* ─── Strategy Scores + IV Percentile row ─── */}
                        <div ref={sectionRefs.strategies} className="analysis-strategy-row analysis-section">
                            {/* Strategy Scores */}
                            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
                                <CollapsibleHeader
                                    icon={<BarChart3 size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Strategy Scores"
                                    collapsed={collapsed.strategies}
                                    onToggle={() => toggleSection('strategies')}
                                />
                                <div className={`card-body-collapsible${collapsed.strategies ? ' collapsed' : ''}`}>
                                    <div className="card-body">
                                        <div className="strategy-list">
                                            {result.strategies.map((s) => (
                                                <div key={s.name}>
                                                    <div className="strategy-item-header">
                                                        <div className="strategy-name">
                                                            <span>{s.name}</span>
                                                            <span className={`badge ${s.signal === 'Strong' ? 'badge-green' : s.signal === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>{s.signal}</span>
                                                        </div>
                                                        <span className="strategy-score-value" style={{ color: s.score >= 7 ? 'var(--green)' : s.score >= 5 ? 'var(--amber)' : 'var(--text-muted)' }}>{s.score.toFixed(1)}</span>
                                                    </div>
                                                    <div className="strategy-score-track">
                                                        <div className="strategy-score-fill" style={{
                                                            width: `${(s.score / 10) * 100}%`,
                                                            background: s.score >= 7 ? 'linear-gradient(90deg, var(--green), #34d399)' : s.score >= 5 ? 'linear-gradient(90deg, var(--amber), #fbbf24)' : 'linear-gradient(90deg, var(--text-muted), var(--border-subtle))',
                                                        }} />
                                                    </div>
                                                    <div className="strategy-components">
                                                        {Object.entries(s.components).map(([key, val]) => (
                                                            <span key={key} className="strategy-component-chip">
                                                                {key}: <strong>{val.toFixed(1)}</strong>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* IV Percentile */}
                            <div className="card fade-in" style={{ animationDelay: '0.08s' }}>
                                <CollapsibleHeader
                                    icon={<Activity size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="IV Percentile"
                                    collapsed={collapsed.iv}
                                    onToggle={() => toggleSection('iv')}
                                />
                                <div className={`card-body-collapsible${collapsed.iv ? ' collapsed' : ''}`}>
                                    <div className="card-body">
                                        <IVPercentileGauge
                                            percentile={result.ivPercentile}
                                            rank={result.ivRank}
                                            ivCurrent={result.ivCurrent}
                                            iv30d={result.iv30d}
                                            iv1y={result.iv1y}
                                            hvCurrent={result.hvCurrent}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Support & Resistance (graphical) ─── */}
                        <div ref={sectionRefs.sr} className="card fade-in analysis-section" style={{ animationDelay: '0.1s' }}>
                            <CollapsibleHeader
                                icon={<Target size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Support & Resistance"
                                right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current: ${result.price}</span>}
                                collapsed={collapsed.sr}
                                onToggle={() => toggleSection('sr')}
                            />
                            <div className={`card-body-collapsible${collapsed.sr ? ' collapsed' : ''}`}>
                                <div className="card-body">
                                    <div className="sr-chart-scroll">
                                        <SRChart price={result.price} levels={result.levels} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid-2 analysis-section">
                            {/* ─── Analyst Scoring ─── */}
                            <div ref={sectionRefs.analysts} className="card fade-in" style={{ animationDelay: '0.15s' }}>
                                <CollapsibleHeader
                                    icon={<Users size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Analyst Consensus"
                                    right={<><span className="badge badge-amber" style={{ fontSize: 10, marginRight: 4 }}>Sample data</span><span className={`badge ${result.analysts.consensus === 'Buy' ? 'badge-green' : 'badge-amber'}`}>{result.analysts.consensus}</span></>}
                                    collapsed={collapsed.analysts}
                                    onToggle={() => toggleSection('analysts')}
                                />
                                <div className={`card-body-collapsible${collapsed.analysts ? ' collapsed' : ''}`}>
                                    <div className="card-body">
                                        <div className="analyst-bar-container">
                                            {(() => {
                                                const a = result.analysts;
                                                const total = a.buy + a.overweight + a.hold + a.underweight + a.sell;
                                                return (
                                                    <>
                                                        <div className="analyst-segment buy" style={{ width: `${(a.buy / total) * 100}%` }}>{a.buy}</div>
                                                        <div className="analyst-segment overweight" style={{ width: `${(a.overweight / total) * 100}%` }}>{a.overweight}</div>
                                                        <div className="analyst-segment hold" style={{ width: `${(a.hold / total) * 100}%` }}>{a.hold}</div>
                                                        {a.underweight > 0 && <div className="analyst-segment underweight" style={{ width: `${(a.underweight / total) * 100}%` }}>{a.underweight}</div>}
                                                        {a.sell > 0 && <div className="analyst-segment sell" style={{ width: `${(a.sell / total) * 100}%` }}>{a.sell}</div>}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                            <span style={{ color: 'var(--green)' }}>● Buy</span>
                                            <span style={{ color: 'rgba(16,185,129,0.6)' }}>● Overweight</span>
                                            <span style={{ color: 'var(--amber)' }}>● Hold</span>
                                            <span style={{ color: 'rgba(239,68,68,0.6)' }}>● Underweight</span>
                                            <span style={{ color: 'var(--red)' }}>● Sell</span>
                                        </div>
                                        <div className="analyst-grid">
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Buy</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--green)' }}>{result.analysts.buy}</div>
                                            </div>
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Hold</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--amber)' }}>{result.analysts.hold}</div>
                                            </div>
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Sell</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--red)' }}>{result.analysts.sell}</div>
                                            </div>
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Target</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--text-accent)' }}>${result.analysts.priceTarget}</div>
                                            </div>
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Range</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>${result.analysts.low}–${result.analysts.high}</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Price Target vs Current</div>
                                            <div style={{ position: 'relative', height: 8, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: `${((result.price - result.analysts.low) / (result.analysts.high - result.analysts.low)) * 100}%`, width: 3, height: '100%', background: 'var(--text-accent)', zIndex: 2 }} />
                                                <div style={{ width: `${((result.analysts.priceTarget - result.analysts.low) / (result.analysts.high - result.analysts.low)) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--green), #34d399)', borderRadius: 4 }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                                <span>${result.analysts.low}</span>
                                                <span style={{ color: 'var(--text-accent)' }}>Current: ${result.price}</span>
                                                <span>${result.analysts.high}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ─── News ─── */}
                            <div ref={sectionRefs.news} className="card fade-in" style={{ animationDelay: '0.2s' }}>
                                <CollapsibleHeader
                                    icon={<Newspaper size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Recent News"
                                    right={<><span className="badge badge-amber" style={{ fontSize: 10, marginRight: 4 }}>Sample data</span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.news.length} articles</span></>}
                                    collapsed={collapsed.news}
                                    onToggle={() => toggleSection('news')}
                                />
                                <div className={`card-body-collapsible${collapsed.news ? ' collapsed' : ''}`}>
                                    <div className="card-body">
                                        <div className="news-list">
                                            {result.news.map((item, i) => (
                                                <div key={i} className="news-item">
                                                    <div className={`news-sentiment ${item.sentiment}`} />
                                                    <div className="news-content">
                                                        <div className="news-title">{item.title}</div>
                                                        <div className="news-meta">
                                                            <span>{item.source}</span>
                                                            <span>•</span>
                                                            <span>{item.time}</span>
                                                            <span>•</span>
                                                            <span className={`badge ${item.sentiment === 'positive' ? 'badge-green' : item.sentiment === 'negative' ? 'badge-red' : 'badge-indigo'}`}>
                                                                {item.sentiment === 'positive' ? '▲ Bullish' : item.sentiment === 'negative' ? '▼ Bearish' : '— Neutral'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Trade Recommendation ─── */}
                        <div ref={sectionRefs.tradeRec} className="card fade-in" style={{ animationDelay: '0.25s' }}>
                            <CollapsibleHeader
                                icon={<Zap size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Trade Recommendation"
                                right={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {result.recommendation.dataSource === 'live' ? (
                                            <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                                                Live Data
                                            </span>
                                        ) : (
                                            <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                                                Calculated
                                            </span>
                                        )}
                                        <span className="badge badge-green">Ready</span>
                                    </div>
                                }
                                collapsed={collapsed.tradeRec}
                                onToggle={() => toggleSection('tradeRec')}
                            />
                            <div className={`card-body-collapsible${collapsed.tradeRec ? ' collapsed' : ''}`}>
                                <div className="card-body">
                                    <div className="grid-4">
                                        <div><span className="trade-rec-label">Strategy</span><div className="trade-rec-value">{result.recommendation.strategy}</div></div>
                                        <div>
                                            <span className="trade-rec-label">Short Strike</span>
                                            <div className="trade-rec-value">{result.recommendation.shortStrike}</div>
                                            <div className="trade-rec-delta">Δ {result.recommendation.shortDelta}</div>
                                        </div>
                                        <div>
                                            <span className="trade-rec-label">Long Strike</span>
                                            <div className="trade-rec-value">{result.recommendation.longStrike}</div>
                                            <div className="trade-rec-delta">Δ {result.recommendation.longDelta}</div>
                                        </div>
                                        <div><span className="trade-rec-label">DTE</span><div className="trade-rec-value">{result.recommendation.dte} days</div></div>
                                        <div><span className="trade-rec-label">Expiration</span><div className="trade-rec-value">{result.recommendation.expiration}</div></div>
                                        <div><span className="trade-rec-label">Credit</span><div className="trade-rec-value" style={{ color: 'var(--green)' }}>{result.recommendation.creditEstimate}</div></div>
                                        <div><span className="trade-rec-label">Max Risk</span><div className="trade-rec-value" style={{ color: 'var(--red)' }}>{result.recommendation.maxRisk}</div></div>
                                        <div><span className="trade-rec-label">Return on Risk</span><div className="trade-rec-value" style={{ color: 'var(--green)' }}>{result.recommendation.returnOnRisk}</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Enhanced Empty State */}
                {!result && !loading && (
                    <div className="empty-state fade-in">
                        <BarChart3 size={48} />
                        <h3>Enter a symbol to begin analysis</h3>
                        <p>Get multi-strategy scoring, support & resistance levels, IV analysis, news, and analyst consensus.</p>
                        <div style={{ marginTop: 20 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Popular tickers</div>
                            <div className="analysis-chips-row" style={{ justifyContent: 'center' }}>
                                {POPULAR_TICKERS.map(t => (
                                    <button key={t} className="analysis-chip" onClick={() => { setSymbol(t); runAnalysis(t); }}>{t}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
