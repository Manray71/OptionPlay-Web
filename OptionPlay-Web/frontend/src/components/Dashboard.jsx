import { useState } from 'react';
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
} from 'lucide-react';

// Mock data — replaced with API calls when backend is running
const MOCK_VIX = 18.5;
const MOCK_REGIME = 'Normal';

const MOCK_PICKS = [
    { symbol: 'AAPL', strategy: 'Pullback', score: 7.8, signal: 'Strong', stability: 92 },
    { symbol: 'MSFT', strategy: 'Trend', score: 7.2, signal: 'Strong', stability: 88 },
    { symbol: 'GOOGL', strategy: 'Bounce', score: 6.9, signal: 'Moderate', stability: 85 },
    { symbol: 'AMZN', strategy: 'Pullback', score: 6.5, signal: 'Moderate', stability: 82 },
    { symbol: 'META', strategy: 'Breakout', score: 6.3, signal: 'Moderate', stability: 79 },
];

const MOCK_POSITIONS = [
    { symbol: 'NVDA', strategy: 'Pullback', strikes: '175/170', dte: 45, pnl: '+$320', pnlPct: '+42%' },
    { symbol: 'AMD', strategy: 'Bounce', strikes: '155/150', dte: 32, pnl: '+$180', pnlPct: '+28%' },
    { symbol: 'CRM', strategy: 'Trend', strikes: '280/275', dte: 58, pnl: '-$45', pnlPct: '-8%' },
];

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

export default function Dashboard({ onSymbolClick }) {
    const [vix] = useState(MOCK_VIX);
    const [regime] = useState(MOCK_REGIME);

    return (
        <>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Market overview and daily trading signals</p>
            </div>

            <div className="page-content">
                {/* Top Stats Row */}
                <div className="grid-4 fade-in" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                        <div className="stat-label">VIX Level</div>
                        <div className="stat-value amber">{vix.toFixed(1)}</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>Regime: {regime}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Active Positions</div>
                        <div className="stat-value indigo">{MOCK_POSITIONS.length}</div>
                        <div className="stat-change" style={{ color: 'var(--green)' }}>2 profitable</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Daily P&L</div>
                        <div className="stat-value green">+$455</div>
                        <div className="stat-change" style={{ color: 'var(--green)' }}>↑ 3.2% today</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Win Rate (30d)</div>
                        <div className="stat-value green">87%</div>
                        <div className="stat-change" style={{ color: 'var(--text-muted)' }}>13/15 trades</div>
                    </div>
                </div>

                <div className="grid-2" style={{ marginBottom: 20 }}>
                    {/* VIX Gauge Card */}
                    <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
                        <div className="card-header">
                            <h3><Gauge size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> VIX Gauge</h3>
                            <span className="badge badge-indigo">Live</span>
                        </div>
                        <VixGauge value={vix} regime={regime} />
                    </div>

                    {/* Market Overview */}
                    <div className="card fade-in" style={{ animationDelay: '0.15s' }}>
                        <div className="card-header">
                            <h3><Activity size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Market Overview</h3>
                        </div>
                        <div className="card-body">
                            <table className="data-table">
                                <thead>
                                    <tr><th>Index</th><th>Price</th><th>Change</th><th>Trend</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td className="symbol">SPY</td><td>$592.34</td><td style={{ color: 'var(--green)' }}>+1.25%</td><td><TrendingUp size={14} style={{ color: 'var(--green)' }} /></td></tr>
                                    <tr><td className="symbol">QQQ</td><td>$518.89</td><td style={{ color: 'var(--green)' }}>+0.88%</td><td><TrendingUp size={14} style={{ color: 'var(--green)' }} /></td></tr>
                                    <tr><td className="symbol">IWM</td><td>$224.56</td><td style={{ color: 'var(--red)' }}>-0.32%</td><td><TrendingDown size={14} style={{ color: 'var(--red)' }} /></td></tr>
                                    <tr><td className="symbol">VIX</td><td>{vix.toFixed(2)}</td><td style={{ color: 'var(--amber)' }}>+5.2%</td><td><AlertTriangle size={14} style={{ color: 'var(--amber)' }} /></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Daily Top Picks */}
                <div className="card fade-in" style={{ animationDelay: '0.2s', marginBottom: 20 }}>
                    <div className="card-header">
                        <h3><Zap size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Daily Top Picks</h3>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click a symbol to analyze</span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <table className="data-table">
                            <thead>
                                <tr><th>Rank</th><th>Symbol</th><th>Strategy</th><th>Score</th><th>Signal</th><th>Stability</th><th></th></tr>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 4, background: 'var(--border-subtle)', borderRadius: 2 }}>
                                                    <div style={{ width: `${pick.stability}%`, height: '100%', background: pick.stability >= 80 ? 'var(--green)' : 'var(--amber)', borderRadius: 2 }} />
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

                {/* Active Positions */}
                <div className="card fade-in" style={{ animationDelay: '0.25s' }}>
                    <div className="card-header">
                        <h3><Target size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Active Positions</h3>
                        <span className="badge badge-indigo">{MOCK_POSITIONS.length} open</span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <table className="data-table">
                            <thead>
                                <tr><th>Symbol</th><th>Strategy</th><th>Strikes</th><th>DTE</th><th>P&L ($)</th><th>P&L (%)</th><th></th></tr>
                            </thead>
                            <tbody>
                                {MOCK_POSITIONS.map((pos) => {
                                    const isProfit = pos.pnl.startsWith('+');
                                    return (
                                        <tr
                                            key={pos.symbol}
                                            onClick={() => onSymbolClick?.(pos.symbol)}
                                            className="clickable-row"
                                        >
                                            <td className="symbol">{pos.symbol}</td>
                                            <td><StrategyBadge strategy={pos.strategy} /></td>
                                            <td>{pos.strikes}</td>
                                            <td>{pos.dte}d</td>
                                            <td style={{ color: isProfit ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{pos.pnl}</td>
                                            <td style={{ color: isProfit ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{pos.pnlPct}</td>
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
    );
}
