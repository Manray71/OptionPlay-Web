import { useState, useMemo, useCallback, useEffect } from 'react';
import { Play, Filter, ExternalLink, ChevronUp, ChevronDown, Search, Info, Download } from 'lucide-react';
import { runScanJson } from '../api';
import { exportScannerPdf } from '../utils/exportScannerPdf';

const STRATEGIES = [
    { id: 'multi', label: 'Multi-Strategy', desc: 'Best signal per symbol' },
    { id: 'pullback', label: 'Pullback', desc: 'RSI + Support dip' },
    { id: 'bounce', label: 'Support Bounce', desc: 'Bounce off support' },
    { id: 'breakout', label: 'ATH Breakout', desc: 'New highs + volume' },
    { id: 'dip', label: 'Earnings Dip', desc: 'Post-earnings recovery' },
    { id: 'trend', label: 'Trend Continuation', desc: 'SMA alignment' },
];

const MOCK_RESULTS = [
    { rank: 1, symbol: 'AAPL', strategy: 'Pullback', score: 7.8, normalized: 8.2, stability: 92, winRate: 94, sector: 'Technology', signal: 'Strong', earningsDate: '2026-05-02', earningsDays: 74 },
    { rank: 2, symbol: 'MSFT', strategy: 'Trend', score: 7.2, normalized: 7.6, stability: 88, winRate: 91, sector: 'Technology', signal: 'Strong', earningsDate: '2026-04-24', earningsDays: 66 },
    { rank: 3, symbol: 'UNH', strategy: 'Bounce', score: 6.9, normalized: 7.4, stability: 90, winRate: 89, sector: 'Healthcare', signal: 'Moderate', earningsDate: '2026-04-14', earningsDays: 56 },
    { rank: 4, symbol: 'JNJ', strategy: 'Pullback', score: 6.7, normalized: 7.1, stability: 95, winRate: 93, sector: 'Healthcare', signal: 'Moderate', earningsDate: '2026-04-15', earningsDays: 57 },
    { rank: 5, symbol: 'V', strategy: 'Trend', score: 6.5, normalized: 6.9, stability: 87, winRate: 88, sector: 'Financial', signal: 'Moderate', earningsDate: '2026-04-28', earningsDays: 70 },
    { rank: 6, symbol: 'PG', strategy: 'Bounce', score: 6.3, normalized: 6.7, stability: 93, winRate: 90, sector: 'Consumer Def.', signal: 'Moderate', earningsDate: '2026-04-18', earningsDays: 60 },
    { rank: 7, symbol: 'HD', strategy: 'Pullback', score: 6.1, normalized: 6.5, stability: 84, winRate: 86, sector: 'Consumer Cyc.', signal: 'Moderate', earningsDate: '2026-05-19', earningsDays: 91 },
    { rank: 8, symbol: 'AVGO', strategy: 'Breakout', score: 5.9, normalized: 6.2, stability: 78, winRate: 82, sector: 'Technology', signal: 'Weak', earningsDate: '2026-03-05', earningsDays: 16 },
];

function StrategyBadge({ strategy }) {
    const map = { Pullback: 'pullback', Bounce: 'bounce', Breakout: 'breakout', 'Earnings Dip': 'dip', Trend: 'trend' };
    const cls = `strategy-chip strategy-${map[strategy] || 'pullback'}`;
    return <span className={cls}>{strategy}</span>;
}

function SortableHeader({ label, column, sortCol, sortDir, onSort }) {
    const active = sortCol === column;
    return (
        <th className="sortable-header" onClick={() => onSort(column)}>
            <span>{label}</span>
            {active && (
                sortDir === 'asc'
                    ? <ChevronUp size={12} className="sort-icon" />
                    : <ChevronDown size={12} className="sort-icon" />
            )}
        </th>
    );
}

function ScoreBar({ score, max = 10 }) {
    const pct = (score / max) * 100;
    const color = score >= 7 ? 'var(--green)' : score >= 5 ? 'var(--amber)' : 'var(--red)';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 40, height: 4, background: 'var(--border-subtle)', borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
            </div>
            <span className="score" style={{ color, fontSize: 13 }}>{score.toFixed(1)}</span>
        </div>
    );
}

