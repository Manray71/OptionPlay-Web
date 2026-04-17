import { useState, useEffect, useRef } from 'react';
import { Search, BarChart3, Zap, Newspaper, Users, Target, Activity, ChevronDown, Info, TrendingUp, Download } from 'lucide-react';
import { fetchAnalysisJson } from '../api';
import { exportAnalysisPdf } from '../utils/exportAnalysisPdf';

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

// ── Extract best display value from a score component ──

function _componentDisplay(key, val) {
    if (typeof val !== 'object') return null;
    // Per-component display value extraction
    switch (key) {
        case 'rsi':          return val.value != null ? `${Number(val.value).toFixed(1)}` : null;
        case 'rsi_divergence': return val.type || null;
        case 'support':      return val.distance_pct != null ? `${Number(val.distance_pct).toFixed(1)}%` : null;
        case 'fibonacci':    return val.level != null ? `${val.level}` : null;
        case 'moving_averages': return val.reason || null;
        case 'trend_strength': return val.alignment || null;
        case 'volume':       return val.ratio != null ? `${Number(val.ratio).toFixed(1)}x` : null;
        case 'macd':         return val.signal || (val.histogram != null ? `${Number(val.histogram).toFixed(3)}` : null);
        case 'stochastic': {
            if (val.k == null) return null;
            const k = Number(val.k), d = Number(val.d);
            const sl = k < 20 ? 'oversold' : k > 80 ? 'overbought' : k > d ? 'bullish' : k < d ? 'bearish' : 'neutral';
            return `${sl} (${k.toFixed(0)}/${d.toFixed(0)})`;
        }
        case 'keltner':      return val.position || (val.percent != null ? `${(Number(val.percent) * 100).toFixed(0)}%` : null);
        case 'vwap':         return val.distance_pct != null ? `${Number(val.distance_pct).toFixed(1)}%` : null;
        case 'market_context': return val.spy_trend || null;
        case 'sector':       return val.name || null;
        case 'candlestick':  return val.pattern || null;
        case 'gap':          return val.size_pct != null ? `${Number(val.size_pct).toFixed(1)}%` : null;
        case 'trend':        return val.status || null;
        default:             return val.reason || null;
    }
}

// ── Map API response to component format ──

