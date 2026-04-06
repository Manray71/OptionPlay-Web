import React, { useState, useMemo, useCallback } from 'react';

const QUADRANT_COLORS = {
    leading:   { bg: 'rgba(16, 185, 129, 0.10)', dot: '#10b981', label: 'LEADING' },
    improving: { bg: 'rgba(68, 138, 255, 0.10)', dot: '#448aff', label: 'IMPROVING' },
    lagging:   { bg: 'rgba(239, 68, 68, 0.10)',  dot: '#ef4444', label: 'LAGGING' },
    weakening: { bg: 'rgba(245, 158, 11, 0.10)', dot: '#f59e0b', label: 'WEAKENING' },
};

const PAD = { top: 36, right: 36, bottom: 44, left: 52 };

export default function RRGChart({ data = [], width = 560, height = 420, onSectorClick }) {
    const [hovered, setHovered] = useState(null);

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;

    // Data-fit axis ranges: include current + all trail points
    const xRange = useMemo(() => {
        if (!data.length) return { min: 97, max: 103 };
        let lo = 100, hi = 100;
        for (const d of data) {
            lo = Math.min(lo, d.rsRatio); hi = Math.max(hi, d.rsRatio);
            if (d.trail) for (const t of d.trail) { lo = Math.min(lo, t.rs_ratio); hi = Math.max(hi, t.rs_ratio); }
        }
        const span = Math.max(hi - lo, 2);
        const pad = span * 0.2;
        return { min: Math.floor((lo - pad) * 2) / 2, max: Math.ceil((hi + pad) * 2) / 2 };
    }, [data]);

    const yRange = useMemo(() => {
        if (!data.length) return { min: 99, max: 101 };
        let lo = 100, hi = 100;
        for (const d of data) {
            lo = Math.min(lo, d.rsMomentum); hi = Math.max(hi, d.rsMomentum);
            if (d.trail) for (const t of d.trail) { lo = Math.min(lo, t.rs_momentum); hi = Math.max(hi, t.rs_momentum); }
        }
        const span = Math.max(hi - lo, 1);
        const pad = span * 0.3;
        return { min: Math.floor((lo - pad) * 4) / 4, max: Math.ceil((hi + pad) * 4) / 4 };
    }, [data]);

    const sx = useCallback(v => PAD.left + ((v - xRange.min) / (xRange.max - xRange.min)) * plotW, [xRange, plotW]);
    const sy = useCallback(v => PAD.top + plotH - ((v - yRange.min) / (yRange.max - yRange.min)) * plotH, [yRange, plotH]);

    const cx = sx(100);
    const cy = sy(100);

    // Nice tick generation per axis
    const makeTicks = (range) => {
        const span = range.max - range.min;
        // Pick a "nice" step: 0.5, 1, 2, 5, 10...
        const rawStep = span / 6;
        const niceSteps = [0.25, 0.5, 1, 2, 5, 10, 20];
        const step = niceSteps.find(s => s >= rawStep) || rawStep;
        const start = Math.ceil(range.min / step) * step;
        const result = [];
        for (let v = start; v <= range.max + step * 0.01; v += step) result.push(parseFloat(v.toFixed(2)));
        if (!result.includes(100)) result.push(100);
        return result.sort((a, b) => a - b);
    };
    const xTicks = useMemo(() => makeTicks(xRange), [xRange]);
    const yTicks = useMemo(() => makeTicks(yRange), [yRange]);

    return (
        <svg viewBox={`0 0 ${width} ${height}`}
            style={{ borderRadius: 8, backgroundColor: 'var(--bg-secondary, #111827)', width: '100%', maxWidth: width, height: 'auto' }}>

            {/* Quadrant backgrounds */}
            <rect x={PAD.left} y={PAD.top} width={cx - PAD.left} height={cy - PAD.top}
                fill={QUADRANT_COLORS.improving.bg} />
            <rect x={cx} y={PAD.top} width={PAD.left + plotW - cx} height={cy - PAD.top}
                fill={QUADRANT_COLORS.leading.bg} />
            <rect x={PAD.left} y={cy} width={cx - PAD.left} height={PAD.top + plotH - cy}
                fill={QUADRANT_COLORS.lagging.bg} />
            <rect x={cx} y={cy} width={PAD.left + plotW - cx} height={PAD.top + plotH - cy}
                fill={QUADRANT_COLORS.weakening.bg} />

            {/* Quadrant labels */}
            {[
                { q: 'improving', x: PAD.left + (cx - PAD.left) / 2, y: PAD.top + 14 },
                { q: 'leading',   x: cx + (PAD.left + plotW - cx) / 2, y: PAD.top + 14 },
                { q: 'lagging',   x: PAD.left + (cx - PAD.left) / 2, y: PAD.top + plotH - 6 },
                { q: 'weakening', x: cx + (PAD.left + plotW - cx) / 2, y: PAD.top + plotH - 6 },
            ].map(({ q, x, y }) => (
                <text key={q} x={x} y={y} textAnchor="middle"
                    style={{ fill: QUADRANT_COLORS[q].dot, fontSize: 10, opacity: 0.4, fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.5px' }}>
                    {QUADRANT_COLORS[q].label}
                </text>
            ))}

            {/* Crosshair */}
            <line x1={PAD.left} y1={cy} x2={PAD.left + plotW} y2={cy}
                stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4,4" />
            <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4,4" />

            {/* Grid lines - X axis */}
            {xTicks.map(t => t !== 100 && (
                <line key={`gx-${t}`} x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + plotH}
                    stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            ))}
            {/* Grid lines - Y axis */}
            {yTicks.map(t => t !== 100 && (
                <line key={`gy-${t}`} x1={PAD.left} y1={sy(t)} x2={PAD.left + plotW} y2={sy(t)}
                    stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            ))}

            {/* Axes */}
            <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.25)" strokeWidth={1} />

            {/* X tick labels */}
            {xTicks.map(t => (
                <text key={`tx-${t}`} x={sx(t)} y={PAD.top + plotH + 14} textAnchor="middle"
                    style={{ fill: t === 100 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', fontSize: t === 100 ? 10 : 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: t === 100 ? 600 : 400 }}>
                    {t}
                </text>
            ))}
            {/* Y tick labels */}
            {yTicks.map(t => (
                <text key={`ty-${t}`} x={PAD.left - 6} y={sy(t) + 3} textAnchor="end"
                    style={{ fill: t === 100 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', fontSize: t === 100 ? 10 : 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: t === 100 ? 600 : 400 }}>
                    {t}
                </text>
            ))}

            {/* Axis labels */}
            <text x={PAD.left + plotW / 2} y={height - 4} textAnchor="middle"
                style={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter, sans-serif' }}>
                RS Ratio
            </text>
            <text x={12} y={PAD.top + plotH / 2} textAnchor="middle"
                transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
                style={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter, sans-serif' }}>
                RS Momentum
            </text>

            {/* Trailing tails */}
            {data.map(sector => {
                if (!sector.trail?.length) return null;
                const q = sector.quadrant || 'lagging';
                const color = (QUADRANT_COLORS[q] || QUADRANT_COLORS.lagging).dot;
                const isHov = hovered === sector.etf;

                // Full path: trail points (oldest first) + current position
                const points = [
                    ...sector.trail.map(t => ({ x: sx(t.rs_ratio), y: sy(t.rs_momentum) })),
                    { x: sx(sector.rsRatio), y: sy(sector.rsMomentum) },
                ];
                const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

                return (
                    <g key={`trail-${sector.etf}`}>
                        <polyline points={polyline} fill="none" stroke={color}
                            strokeWidth={isHov ? 3 : 2} opacity={isHov ? 0.8 : 0.5}
                            strokeLinecap="round" strokeLinejoin="round" />
                        {sector.trail.map((t, i) => (
                            <circle key={i} cx={sx(t.rs_ratio)} cy={sy(t.rs_momentum)}
                                r={2.5 + (i / sector.trail.length) * 2}
                                fill={color} opacity={0.3 + (i / sector.trail.length) * 0.4} />
                        ))}
                    </g>
                );
            })}

            {/* Sector dots */}
            {data.map(sector => {
                const dotX = sx(sector.rsRatio);
                const dotY = sy(sector.rsMomentum);
                const q = sector.quadrant || 'lagging';
                const color = (QUADRANT_COLORS[q] || QUADRANT_COLORS.lagging).dot;
                const isHov = hovered === sector.etf;

                return (
                    <g key={sector.etf}
                        onMouseEnter={() => setHovered(sector.etf)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSectorClick?.(sector)}
                        style={{ cursor: onSectorClick ? 'pointer' : 'default' }}>

                        {isHov && <circle cx={dotX} cy={dotY} r={14} fill={color} opacity={0.15} />}

                        <circle cx={dotX} cy={dotY} r={isHov ? 7 : 5}
                            fill={color} stroke={isHov ? '#fff' : 'none'} strokeWidth={isHov ? 1.5 : 0} />

                        <text x={dotX} y={dotY - (isHov ? 12 : 9)} textAnchor="middle"
                            style={{
                                fill: isHov ? '#fff' : color,
                                fontSize: isHov ? 11 : 9,
                                fontFamily: 'Inter, sans-serif',
                                fontWeight: isHov ? 700 : 500,
                            }}>
                            {sector.etf}
                        </text>

                        {/* Tooltip */}
                        {isHov && (() => {
                            const hasErn = sector.daysToEarnings != null;
                            const ttH = hasErn ? 68 : 54;
                            return (
                            <g>
                                <rect x={dotX + 12} y={dotY - 38} width={145} height={ttH} rx={6}
                                    fill="rgba(10, 14, 26, 0.95)" stroke="var(--border-subtle, rgba(71,85,105,0.4))" strokeWidth={1} />
                                <text x={dotX + 20} y={dotY - 22}
                                    style={{ fill: '#f1f5f9', fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                                    {sector.sector}
                                </text>
                                <text x={dotX + 20} y={dotY - 8}
                                    style={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                                    Ratio: {sector.rsRatio?.toFixed(2)}
                                </text>
                                <text x={dotX + 20} y={dotY + 6}
                                    style={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                                    Mom: {sector.rsMomentum?.toFixed(2)}
                                </text>
                                {hasErn && (
                                    <text x={dotX + 20} y={dotY + 20}
                                        style={{ fill: sector.daysToEarnings <= 45 ? '#f59e0b' : 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                                        Earnings: {sector.daysToEarnings}d
                                    </text>
                                )}
                            </g>
                            );
                        })()}
                    </g>
                );
            })}
        </svg>
    );
}
