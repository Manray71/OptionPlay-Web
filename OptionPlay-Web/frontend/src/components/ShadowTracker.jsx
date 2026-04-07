import { Eye, BarChart3, ChevronDown, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { fetchShadowReview, fetchShadowStats } from '../api';

// ──────────────────────────────────────────────────────────
// ShadowTracker — Shadow Trade Review & Performance Stats
// Two tabs: "Trades" and "Statistics"
// ──────────────────────────────────────────────────────────

const STATUS_COLORS = {
    open: '#3b82f6',
    win: '#22c55e',
    loss: '#ef4444',
    expired: '#a855f7',
};

const GROUP_OPTIONS = [
    { value: 'strategy', label: 'Strategy' },
    { value: 'score_bucket', label: 'Score Bucket' },
    { value: 'regime', label: 'VIX Regime' },
    { value: 'month', label: 'Month' },
    { value: 'symbol', label: 'Symbol' },
    { value: 'tier', label: 'Liquidity Tier' },
];

function StatusBadge({ status }) {
    const color = STATUS_COLORS[status] || '#6b7280';
    return (
        <span className="status-badge" style={{ color, borderColor: color }}>
            {status}
        </span>
    );
}

export default function ShadowTracker() {
    const [tab, setTab] = useState('trades');
    const [trades, setTrades] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Filters
    const [daysBack, setDaysBack] = useState(30);
    const [statusFilter, setStatusFilter] = useState('all');
    const [groupBy, setGroupBy] = useState('strategy');

    const loadTrades = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchShadowReview(daysBack, statusFilter);
            setTrades(data.trades || []);
        } catch (e) {
            setError(e.message);
            setTrades([]);
        } finally {
            setLoading(false);
        }
    }, [daysBack, statusFilter]);

    const loadStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchShadowStats(groupBy);
            setStats(data.stats || null);
        } catch (e) {
            setError(e.message);
            setStats(null);
        } finally {
            setLoading(false);
        }
    }, [groupBy]);

    useEffect(() => {
        if (tab === 'trades') loadTrades();
        else loadStats();
    }, [tab, loadTrades, loadStats]);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1><Eye size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Shadow Tracker</h1>
                <p className="page-subtitle">Paper-traded picks and performance analytics</p>
            </div>

            {/* Tab Switcher */}
            <div className="tab-bar">
                <button className={`tab-btn ${tab === 'trades' ? 'active' : ''}`} onClick={() => setTab('trades')}>
                    <Eye size={14} /> Trades
                </button>
                <button className={`tab-btn ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
                    <BarChart3 size={14} /> Statistics
                </button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {tab === 'trades' ? (
                <TradesView
                    trades={trades}
                    loading={loading}
                    daysBack={daysBack}
                    setDaysBack={setDaysBack}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    onRefresh={loadTrades}
                />
            ) : (
                <StatsView
                    stats={stats}
                    loading={loading}
                    groupBy={groupBy}
                    setGroupBy={setGroupBy}
                    onRefresh={loadStats}
                />
            )}
        </div>
    );
}

// ── Trades Tab ──

function TradesView({ trades, loading, daysBack, setDaysBack, statusFilter, setStatusFilter, onRefresh }) {
    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h3>Shadow Trades ({trades.length})</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select className="filter-select" value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}>
                        <option value={7}>7 days</option>
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                    </select>
                    <button className="btn-icon" onClick={onRefresh} title="Refresh">
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">Loading trades...</div>
            ) : trades.length === 0 ? (
                <div className="empty-state">No shadow trades found for the selected filters.</div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Strategy</th>
                                <th>Score</th>
                                <th>Short</th>
                                <th>Long</th>
                                <th>Credit</th>
                                <th>DTE</th>
                                <th>Regime</th>
                                <th>Status</th>
                                <th>Logged</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map((t, i) => (
                                <tr key={t.id || i}>
                                    <td className="mono">{t.symbol}</td>
                                    <td><span className={`strategy-chip strategy-${t.strategy}`}>{t.strategy}</span></td>
                                    <td className="mono">{Number(t.score || 0).toFixed(1)}</td>
                                    <td className="mono">{t.short_strike ?? '-'}</td>
                                    <td className="mono">{t.long_strike ?? '-'}</td>
                                    <td className="mono">${Number(t.est_credit || 0).toFixed(2)}</td>
                                    <td className="mono">{t.dte ?? '-'}</td>
                                    <td>{t.regime_at_log || '-'}</td>
                                    <td><StatusBadge status={t.status} /></td>
                                    <td className="text-muted">{t.logged_at ? new Date(t.logged_at).toLocaleDateString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Stats Tab ──

function StatsView({ stats, loading, groupBy, setGroupBy, onRefresh }) {
    const groups = stats?.groups || [];
    const totals = stats?.totals || {};

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h3>Performance Statistics</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="filter-select" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                        {GROUP_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <button className="btn-icon" onClick={onRefresh} title="Refresh">
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            {totals.total_trades > 0 && (
                <div className="stats-row" style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Trades</div>
                        <div className="stat-value">{totals.total_trades}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Win Rate</div>
                        <div className="stat-value" style={{ color: (totals.win_rate || 0) >= 80 ? '#22c55e' : '#f59e0b' }}>
                            {Number(totals.win_rate || 0).toFixed(1)}%
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Avg Score</div>
                        <div className="stat-value">{Number(totals.avg_score || 0).toFixed(1)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Avg Days to 50%</div>
                        <div className="stat-value">{Number(totals.avg_days_to_50pct || 0).toFixed(0)}d</div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="loading-state">Loading statistics...</div>
            ) : groups.length === 0 ? (
                <div className="empty-state">No statistics available. Need more shadow trades.</div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Group</th>
                                <th>Trades</th>
                                <th>Win Rate</th>
                                <th>Avg Score</th>
                                <th>Avg Days to 50%</th>
                                <th>Avg P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((g, i) => (
                                <tr key={g.key || i}>
                                    <td className="mono">{g.key || g.group || '-'}</td>
                                    <td className="mono">{g.total_trades ?? g.count ?? 0}</td>
                                    <td>
                                        <span style={{ color: (g.win_rate || 0) >= 80 ? '#22c55e' : (g.win_rate || 0) >= 60 ? '#f59e0b' : '#ef4444' }}>
                                            {Number(g.win_rate || 0).toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="mono">{Number(g.avg_score || 0).toFixed(1)}</td>
                                    <td className="mono">{g.avg_days_to_50pct != null ? `${Number(g.avg_days_to_50pct).toFixed(0)}d` : '-'}</td>
                                    <td className="mono">{g.avg_pnl != null ? `${Number(g.avg_pnl).toFixed(1)}%` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
