import { useState, useEffect, useRef } from 'react';
import { Search, BarChart3, TrendingUp, TrendingDown, Shield, Zap, Newspaper, Users, ArrowUp, ArrowDown, Minus, Target, Activity } from 'lucide-react';

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
            dataSource: 'calculated', // 'live' when real market data is available
        },
    };
}

// ──────────────────────────────────────────────────────────
// IV Percentile Gauge
// ──────────────────────────────────────────────────────────

function IVPercentileGauge({ percentile, rank, ivCurrent, iv30d, iv1y, hvCurrent }) {
    // Arc gauge
    const pct = Math.min(Math.max(percentile, 0), 100);
    const angle = (pct / 100) * 180;
    const rad = (Math.PI * (180 - angle)) / 180;
    const cx = 100, cy = 90, r = 70;
    const needleX = cx + r * Math.cos(rad);
    const needleY = cy - r * Math.sin(rad);

    let color = 'var(--green)';
    let label = 'Low';
    if (pct >= 70) { color = 'var(--red)'; label = 'High'; }
    else if (pct >= 40) { color = 'var(--amber)'; label = 'Medium'; }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <svg viewBox="0 0 200 105" style={{ width: 200, height: 105 }}>
                {/* Background arc */}
                <path d="M 15 90 A 85 85 0 0 1 185 90" fill="none" stroke="rgba(71,85,105,0.25)" strokeWidth="10" strokeLinecap="round" />
                {/* Green zone 0-40% */}
                <path d="M 15 90 A 85 85 0 0 1 47 27" fill="none" stroke="var(--green)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                {/* Amber zone 40-70% */}
                <path d="M 47 27 A 85 85 0 0 1 130 13" fill="none" stroke="var(--amber)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                {/* Red zone 70-100% */}
                <path d="M 130 13 A 85 85 0 0 1 185 90" fill="none" stroke="var(--red)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
                {/* Needle */}
                <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="2" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="4" fill={color} />
            </svg>
            <div style={{ textAlign: 'center', marginTop: -4 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 4, padding: '2px 12px', borderRadius: 12, background: color === 'var(--green)' ? 'var(--green-glow)' : color === 'var(--amber)' ? 'var(--amber-glow)' : 'var(--red-glow)', display: 'inline-block' }}>
                    {label} IV
                </div>
            </div>
            {/* IV metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', marginTop: 8 }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(71,85,105,0.2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>IV Current</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{ivCurrent}%</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(71,85,105,0.2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>IV Rank</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-accent)', marginTop: 2 }}>{rank}</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(71,85,105,0.2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>IV 30d Avg</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2 }}>{iv30d}%</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(71,85,105,0.2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>HV Current</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2 }}>{hvCurrent}%</div>
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

    // Maps a price to a horizontal percentage (0% = left, 100% = right)
    const priceToX = (p) => ((p - minPrice) / range) * 100;
    const currentX = priceToX(price);

    // Stagger labels above/below to avoid overlap
    // Resistances go above, supports go below
    const resistancesSorted = [...levels.resistances].sort((a, b) => a.price - b.price);
    const supportsSorted = [...levels.supports].sort((a, b) => b.price - a.price);

    return (
        <div className="sr-hbar-wrap">
            {/* Resistance labels (above the bar) */}
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

            {/* The main horizontal bar */}
            <div className="sr-hbar">
                {/* Background gradient: green left, red right with current in middle */}
                <div className="sr-hbar-track">
                    {/* Support zone (left of current) */}
                    <div className="sr-hbar-zone support" style={{ width: `${currentX}%` }} />
                    {/* Resistance zone (right of current) */}
                    <div className="sr-hbar-zone resistance" style={{ width: `${100 - currentX}%` }} />
                </div>

                {/* Resistance tick marks on the bar */}
                {levels.resistances.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    return (
                        <div key={`rt${i}`} className="sr-tick resistance" style={{ left: `${x}%` }}>
                            <div className="sr-tick-line" style={{ height: 6 + (lvl.strength / 100) * 18, opacity: 0.4 + (lvl.strength / 100) * 0.6 }} />
                        </div>
                    );
                })}

                {/* Support tick marks on the bar */}
                {levels.supports.map((lvl, i) => {
                    const x = priceToX(lvl.price);
                    return (
                        <div key={`st${i}`} className="sr-tick support" style={{ left: `${x}%` }}>
                            <div className="sr-tick-line" style={{ height: 6 + (lvl.strength / 100) * 18, opacity: 0.4 + (lvl.strength / 100) * 0.6 }} />
                        </div>
                    );
                })}

                {/* Current price needle */}
                <div className="sr-current-needle" style={{ left: `${currentX}%` }}>
                    <div className="sr-needle-diamond" />
                    <div className="sr-needle-line" />
                    <div className="sr-needle-label">${price}</div>
                </div>
            </div>

            {/* Support labels (below the bar) */}
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

            {/* Price axis labels */}
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
// Main Component
// ──────────────────────────────────────────────────────────

