import { ArrowLeft, DollarSign, Clock, Target, AlertTriangle, TrendingUp } from 'lucide-react';

// ──────────────────────────────────────────────────────────
// PositionDetail — Detail view for a single portfolio position
// Props: position (object), onBack (function)
// Display only — no action buttons.
// ──────────────────────────────────────────────────────────

function pnlColor(val) {
    if (val == null) return 'inherit';
    return val >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)';
}

function fmtDollar(val) {
    if (val == null) return '-';
    return `$${Number(val).toFixed(2)}`;
}

function fmtPct(val) {
    if (val == null) return '-';
    return `${Number(val).toFixed(1)}%`;
}

export default function PositionDetail({ position: p, onBack }) {
    if (!p) return null;

    const isCredit = ['bull-put-spread', 'bear-call-spread', 'iron-condor', 'short-put', 'short-call', 'short-straddle', 'short-strangle'].includes(p.type);
    const credit = p.credit || 0;
    const maxProfit = p.maxProfit ?? (isCredit ? credit * 100 * (p.qty || 1) : null);
    const maxLoss = p.maxLoss ?? (isCredit && p.shortStrike && p.longStrike
        ? (Math.abs(p.shortStrike - p.longStrike) - credit) * 100 * (p.qty || 1)
        : null);

    // P&L
    let pnl = p.unrealizedPnl;
    if (pnl == null && isCredit) {
        const currentVal = p.closedAt ?? p.currentValue ?? 0;
        pnl = (credit - currentVal) * 100 * (p.qty || 1);
    }
    const pnlPct = p.pnlPctOfMax ?? (pnl != null && maxProfit ? (pnl / maxProfit) * 100 : null);

    // Thresholds from PLAYBOOK
    const takeProfitLevel = credit * 0.50;  // 50% of credit
    const stopLossLevel = credit * 2.0;     // 2x credit

    // Roll signal
    const rollSignal = p.dte != null && p.dte <= 21 && p.status === 'open';

    return (
        <div className="card">
            {/* Header */}
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-icon" onClick={onBack} title="Back to Portfolio">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h2 style={{ margin: 0 }}>{p.symbol}</h2>
                    <span className="text-muted" style={{ fontSize: 13 }}>
                        {p.type?.replace(/-/g, ' ')} {p.strategy !== '—' ? `(${p.strategy})` : ''}
                    </span>
                </div>
                {p.status && (
                    <span className={`status-badge status-${p.status}`} style={{ marginLeft: 'auto' }}>
                        {p.status}
                    </span>
                )}
            </div>

            {/* Position Basics */}
            <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, padding: '16px 0' }}>
                <DetailCard icon={<Target size={14} />} label="Short Strike" value={p.shortStrike ?? '-'} />
                <DetailCard icon={<Target size={14} />} label="Long Strike" value={p.longStrike ?? '-'} />
                <DetailCard icon={<Clock size={14} />} label="Expiration" value={p.expiration || '-'} />
                <DetailCard icon={<Clock size={14} />} label="DTE" value={p.dte != null ? `${p.dte}d` : '-'} highlight={rollSignal ? 'warn' : null} />
                <DetailCard icon={<DollarSign size={14} />} label="Credit" value={fmtDollar(credit)} />
                <DetailCard label="Contracts" value={p.qty ?? 1} />
            </div>

            {/* P&L Section */}
            <div style={{ borderTop: '1px solid var(--border, #333)', paddingTop: 16, marginTop: 8 }}>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>
                    <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    P&L
                </h3>
                <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                    <DetailCard label="Unrealized P&L" value={fmtDollar(pnl)} valueColor={pnlColor(pnl)} />
                    <DetailCard label="P&L % of Max" value={fmtPct(pnlPct)} valueColor={pnlColor(pnlPct)} />
                    <DetailCard label="Max Profit" value={maxProfit != null ? fmtDollar(maxProfit) : '-'} />
                    <DetailCard label="Max Loss" value={maxLoss != null ? fmtDollar(-maxLoss) : '-'} valueColor="var(--red, #ef4444)" />
                </div>

                {/* P&L Progress Bar */}
                {pnlPct != null && (
                    <div style={{ margin: '16px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 4 }}>
                            <span>Max Loss</span>
                            <span>Break Even</span>
                            <span>Max Profit</span>
                        </div>
                        <div style={{ height: 8, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                                position: 'absolute',
                                left: '50%',
                                width: `${Math.min(Math.abs(pnlPct), 100) / 2}%`,
                                height: '100%',
                                background: pnlPct >= 0 ? '#22c55e' : '#ef4444',
                                transform: pnlPct >= 0 ? 'none' : 'translateX(-100%)',
                                borderRadius: 4,
                                transition: 'width 0.3s',
                            }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Levels & Signals */}
            <div style={{ borderTop: '1px solid var(--border, #333)', paddingTop: 16, marginTop: 8 }}>
                <h3 style={{ fontSize: 14, marginBottom: 12 }}>
                    <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Exit Levels
                </h3>
                <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    <DetailCard label="Take Profit (50%)" value={`Close when spread value <= ${fmtDollar(takeProfitLevel)}`} />
                    <DetailCard label="Stop Loss (2x Credit)" value={`Close when spread value >= ${fmtDollar(stopLossLevel)}`} valueColor="var(--red, #ef4444)" />
                </div>

                {/* Roll Signal */}
                {rollSignal && (
                    <div className="alert-banner" style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 6,
                        color: '#f59e0b',
                        fontSize: 13,
                    }}>
                        <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Roll Signal: DTE {p.dte}d &le; 21 days. Consider rolling to next expiration.
                    </div>
                )}
            </div>

            {/* Additional Info (if IBKR data available) */}
            {(p.underlyingPrice || p.breakeven || p.distancePct != null) && (
                <div style={{ borderTop: '1px solid var(--border, #333)', paddingTop: 16, marginTop: 8 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 12 }}>Market Context</h3>
                    <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
                        {p.underlyingPrice && <DetailCard label="Underlying Price" value={fmtDollar(p.underlyingPrice)} />}
                        {p.breakeven && <DetailCard label="Breakeven" value={fmtDollar(p.breakeven)} />}
                        {p.distancePct != null && <DetailCard label="Distance to Short" value={fmtPct(p.distancePct)} />}
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailCard({ icon, label, value, valueColor, highlight }) {
    return (
        <div className="stat-card" style={highlight === 'warn' ? { borderColor: 'rgba(245, 158, 11, 0.4)' } : undefined}>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon} {label}
            </div>
            <div className="stat-value" style={{ color: valueColor || 'inherit', fontSize: typeof value === 'string' && value.length > 15 ? 12 : 18 }}>
                {value}
            </div>
        </div>
    );
}