export default function Scanner({ onSymbolClick, scanResults, setScanResults, scanTime, setScanTime, analysisCache, prefetchAnalyses, prefetchProgress, setPrefetchProgress }) {
    const [selectedStrategy, setSelectedStrategy] = useState('multi');
    const [minScore, setMinScore] = useState(3.5);
    const [listType, setListType] = useState('stable');
    const results = scanResults;
    const setResults = setScanResults;
    const [isScanning, setIsScanning] = useState(false);

    // Toast state
    const [toast, setToast] = useState(null);

    // Sort state
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState(null);

    // Filter state
    const [filters, setFilters] = useState({
        symbol: '',
        sector: '',
        strategy: '',
        signal: '',
        quality: '',
    });

    const handleSort = useCallback((col) => {
        if (sortCol === col) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortCol(null); setSortDir(null); }
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    }, [sortCol, sortDir]);

    const handleFilterChange = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    // Derived sorted + filtered results
    const processedResults = useMemo(() => {
        if (!results) return null;
        let rows = [...results];

        // Apply filters
        if (filters.symbol) {
            const q = filters.symbol.toUpperCase();
            rows = rows.filter(r => r.symbol.includes(q));
        }
        if (filters.sector) {
            const q = filters.sector.toLowerCase();
            rows = rows.filter(r => r.sector.toLowerCase().includes(q));
        }
        if (filters.strategy) {
            rows = rows.filter(r => r.strategy === filters.strategy);
        }
        if (filters.signal) {
            rows = rows.filter(r => r.signal === filters.signal);
        }
        if (filters.quality) {
            if (filters.quality === 'hasCredit') {
                rows = rows.filter(r => r.credit != null && r.credit > 0);
            } else {
                rows = rows.filter(r => r.tradeQuality === filters.quality);
            }
        }

        // Apply sort
        if (sortCol && sortDir) {
            const dir = sortDir === 'asc' ? 1 : -1;
            rows.sort((a, b) => {
                const av = a[sortCol] ?? -Infinity, bv = b[sortCol] ?? -Infinity;
                if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
                return String(av).localeCompare(String(bv)) * dir;
            });
        }

        return rows;
    }, [results, filters, sortCol, sortDir]);

    const handleExportPdf = useCallback(() => {
        if (!processedResults || processedResults.length === 0) return;
        const strategyLabel = STRATEGIES.find(s => s.id === selectedStrategy)?.label || selectedStrategy;
        exportScannerPdf(processedResults, { strategy: strategyLabel, scanTime });
    }, [processedResults, selectedStrategy, scanTime]);

    const [demoMode, setDemoMode] = useState(false);

    const handleScan = async () => {
        setIsScanning(true);
        setToast(null);
        setDemoMode(false);
        setPrefetchProgress(null);
        setFilters({ symbol: '', sector: '', strategy: '', signal: '', quality: '' });
        const t0 = performance.now();
        try {
            const data = await runScanJson({
                strategy: selectedStrategy,
                min_score: minScore,
                list_type: listType,
                max_results: 20,
            });
            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            if (data.error || !data.signals) throw new Error(data.error || 'No signals');
            const mapped = data.signals.map((s, i) => {
                const strength = s.strength || '';
                const stability = s.details?.stability;
                return {
                    rank: i + 1,
                    symbol: s.symbol,
                    strategy: (s.strategy || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    score: s.score ?? 0,
                    normalized: s.score ?? 0,
                    stability: stability?.score ?? s.stability_score ?? 0,
                    winRate: s.win_rate ? Math.round(s.win_rate) : (stability?.historical_win_rate ?? 0),
                    sector: s.sector ?? '',
                    signal: strength.charAt(0).toUpperCase() + strength.slice(1).toLowerCase(),
                    earningsDate: s.earnings_date ?? '',
                    earningsDays: s.days_to_earnings ?? null,
                };
            });
            setResults(mapped);
            setScanTime(new Date());
            setToast({ count: mapped.length, elapsed });
            // Pre-fetch analysis for all results in background
            prefetchAnalyses(mapped.map(r => r.symbol));
        } catch {
            // Fallback to mock data
            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            setResults(MOCK_RESULTS);
            setDemoMode(true);
            setToast({ count: MOCK_RESULTS.length, elapsed, error: true });
        } finally {
            setIsScanning(false);
        }
    };

    // Auto-dismiss toast
    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(id);
    }, [toast]);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hasMarketClosed = results && results.some(r => r.marketClosed);
    const hasActiveFilters = filters.symbol || filters.sector || filters.strategy || filters.signal || filters.quality;
    const totalCount = results ? results.length : 0;
    const shownCount = processedResults ? processedResults.length : 0;

    return (
        <>
            <div className="page-header">
                <h2>Scanner</h2>
                <p>Scan watchlist for trading opportunities — click a symbol to analyze</p>
                {demoMode && (
                    <span style={{ fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Info size={12} /> Demo mode — using simulated data
                    </span>
                )}
            </div>

            <div className="page-content">
                {/* Controls */}
                <div className="card fade-in scanner-controls" style={{ marginBottom: 20 }}>
                    <div className="card-body" style={{ padding: 12 }}>
                        <div className="scanner-controls-bar">
                            <div className="tabs">
                                {STRATEGIES.map((s) => (
                                    <button
                                        key={s.id}
                                        className={`tab${selectedStrategy === s.id ? ' active' : ''}`}
                                        onClick={() => setSelectedStrategy(s.id)}
                                        title={s.desc}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <div className="scanner-right-controls">
                                <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
                                    <label className="form-label">Min Score</label>
                                    <input type="number" className="form-input" value={minScore} onChange={(e) => setMinScore(parseFloat(e.target.value))} step={0.5} min={0} max={10} />
                                </div>
                                <div className="form-group" style={{ width: 130, marginBottom: 0 }}>
                                    <label className="form-label">Watchlist</label>
                                    <select className="form-select" value={listType} onChange={(e) => setListType(e.target.value)}>
                                        <option value="stable">Stable (&ge;60)</option>
                                        <option value="risk">Risk (&lt;60)</option>
                                        <option value="all">All</option>
                                    </select>
                                </div>
                                <button className="btn btn-primary" onClick={handleScan} disabled={isScanning} style={{ height: 42, alignSelf: 'flex-end' }}>
                                    {isScanning ? (<><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Scanning...</>) : (<><Play size={14} /> Run Scan</>)}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                    {/* Toast */}
                    {toast && (
                        <div className="scanner-toast">
                            <span>
                                Found {toast.count} candidates in {toast.elapsed}s
                                {toast.error && <span style={{ color: 'var(--amber)', marginLeft: 8 }}><Info size={12} style={{ verticalAlign: 'middle' }} /> Using sample data</span>}
                            </span>
                            <button className="scanner-toast-close" onClick={() => setToast(null)}>&times;</button>
                        </div>
                    )}

                    {/* Market closed banner */}
                    {hasMarketClosed && (
                        <div style={{ padding: '8px 16px', background: 'rgba(255, 179, 0, 0.08)', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Info size={13} /> Market closed — credits estimated from last trading day
                        </div>
                    )}

                    <div className="card-header">
                        <h3><Filter size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Scan Results</h3>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button className="btn btn-secondary" onClick={handleExportPdf} disabled={!processedResults || processedResults.length === 0} style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Download size={12} /> PDF
                            </button>
                            {results === null
                                ? '0 candidates'
                                : <>
                                    {hasActiveFilters ? `${shownCount} of ${totalCount}` : totalCount} candidates
                                    {scanTime && <> &middot; {scanTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {scanTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
                                </>}
                            {prefetchProgress && prefetchProgress.done < prefetchProgress.total && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                                    <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                                    Loading analyses {prefetchProgress.done}/{prefetchProgress.total}
                                </span>
                            )}
                            {prefetchProgress && prefetchProgress.done === prefetchProgress.total && results && (
                                <span style={{ color: 'var(--green)' }}>All analyses loaded</span>
                            )}
                        </span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {isScanning ? (
                            <div className="loading-spinner"><div className="spinner" /></div>
                        ) : results === null ? (
                            <div className="empty-state">
                                <Search size={48} />
                                <h3>No scan results yet</h3>
                                <p>Select a strategy and click Run Scan to find candidates</p>
                            </div>
                        ) : processedResults.length === 0 ? (
                            <div className="empty-state">
                                <Filter size={48} />
                                <h3>No candidates found</h3>
                                <p>Try lowering min score or adjusting your filters</p>
                            </div>
                        ) : (
                            <div className="scanner-table-wrap">
                                <table className="data-table scanner-table">
                                    <thead>
                                        <tr>
                                            <SortableHeader label="#" column="rank" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Symbol" column="symbol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Strategy" column="strategy" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Score" column="score" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Signal" column="signal" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Earnings" column="earningsDays" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Stability" column="stability" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Win Rate" column="winRate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Credit" column="credit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="RoR" column="riskReward" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <SortableHeader label="Sector" column="sector" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                            <th></th>
                                        </tr>
                                        <tr className="filter-row">
                                            <td></td>
                                            <td><input className="table-filter-input" placeholder="Symbol..." value={filters.symbol} onChange={e => handleFilterChange('symbol', e.target.value)} /></td>
                                            <td>
                                                <select className="table-filter-input" value={filters.strategy} onChange={e => handleFilterChange('strategy', e.target.value)}>
                                                    <option value="">All</option>
                                                    {[...new Set((results || []).map(r => r.strategy))].sort().map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td></td>
                                            <td>
                                                <select className="table-filter-input" value={filters.signal} onChange={e => handleFilterChange('signal', e.target.value)}>
                                                    <option value="">All</option>
                                                    <option>Strong</option>
                                                    <option>Moderate</option>
                                                    <option>Weak</option>
                                                </select>
                                            </td>
                                            <td></td>
                                            <td></td>
                                            <td></td>
                                            <td>
                                                <select className="table-filter-input" value={filters.quality} onChange={e => handleFilterChange('quality', e.target.value)}>
                                                    <option value="">All</option>
                                                    <option value="good">Good</option>
                                                    <option value="acceptable">Acceptable</option>
                                                    <option value="hasCredit">Has Credit</option>
                                                </select>
                                            </td>
                                            <td></td>
                                            <td><input className="table-filter-input" placeholder="Sector..." value={filters.sector} onChange={e => handleFilterChange('sector', e.target.value)} /></td>
                                            <td></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {processedResults.map((r) => (
                                            <tr
                                                key={r.symbol}
                                                onClick={() => onSymbolClick?.(r.symbol)}
                                                className="clickable-row"
                                            >
                                                <td style={{ color: 'var(--text-muted)' }}>{r.rank}</td>
                                                <td className="symbol">{r.symbol}</td>
                                                <td><StrategyBadge strategy={r.strategy} /></td>
                                                <td><ScoreBar score={r.score} /></td>
                                                <td><span className={`badge ${r.signal === 'Strong' ? 'badge-green' : r.signal === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>{r.signal}</span></td>
                                                <td>
                                                    {r.earningsDays != null ? (
                                                        <>
                                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.earningsDate}</div>
                                                            <div style={{ fontSize: 11, color: r.earningsDays <= 14 ? 'var(--red)' : 'var(--text-muted)' }}>{r.earningsDays}d</div>
                                                        </>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{ width: 40, height: 4, background: 'var(--border-subtle)', borderRadius: 2 }}>
                                                            <div style={{ width: `${r.stability}%`, height: '100%', background: r.stability >= 80 ? 'var(--green)' : 'var(--amber)', borderRadius: 2 }} />
                                                        </div>
                                                        <span style={{ fontSize: 12 }}>{r.stability}</span>
                                                    </div>
                                                </td>
                                                <td style={{ color: r.winRate >= 90 ? 'var(--green)' : 'var(--text-secondary)' }}>{r.winRate}%</td>
                                                <td>
                                                    {r.credit != null && r.credit > 0 ? (
                                                        r.marketClosed ? (
                                                            <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }} title="Estimated from last trading day">~${r.credit.toFixed(2)}</span>
                                                        ) : (
                                                            <span style={{ color: r.tradeQuality === 'poor' ? 'var(--amber)' : 'var(--green)', fontWeight: 600, fontSize: 13 }}>${r.credit.toFixed(2)}</span>
                                                        )
                                                    ) : r.tradeQuality != null ? (
                                                        <span style={{ fontSize: 11, color: 'var(--amber)' }} title="Low OI — no liquid strikes">N/A</span>
                                                    ) : (
                                                        <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                                                    )}
                                                </td>
                                                <td style={{ fontSize: 13, color: r.riskReward >= 0.40 ? 'var(--green)' : r.riskReward != null ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                                    {r.riskReward != null ? `${(r.riskReward * 100).toFixed(0)}%` : r.tradeQuality != null ? '—' : <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
                                                </td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.sector}</td>
                                                <td><ExternalLink size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