function mapApiAnalysis(data, sym) {
    const mock = generateMockAnalysis(sym);

    const rawStrategies = data.strategies || [];
    const strategies = rawStrategies.map(s => {
        const strength = s.strength || '';
        const signal = strength.charAt(0).toUpperCase() + strength.slice(1).toLowerCase();
        const breakdown = s.details?.score_breakdown?.components || {};
        const components = {};
        for (const [key, val] of Object.entries(breakdown)) {
            const score = typeof val === 'object' ? (val.score ?? 0) : (typeof val === 'number' ? val : 0);
            if (score > 0) components[key] = { score, display: _componentDisplay(key, val) };
        }
        return {
            name: (s.strategy || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            score: s.score ?? 0,
            signal: signal === 'Strong' || signal === 'Moderate' || signal === 'Weak' ? signal : 'Moderate',
            components,
        };
    });

    // Extract momentum indicators — merge across all strategies to get the richest data
    const allBreakdowns = rawStrategies.map(s => s.details?.score_breakdown?.components || {});
    const pick = (key, subKey) => {
        for (const bd of allBreakdowns) {
            const v = bd[key]?.[subKey];
            if (v != null) return v;
        }
        return null;
    };
    const bestStrat = rawStrategies.length > 0
        ? rawStrategies.reduce((best, s) => (s.score ?? 0) > (best.score ?? 0) ? s : best, rawStrategies[0])
        : null;
    const bestBd = bestStrat?.details?.score_breakdown?.components || {};
    const momentum = {
        rsi: pick('rsi', 'value') ?? pick('momentum_health', 'rsi'),
        rsiDivergence: pick('rsi_divergence', 'type'),
        rsiDivergenceStrength: pick('rsi_divergence', 'strength'),
        trendStatus: bestBd.trend?.status ?? pick('trend', 'status'),
        trendScore: bestBd.trend?.score ?? pick('sma_alignment', 'score'),
        sma20: pick('sma_alignment', 'sma_20'),
        sma50: pick('sma_alignment', 'sma_50'),
        sma200: pick('sma_alignment', 'sma_200'),
        smaAllRising: pick('sma_alignment', 'all_rising'),
        // Pullback-style SMA position (above/below)
        vsSma20: pick('moving_averages', 'vs_sma20'),
        vsSma200: pick('moving_averages', 'vs_sma200'),
        smaReason: pick('moving_averages', 'reason') ?? pick('trend_strength', 'reason'),
        trendAlignment: pick('trend_strength', 'alignment'),
        sma20Slope: pick('trend_strength', 'sma20_slope'),
        momentumScore: pick('momentum_health', 'score'),
        adx: pick('momentum_health', 'adx'),
        macdBullish: pick('momentum_health', 'macd_bullish') ?? (pick('macd', 'signal') === 'bullish'),
        // MACD from pullback/bounce
        macdSignal: pick('macd', 'signal'),
        macdHistogram: pick('macd', 'histogram'),
        // Stochastic
        stochSignal: pick('stochastic', 'signal'),
        stochK: pick('stochastic', 'k'),
        stochD: pick('stochastic', 'd'),
        // Market context
        marketTrend: bestStrat?.details?.score_breakdown?.market_context?.trend ?? pick('market_context', 'spy_trend'),
    };

    const iv = data.iv || {};
    const rec = data.recommendation || {};

    // Build recommendation from StrikeRecommender data if available
    let recommendation = mock.recommendation;
    if (rec.short_strike && rec.long_strike) {
        const credit = rec.estimated_credit;
        const maxLoss = rec.max_loss;
        const ror = (credit && maxLoss && maxLoss > 0)
            ? `${((credit / (maxLoss / 100)) * 100).toFixed(1)}%`
            : rec.risk_reward_ratio ? `${(rec.risk_reward_ratio * 100).toFixed(1)}%` : null;
        recommendation = {
            strategy: 'Bull-Put Spread',
            shortStrike: rec.short_strike,
            longStrike: rec.long_strike,
            spreadWidth: rec.spread_width,
            shortDelta: rec.estimated_delta ?? mock.recommendation.shortDelta,
            longDelta: rec.long_delta ?? mock.recommendation.longDelta,
            shortStrikeReason: rec.short_strike_reason,
            dte: rec.dte ?? mock.recommendation.dte,
            expiration: rec.expiration ?? mock.recommendation.expiration,
            creditEstimate: credit != null ? `$${credit.toFixed(2)}` : null,
            maxRisk: maxLoss != null ? `$${Math.round(maxLoss).toLocaleString('de-DE')}` : null,
            maxProfit: rec.max_profit != null ? `$${Math.round(rec.max_profit).toLocaleString('de-DE')}` : null,
            breakEven: rec.break_even,
            returnOnRisk: ror,
            quality: rec.quality ?? null,
            confidenceScore: rec.confidence_score ?? null,
            probProfit: rec.prob_profit ?? null,
            warnings: rec.warnings ?? [],
            supportLevel: rec.support_level ?? null,
            dataSource: rec.data_source === 'provider' ? 'live' : rec.data_source ?? 'calculated',
        };
    }

    return {
        symbol: sym,
        price: data.price ?? mock.price,
        change: mock.change,
        stability: mock.stability,
        winRate: rec.top_score ? Math.min(95, 70 + rec.top_score * 2.5) : mock.winRate,
        sector: mock.sector,
        ivRank: iv.iv_rank ?? mock.ivRank,
        ivPercentile: iv.iv_percentile ?? mock.ivPercentile,
        ivCurrent: iv.current_iv ?? mock.ivCurrent,
        iv30d: mock.iv30d,
        iv1y: mock.iv1y,
        hvCurrent: iv.hv_20 ?? mock.hvCurrent,
        earningsDate: data.earnings_date ?? null,
        earningsDays: data.days_to_earnings ?? mock.earningsDays,
        strategies: strategies.length > 0 ? strategies : mock.strategies,
        levels: data.levels && (data.levels.supports?.length || data.levels.resistances?.length)
            ? data.levels
            : mock.levels,
        news: data.news?.length
            ? data.news.map(n => ({
                title: n.title,
                link: n.link || '',
                source: n.publisher || 'Unknown',
                time: n.date || '',
                sentiment: n.sentiment || 'neutral',
            }))
            : mock.news,
        analysts: data.analysts && (data.analysts.total_ratings > 0 || data.analysts.target_median)
            ? {
                buy: data.analysts.buy ?? 0,
                overweight: 0,
                hold: data.analysts.hold ?? 0,
                underweight: 0,
                sell: data.analysts.sell ?? 0,
                priceTarget: data.analysts.target_median ?? mock.analysts.priceTarget,
                high: data.analysts.target_high ?? mock.analysts.high,
                low: data.analysts.target_low ?? mock.analysts.low,
                consensus: data.analysts.sentiment === 'BULLISH' ? 'Buy'
                    : data.analysts.sentiment === 'BEARISH' ? 'Sell' : 'Hold',
            }
            : mock.analysts,
        _newsLive: !!data.news?.length,
        _analystsLive: !!(data.analysts && (data.analysts.total_ratings > 0 || data.analysts.target_median)),
        momentum,
        fallingKnife: data.falling_knife ?? null,
        recommendation,
        _liveData: strategies.length > 0,
        marketOpen: data.market_open ?? true,
        priceSource: data.price_source ?? 'live',
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
// Support & Resistance – Vertical List Layout
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

    // Resistances: highest first (furthest away on top)
    const resistancesSorted = [...levels.resistances].sort((a, b) => b.price - a.price);
    // Supports: highest first (closest to current price on top)
    const supportsSorted = [...levels.supports].sort((a, b) => b.price - a.price);

    const maxStrength = Math.max(
        ...levels.resistances.map(l => l.strength || 0),
        ...levels.supports.map(l => l.strength || 0),
        1,
    );

    return (
        <div className="sr-vertical-wrap">
            {/* ── Mini position bar ── */}
            <div className="sr-minibar">
                <div className="sr-minibar-track">
                    <div className="sr-minibar-zone support" style={{ width: `${currentX}%` }} />
                    <div className="sr-minibar-zone resistance" style={{ width: `${100 - currentX}%` }} />
                    {levels.resistances.map((lvl, i) => (
                        <div key={`rt${i}`} className="sr-minibar-tick resistance" style={{ left: `${priceToX(lvl.price)}%` }} />
                    ))}
                    {levels.supports.map((lvl, i) => (
                        <div key={`st${i}`} className="sr-minibar-tick support" style={{ left: `${priceToX(lvl.price)}%` }} />
                    ))}
                    <div className="sr-minibar-needle" style={{ left: `${currentX}%` }} />
                </div>
                <div className="sr-minibar-labels">
                    <span>${minPrice.toFixed(0)}</span>
                    <span>${maxPrice.toFixed(0)}</span>
                </div>
            </div>

            {/* ── Resistance rows ── */}
            {resistancesSorted.length > 0 && (
                <div className="sr-level-group">
                    {resistancesSorted.map((lvl, i) => {
                        const origIdx = levels.resistances.indexOf(lvl) + 1;
                        const dist = ((lvl.price - price) / price * 100).toFixed(1);
                        const barW = ((lvl.strength || 0) / maxStrength) * 100;
                        return (
                            <div key={`r${i}`} className="sr-level-row resistance">
                                <span className="sr-level-badge resistance">R{origIdx}</span>
                                <span className="sr-level-price">${lvl.price.toFixed(2)}</span>
                                <span className="sr-level-dist resistance">+{dist}%</span>
                                <div className="sr-level-strength">
                                    <div className="sr-level-strength-bar resistance" style={{ width: `${barW}%` }} />
                                </div>
                                <span className="sr-level-meta">{lvl.strength}%</span>
                                <span className="sr-level-touches">{lvl.touches}x</span>
                                <span className="sr-level-type">{lvl.type}{lvl.fib ? ` · ${lvl.fib}` : ''}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Current price divider ── */}
            <div className="sr-current-row">
                <div className="sr-current-line" />
                <span className="sr-current-tag">◆ ${price.toFixed(2)}</span>
                <div className="sr-current-line" />
            </div>

            {/* ── Support rows ── */}
            {supportsSorted.length > 0 && (
                <div className="sr-level-group">
                    {supportsSorted.map((lvl, i) => {
                        const origIdx = levels.supports.indexOf(lvl) + 1;
                        const dist = ((price - lvl.price) / price * 100).toFixed(1);
                        const barW = ((lvl.strength || 0) / maxStrength) * 100;
                        return (
                            <div key={`s${i}`} className="sr-level-row support">
                                <span className="sr-level-badge support">S{origIdx}</span>
                                <span className="sr-level-price">${lvl.price.toFixed(2)}</span>
                                <span className="sr-level-dist support">−{dist}%</span>
                                <div className="sr-level-strength">
                                    <div className="sr-level-strength-bar support" style={{ width: `${barW}%` }} />
                                </div>
                                <span className="sr-level-meta">{lvl.strength}%</span>
                                <span className="sr-level-touches">{lvl.touches}x</span>
                                <span className="sr-level-type">{lvl.type}{lvl.fib ? ` · ${lvl.fib}` : ''}</span>
                            </div>
                        );
                    })}
                </div>
            )}
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
    { id: 'momentum', label: 'Momentum' },
    { id: 'sr', label: 'S&R' },
    { id: 'analysts', label: 'Analysts' },
    { id: 'news', label: 'News' },
    { id: 'tradeRec', label: 'Trade Rec' },
];

const POPULAR_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'SPY', 'QQQ'];


// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function Analysis({ initialSymbol, onSymbolConsumed, analysisCache }) {
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
        momentum: useRef(null),
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
            // Check pre-fetch cache first
            const cached = analysisCache?.current?.[s];
            const data = cached || await fetchAnalysisJson(s);
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
                        <div className="analysis-anchor-nav" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="tabs" style={{ flex: 1 }}>
                                {SECTIONS.map(sec => (
                                    <button key={sec.id} className="tab" onClick={() => scrollToSection(sec.id)}>
                                        {sec.label}
                                    </button>
                                ))}
                            </div>
                            <button className="btn btn-secondary" onClick={() => exportAnalysisPdf(result)} style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                <Download size={12} /> PDF
                            </button>
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
                                <div className="stat-label">Price{!result.marketOpen && ' (Close)'}</div>
                                <div className="stat-value indigo">${Number(result.price).toFixed(2)}</div>
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
                                                        {Object.entries(s.components).map(([key, comp]) => {
                                                            const isObj = typeof comp === 'object' && comp !== null;
                                                            const score = isObj ? comp.score : comp;
                                                            const display = isObj ? comp.display : null;
                                                            return (
                                                                <span key={key} className="strategy-component-chip" title={`Score: ${score.toFixed(1)}`}>
                                                                    {key.replace(/_/g, ' ')}{display ? <>: <strong>{display}</strong></> : <> <strong>{score.toFixed(1)}</strong></>}
                                                                </span>
                                                            );
                                                        })}
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

                        {/* ─── Momentum Indicators ─── */}
                        {result.momentum && result.momentum.rsi != null && (
                            <div ref={sectionRefs.momentum} className="card fade-in analysis-section" style={{ animationDelay: '0.09s' }}>
                                <CollapsibleHeader
                                    icon={<TrendingUp size={14} style={{ verticalAlign: 'middle' }} />}
                                    title="Momentum Indicators"
                                    right={(() => {
                                        const m = result.momentum;
                                        const fk = result.fallingKnife;
                                        const trend = m.trendStatus || m.marketTrend || '';
                                        const label = trend.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                        const isUp = /uptrend|strong/i.test(trend);
                                        const isDown = /down|below|bearish/i.test(trend);
                                        return (
                                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                {fk?.detected && (
                                                    <span className={`badge ${fk.severity === 'severe' ? 'badge-red' : 'badge-amber'}`}>
                                                        ⚠️ Falling Knife
                                                    </span>
                                                )}
                                                {label && <span className={`badge ${isUp ? 'badge-green' : isDown ? 'badge-red' : 'badge-amber'}`}>{label}</span>}
                                            </span>
                                        );
                                    })()}
                                    collapsed={collapsed.momentum}
                                    onToggle={() => toggleSection('momentum')}
                                />
                                <div className={`card-body-collapsible${collapsed.momentum ? ' collapsed' : ''}`}>
                                    <div className="card-body">
                                        <div className="momentum-grid">
                                            {/* Falling Knife Warning */}
                                            {result.fallingKnife?.detected && (
                                                <div className={`falling-knife-alert ${result.fallingKnife.severity === 'severe' ? 'falling-knife-severe' : 'falling-knife-warning'}`}>
                                                    <div className="falling-knife-header">
                                                        <span className="falling-knife-icon">⚠️</span>
                                                        <span className="falling-knife-title">
                                                            {result.fallingKnife.severity === 'severe' ? 'Falling Knife — Do Not Trade' : 'Falling Knife Warning'}
                                                        </span>
                                                    </div>
                                                    <div className="falling-knife-triggers">
                                                        {result.fallingKnife.triggers.map((t, i) => (
                                                            <span key={i} className="falling-knife-trigger">{t}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* RSI */}
                                            <div className="momentum-indicator">
                                                <div className="momentum-label">RSI (14)</div>
                                                <div className="momentum-value-row">
                                                    <span className="momentum-value" style={{
                                                        color: result.momentum.rsi <= 30 ? 'var(--green)' : result.momentum.rsi >= 70 ? 'var(--red)' : 'var(--text-primary)'
                                                    }}>
                                                        {result.momentum.rsi.toFixed(1)}
                                                    </span>
                                                    <span className={`badge ${result.momentum.rsi <= 30 ? 'badge-green' : result.momentum.rsi >= 70 ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 10 }}>
                                                        {result.momentum.rsi <= 30 ? 'Oversold' : result.momentum.rsi >= 70 ? 'Overbought' : 'Neutral'}
                                                    </span>
                                                    {result.momentum.rsiDivergence && (
                                                        <span className={`badge ${result.momentum.rsiDivergence === 'bullish' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                            {result.momentum.rsiDivergence === 'bullish' ? 'Bull. Divergence' : 'Bear. Divergence'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="momentum-bar-track">
                                                    <div className="momentum-bar-fill" style={{
                                                        width: `${result.momentum.rsi}%`,
                                                        background: result.momentum.rsi <= 30 ? 'var(--green)' : result.momentum.rsi >= 70 ? 'var(--red)' : 'var(--amber)',
                                                    }} />
                                                    <div className="momentum-bar-marker" style={{ left: '30%' }} />
                                                    <div className="momentum-bar-marker" style={{ left: '70%' }} />
                                                </div>
                                            </div>

                                            {/* SMA Alignment */}
                                            {(result.momentum.sma20 != null || result.momentum.vsSma20 != null) && (
                                                <div className="momentum-indicator">
                                                    <div className="momentum-label">Moving Averages</div>
                                                    {result.momentum.sma20 != null ? (
                                                        <>
                                                            <div className="momentum-sma-row">
                                                                {[
                                                                    { label: 'SMA 20', val: result.momentum.sma20 },
                                                                    { label: 'SMA 50', val: result.momentum.sma50 },
                                                                    { label: 'SMA 200', val: result.momentum.sma200 },
                                                                ].filter(s => s.val != null).map(s => (
                                                                    <div key={s.label} className="sma-chip">
                                                                        <span className="sma-chip-label">{s.label}</span>
                                                                        <span className="sma-chip-value">${s.val.toFixed(2)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {(() => {
                                                                const m = result.momentum;
                                                                const p = result.price;
                                                                const aligned = m.sma20 > m.sma50 && m.sma50 > m.sma200 && p > m.sma20;
                                                                const aboveSma200 = p > (m.sma200 || 0);
                                                                return (
                                                                    <div className="momentum-value-row" style={{ marginTop: 6 }}>
                                                                        <span className={`badge ${aligned ? 'badge-green' : aboveSma200 ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                                            {aligned ? 'Perfect Alignment (20 > 50 > 200)' : aboveSma200 ? 'Above SMA 200' : 'Below SMA 200'}
                                                                        </span>
                                                                        {m.smaAllRising === true && (
                                                                            <span className="badge badge-green" style={{ fontSize: 10 }}>All Rising</span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </>
                                                    ) : (
                                                        <div className="momentum-value-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                                                            {result.momentum.vsSma20 && (
                                                                <span className={`badge ${result.momentum.vsSma20 === 'above' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                                    {result.momentum.vsSma20 === 'above' ? 'Above SMA 20' : 'Below SMA 20'}
                                                                </span>
                                                            )}
                                                            {result.momentum.vsSma200 && (
                                                                <span className={`badge ${result.momentum.vsSma200 === 'above' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                                    {result.momentum.vsSma200 === 'above' ? 'Above SMA 200' : 'Below SMA 200'}
                                                                </span>
                                                            )}
                                                            {result.momentum.trendAlignment && (
                                                                <span className={`badge ${result.momentum.trendAlignment === 'perfect' ? 'badge-green' : result.momentum.trendAlignment === 'moderate' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                                                    {result.momentum.trendAlignment.charAt(0).toUpperCase() + result.momentum.trendAlignment.slice(1)} Alignment
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Trend & Momentum Score */}
                                            <div className="momentum-indicator">
                                                <div className="momentum-label">Trend & Momentum</div>
                                                <div className="momentum-value-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                                                    {result.momentum.trendStatus && (
                                                        <span className="strategy-component-chip">
                                                            Trend: <strong>{result.momentum.trendStatus.replace(/_/g, ' ')}</strong>
                                                        </span>
                                                    )}
                                                    {result.momentum.adx != null && (
                                                        <span className="strategy-component-chip">
                                                            ADX: <strong>{result.momentum.adx.toFixed(1)}</strong>
                                                        </span>
                                                    )}
                                                    {result.momentum.macdSignal && (
                                                        <span className="strategy-component-chip">
                                                            MACD: <strong>{result.momentum.macdSignal}</strong>
                                                        </span>
                                                    )}
                                                    {(result.momentum.stochSignal || result.momentum.stochK != null) && (() => {
                                                        const k = result.momentum.stochK;
                                                        const d = result.momentum.stochD;
                                                        const label = result.momentum.stochSignal
                                                            || (k < 20 ? 'oversold' : k > 80 ? 'overbought' : k > d ? 'bullish' : k < d ? 'bearish' : 'neutral');
                                                        const detail = k != null ? ` (${k.toFixed(0)}/${d?.toFixed(0)})` : '';
                                                        return (
                                                            <span className="strategy-component-chip">
                                                                Stoch: <strong>{label}{detail}</strong>
                                                            </span>
                                                        );
                                                    })()}
                                                    {result.momentum.marketTrend && (
                                                        <span className="strategy-component-chip">
                                                            SPY: <strong>{result.momentum.marketTrend.replace(/_/g, ' ')}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── Support & Resistance (graphical) ─── */}
                        <div ref={sectionRefs.sr} className="card fade-in analysis-section" style={{ animationDelay: '0.1s' }}>
                            <CollapsibleHeader
                                icon={<Target size={14} style={{ verticalAlign: 'middle' }} />}
                                title="Support & Resistance"
                                right={<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current: ${Number(result.price).toFixed(2)}</span>}
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
                                    right={<>{!result._analystsLive && <span className="badge badge-amber" style={{ fontSize: 10, marginRight: 4 }}>Sample data</span>}<span className={`badge ${result.analysts.consensus === 'Buy' ? 'badge-green' : 'badge-amber'}`}>{result.analysts.consensus}</span></>}
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
                                                <div className="analyst-metric-value" style={{ color: 'var(--text-accent)' }}>${Number(result.analysts.priceTarget).toFixed(2)}</div>
                                            </div>
                                            <div className="analyst-metric">
                                                <div className="analyst-metric-label">Range</div>
                                                <div className="analyst-metric-value" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>${Number(result.analysts.low).toFixed(2)}–${Number(result.analysts.high).toFixed(2)}</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Price Target vs Current</div>
                                            <div style={{ position: 'relative', height: 8, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: `${((result.price - result.analysts.low) / (result.analysts.high - result.analysts.low)) * 100}%`, width: 3, height: '100%', background: 'var(--text-accent)', zIndex: 2 }} />
                                                <div style={{ width: `${((result.analysts.priceTarget - result.analysts.low) / (result.analysts.high - result.analysts.low)) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--green), #34d399)', borderRadius: 4 }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                                <span>${Number(result.analysts.low).toFixed(2)}</span>
                                                <span style={{ color: 'var(--text-accent)' }}>Current: ${Number(result.price).toFixed(2)}</span>
                                                <span>${Number(result.analysts.high).toFixed(2)}</span>
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
                                    right={<>{!result._newsLive && <span className="badge badge-amber" style={{ fontSize: 10, marginRight: 4 }}>Sample data</span>}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.news.length} articles</span></>}
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
                                                        <div className="news-title">{item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{item.title}</a> : item.title}</div>
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
                                        ) : result.recommendation.dataSource === 'black_scholes' ? (
                                            <span className="badge badge-indigo" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-accent)', display: 'inline-block' }} />
                                                Black-Scholes
                                            </span>
                                        ) : (
                                            <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} />
                                                Calculated
                                            </span>
                                        )}
                                        {result.recommendation.quality && (
                                            <span className={`badge ${result.recommendation.quality === 'excellent' ? 'badge-green' : result.recommendation.quality === 'good' ? 'badge-green' : result.recommendation.quality === 'acceptable' ? 'badge-amber' : 'badge-red'}`}>
                                                {result.recommendation.quality.charAt(0).toUpperCase() + result.recommendation.quality.slice(1)}
                                            </span>
                                        )}
                                    </div>
                                }
                                collapsed={collapsed.tradeRec}
                                onToggle={() => toggleSection('tradeRec')}
                            />
                            <div className={`card-body-collapsible${collapsed.tradeRec ? ' collapsed' : ''}`}>
                                <div className="card-body">
                                    {result.recommendation.shortStrikeReason && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                                            {result.recommendation.shortStrikeReason}
                                            {result.recommendation.supportLevel && (
                                                <span> — Support @ ${result.recommendation.supportLevel.price} ({result.recommendation.supportLevel.strength}, {result.recommendation.supportLevel.touches} touches{result.recommendation.supportLevel.confirmed_by_fib ? ', Fib confirmed' : ''})</span>
                                            )}
                                        </div>
                                    )}
                                    <div className="grid-4">
                                        <div><span className="trade-rec-label">Strategy</span><div className="trade-rec-value">{result.recommendation.strategy}</div></div>
                                        <div>
                                            <span className="trade-rec-label">Short Strike</span>
                                            <div className="trade-rec-value">${Number(result.recommendation.shortStrike).toFixed(2)}</div>
                                            <div className="trade-rec-delta">Δ {typeof result.recommendation.shortDelta === 'number' ? result.recommendation.shortDelta.toFixed(2) : result.recommendation.shortDelta}</div>
                                        </div>
                                        <div>
                                            <span className="trade-rec-label">Long Strike</span>
                                            <div className="trade-rec-value">${Number(result.recommendation.longStrike).toFixed(2)}</div>
                                            <div className="trade-rec-delta">Δ {typeof result.recommendation.longDelta === 'number' ? result.recommendation.longDelta.toFixed(2) : result.recommendation.longDelta}</div>
                                        </div>
                                        {result.recommendation.spreadWidth && (
                                            <div><span className="trade-rec-label">Spread Width</span><div className="trade-rec-value">${Number(result.recommendation.spreadWidth).toFixed(2)}</div></div>
                                        )}
                                        <div><span className="trade-rec-label">DTE</span><div className="trade-rec-value">{result.recommendation.dte} days</div></div>
                                        <div><span className="trade-rec-label">Expiration</span><div className="trade-rec-value">{result.recommendation.expiration}</div></div>
                                        <div><span className="trade-rec-label">Credit</span><div className="trade-rec-value" style={{ color: result.recommendation.creditEstimate ? 'var(--green)' : 'var(--amber)' }}>{result.recommendation.creditEstimate ?? 'N/A'}</div></div>
                                        <div><span className="trade-rec-label">Max Risk</span><div className="trade-rec-value" style={{ color: 'var(--red)' }}>{result.recommendation.maxRisk ?? 'N/A'}</div></div>
                                        {result.recommendation.maxProfit && (
                                            <div><span className="trade-rec-label">Max Profit</span><div className="trade-rec-value" style={{ color: 'var(--green)' }}>{result.recommendation.maxProfit}</div></div>
                                        )}
                                        <div><span className="trade-rec-label">Return on Risk</span><div className="trade-rec-value" style={{ color: result.recommendation.returnOnRisk ? 'var(--green)' : 'var(--amber)' }}>{result.recommendation.returnOnRisk ?? 'N/A'}</div></div>
                                        {result.recommendation.breakEven != null && (
                                            <div><span className="trade-rec-label">Break Even</span><div className="trade-rec-value">${Number(result.recommendation.breakEven).toFixed(2)}</div></div>
                                        )}
                                        {result.recommendation.probProfit != null && (
                                            <div><span className="trade-rec-label">Prob. Profit</span><div className="trade-rec-value" style={{ color: 'var(--green)' }}>{result.recommendation.probProfit.toFixed(0)}%</div></div>
                                        )}
                                        {result.recommendation.confidenceScore != null && (
                                            <div><span className="trade-rec-label">Strike Quality</span><div className="trade-rec-value">{result.recommendation.confidenceScore}/100</div></div>
                                        )}
                                    </div>
                                    {result.recommendation.warnings?.length > 0 && (
                                        <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(var(--amber-rgb, 245, 158, 11), 0.1)', borderRadius: 6, fontSize: 11 }}>
                                            {result.recommendation.warnings.map((w, i) => (
                                                <div key={i} style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span>⚠</span> {w}
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
