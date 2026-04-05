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

    // Axis range: symmetric around 100, auto-fit to data
    const range = useMemo(() => {
        let maxDev = 3;
        for (const d of data) {
            maxDev = Math.max(maxDev, Math.abs(d.rsRatio - 100), Math.abs(d.rsMomentum - 100));
        }
        const pad = Math.ceil(maxDev * 1.25);
        return { min: 100 - pad, max: 100 + pad };
    }, [data]);

    const sx = useCallback(v => PAD.left + ((v - range.min) / (range.max - range.min)) * plotW, [range, plotW]);
    const sy = useCallback(v => PAD.top + plotH - ((v - range.min) / (range.max - range.min)) * plotH, [range, plotH]);

    const cx = sx(100);
    const cy = sy(100);

    // Ticks
    const ticks = useMemo(() => {
        const step = Math.max(1, Math.round((range.max - range.min) / 8));
        const result = [];
        for (let v = range.min; v <= range.max; v += step) result.push(v);
        if (!result.includes(100)) result.push(100);
        return result.sort((a, b) => a - b);
    }, [range]);

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
            style={{ borderRadius: 8, backgroundColor: 'var(--bg-secondary, #111827)' }}>

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

            {/* Grid lines */}
            {ticks.map(t => t !== 100 && (
                <React.Fragment key={`g-${t}`}>
                    <line x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={PAD.top + plotH}
                        stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                    <line x1={PAD.left} y1={sy(t)} x2={PAD.left + plotW} y2={sy(t)}
                        stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                </React.Fragment>
            ))}

            {/* Axes */}
            <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.25)" strokeWidth={1} />

            {/* Tick labels */}
            {ticks.map(t => (
                <React.Fragment key={`t-${t}`}>
                    <text x={sx(t)} y={PAD.top + plotH + 14} textAnchor="middle"
                        style={{ fill: t === 100 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', fontSize: t === 100 ? 10 : 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: t === 100 ? 600 : 400 }}>
                        {t}
                    </text>
                    <text x={PAD.left - 6} y={sy(t) + 3} textAnchor="end"
                        style={{ fill: t === 100 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', fontSize: t === 100 ? 10 : 9, fontFamily: "'JetBrains Mono', monospace", fontWeight: t === 100 ? 600 : 400 }}>
                        {t}
                    </text>
                </React.Fragment>
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
                        {isHov && (
                            <g>
                                <rect x={dotX + 12} y={dotY - 38} width={145} height={54} rx={6}
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
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