export default function Analysis({ initialSymbol, onSymbolConsumed }) {
    const [symbol, setSymbol] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const hasConsumed = useRef(false);

    useEffect(() => {
        if (initialSymbol && !hasConsumed.current) {
            hasConsumed.current = true;
            setSymbol(initialSymbol);
            runAnalysis(initialSymbol);
            onSymbolConsumed?.();
        }
        return () => { hasConsumed.current = false; };
    }, [initialSymbol]);

    const runAnalysis = (sym) => {
        const s = (sym || symbol).trim().toUpperCase();
        if (!s) return;
        setLoading(true);
        setSymbol(s);
        setTimeout(() => {
            setResult(generateMockAnalysis(s));
            setLoading(false);
        }, 800);
    };

    const handleAnalyze = () => runAnalysis(symbol);

    return (
        <>
            <div className="page-header">
                <h2>Analysis</h2>
                <p>Multi-strategy scoring, support & resistance, IV analysis, news, and analyst consensus</p>
            </div>

            <div className="page-content">
                {/* Search */}
                <div className="card fade-in" style={{ marginBottom: 20 }}>
                    <div className="card-body">
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
                    </div>
                </div>

                {loading && (
                    <div className="loading-spinner" style={{ minHeight: 300 }}><div className="spinner" /></div>
                )}

                {result && !loading && (
                    <>
                        {/* ─── Overview Stats ─── */}
                        <div className="grid-4 fade-in" style={{ marginBottom: 20 }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 20 }}>
                            {/* Strategy Scores */}
                            <div className="card fade-in" style={{ animationDelay: '0.05s' }}>
                                <div className="card-header">
                                    <h3><BarChart3 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Strategy Scores</h3>
                                </div>
                                <div className="card-body">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {result.strategies.map((s) => (
                                            <div key={s.name}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                                                        <span className={`badge ${s.signal === 'Strong' ? 'badge-green' : s.signal === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>{s.signal}</span>
                                                    </div>
                                                    <span style={{ fontWeight: 700, fontSize: 18, color: s.score >= 7 ? 'var(--green)' : s.score >= 5 ? 'var(--amber)' : 'var(--text-muted)' }}>{s.score.toFixed(1)}</span>
                                                </div>
                                                <div style={{ height: 8, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                                                    <div style={{
                                                        width: `${(s.score / 10) * 100}%`, height: '100%',
                                                        background: s.score >= 7 ? 'linear-gradient(90deg, var(--green), #34d399)' : s.score >= 5 ? 'linear-gradient(90deg, var(--amber), #fbbf24)' : 'linear-gradient(90deg, var(--text-muted), var(--border-subtle))',
                                                        borderRadius: 4, transition: 'width 0.5s ease',
                                                    }} />
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {Object.entries(s.components).map(([key, val]) => (
                                                        <span key={key} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-input)', borderRadius: 4, color: 'var(--text-secondary)' }}>
                                                            {key}: <strong style={{ color: 'var(--text-primary)' }}>{val.toFixed(1)}</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* IV Percentile */}
                            <div className="card fade-in" style={{ animationDelay: '0.08s' }}>
                                <div className="card-header">
                                    <h3><Activity size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> IV Percentile</h3>
                                </div>
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

                        {/* ─── Support & Resistance (graphical) ─── */}
                        <div className="card fade-in" style={{ animationDelay: '0.1s', marginBottom: 20 }}>
                            <div className="card-header">
                                <h3><Target size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Support & Resistance</h3>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current: ${result.price} · Strength = historical confidence</span>
                            </div>
                            <div className="card-body">
                                <SRChart price={result.price} levels={result.levels} />
                            </div>
                        </div>

                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            {/* ─── Analyst Scoring ─── */}
                            <div className="card fade-in" style={{ animationDelay: '0.15s' }}>
                                <div className="card-header">
                                    <h3><Users size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Analyst Consensus</h3>
                                    <span className={`badge ${result.analysts.consensus === 'Buy' ? 'badge-green' : 'badge-amber'}`}>{result.analysts.consensus}</span>
                                </div>
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

                            {/* ─── News ─── */}
                            <div className="card fade-in" style={{ animationDelay: '0.2s' }}>
                                <div className="card-header">
                                    <h3><Newspaper size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Recent News</h3>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.news.length} articles</span>
                                </div>
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

                        {/* ─── Trade Recommendation ─── */}
                        <div className="card fade-in" style={{ animationDelay: '0.25s' }}>
                            <div className="card-header">
                                <h3><Zap size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Trade Recommendation</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {result.recommendation.dataSource === 'live' ? (
                                        <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                                            Live Data
                                        </span>
                                    ) : (
                                        <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                                            Calculated · No live data
                                        </span>
                                    )}
                                    <span className="badge badge-green">Ready</span>
                                </div>
                            </div>
                            <div className="card-body">
                                <div className="grid-4">
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Strategy</span><div style={{ fontWeight: 600, marginTop: 4 }}>{result.recommendation.strategy}</div></div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Short Strike</span>
                                        <div style={{ fontWeight: 600, marginTop: 4 }}>{result.recommendation.shortStrike}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-accent)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>Δ {result.recommendation.shortDelta}</div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Long Strike</span>
                                        <div style={{ fontWeight: 600, marginTop: 4 }}>{result.recommendation.longStrike}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-accent)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>Δ {result.recommendation.longDelta}</div>
                                    </div>
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>DTE</span><div style={{ fontWeight: 600, marginTop: 4 }}>{result.recommendation.dte} days</div></div>
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Expiration</span><div style={{ fontWeight: 600, marginTop: 4 }}>{result.recommendation.expiration}</div></div>
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Credit</span><div style={{ fontWeight: 600, marginTop: 4, color: 'var(--green)' }}>{result.recommendation.creditEstimate}</div></div>
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Max Risk</span><div style={{ fontWeight: 600, marginTop: 4, color: 'var(--red)' }}>{result.recommendation.maxRisk}</div></div>
                                    <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Return on Risk</span><div style={{ fontWeight: 600, marginTop: 4, color: 'var(--green)' }}>{result.recommendation.returnOnRisk}</div></div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {!result && !loading && (
                    <div className="empty-state fade-in">
                        <BarChart3 size={48} />
                        <h3>Enter a symbol to begin analysis</h3>
                        <p>Get multi-strategy scoring, support & resistance levels, IV analysis, news, and analyst consensus.</p>
                    </div>
                )}
            </div>
        </>
    );
}
