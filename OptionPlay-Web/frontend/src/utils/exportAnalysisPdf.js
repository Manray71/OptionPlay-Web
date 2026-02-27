import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Palette ──
const INDIGO = [30, 27, 75];
const WHITE  = [255, 255, 255];
const GRAY   = [60, 60, 60];
const MID    = [120, 120, 120];
const LIGHT  = [160, 160, 160];
const GREEN  = [22, 163, 74];
const RED    = [220, 38, 38];
const AMBER  = [217, 119, 6];
const ROW_ALT = [245, 245, 250];

// ── Grid constants ──
const MG    = 10;                       // margin
const PW    = 210;                      // A4 width
const PH    = 297;                      // A4 height
const CW    = PW - MG * 2;             // 190mm content width
const COL   = 38;                       // column width (5 cols = 190)
const ROW_H = 3.5;                      // row height
const MID_X = MG + CW / 2;             // 105mm page center

// 5 equal grid columns for full-width sections
const G = [MG, MG + COL, MG + COL * 2, MG + COL * 3, MG + COL * 4];

// Left-half columns (3 x 30mm for side-by-side)
const L = [MG, MG + 30, MG + 60];

// Right-half columns (3 x 30mm for side-by-side)
const R = [MID_X + 2, MID_X + 32, MID_X + 62];

export function exportAnalysisPdf(result) {
    if (!result) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let y = 0;

    // ── Helpers ──
    const pct  = (v, d = 1) => v != null ? `${Number(v).toFixed(d)}%` : '—';
    const usd  = (v) => v != null ? `$${Number(v).toFixed(2)}` : '—';
    const dist = (p) => {
        if (!result.price || !p) return '—';
        const d = ((p - result.price) / result.price) * 100;
        return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
    };

    // Key-value: label left-aligned at x, value right-aligned at x + colWidth
    // colWidth defaults to COL (38mm)
    // Key-value: label left, value left-aligned after fixed label width
    const ikv = (label, value, x, opts = {}) => {
        const sz = opts.size || 6.5;
        doc.setFontSize(sz);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID);
        doc.text(label, x, y);
        const labelW = doc.getTextWidth(label) + 1.5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(opts.color || GRAY));
        doc.text(String(value ?? '—'), x + labelW, y);
    };

    // Section divider
    const section = (title, atY) => {
        if (atY != null) y = atY;
        y += 1.5;
        doc.setDrawColor(200, 200, 210);
        doc.setLineWidth(0.3);
        doc.line(MG, y, PW - MG, y);
        y += ROW_H;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INDIGO);
        doc.text(title, MG, y);
        y += ROW_H;
    };

    const row = () => { y += ROW_H; };

    // ════════════════════════════════════════════════════════
    // HEADER
    // ════════════════════════════════════════════════════════
    doc.setFillColor(...INDIGO);
    doc.rect(0, 0, PW, 16, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('OptionPlay', MG, 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Analysis Report', MG, 13);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(result.symbol, PW - MG, 8, { align: 'right' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dateStr}  ${timeStr}`, PW - MG, 13, { align: 'right' });
    y = 19;

    // ════════════════════════════════════════════════════════
    // 1. OVERVIEW
    // ════════════════════════════════════════════════════════
    section('Overview');
    ikv('Price',   usd(result.price), G[0]);
    ikv('IV Pctl', pct(result.ivPercentile, 0), G[1],
        { color: result.ivPercentile >= 70 ? RED : result.ivPercentile >= 40 ? AMBER : GREEN });
    ikv('IV Rank', pct(result.ivRank, 0), G[2]);
    ikv('Curr IV', pct(result.ivCurrent), G[3]);
    ikv('HV 20d',  pct(result.hvCurrent), G[4]);
    row();
    ikv('Earnings', result.earningsDate
        ? `${result.earningsDate}${result.earningsDays != null ? ` (${result.earningsDays}d)` : ''}`
        : '—', G[0], { w: COL * 2 });
    if (result.fallingKnife) ikv('Falling Knife', 'YES', G[2], { color: RED });

    // ════════════════════════════════════════════════════════
    // 2. STRATEGY SCORES
    // ════════════════════════════════════════════════════════
    if (result.strategies?.length) {
        section('Strategy Scores');

        const sName  = MG;
        const sScore = MG + 38;
        const sSig   = MG + 48;
        const sBar   = MG + 64;
        const sBarW  = 38;
        const sComp  = sBar + sBarW + 3;

        result.strategies.forEach(s => {
            const sc = s.score >= 7 ? GREEN : s.score >= 5 ? AMBER : MID;

            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GRAY);
            doc.text(s.name, sName, y);
            doc.setTextColor(...sc);
            doc.text(s.score.toFixed(1), sScore, y, { align: 'right' });

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...(s.signal === 'Strong' ? GREEN : s.signal === 'Moderate' ? AMBER : MID));
            doc.text(s.signal, sSig, y);

            doc.setFillColor(230, 230, 235);
            doc.rect(sBar, y - 2, sBarW, 2.5, 'F');
            doc.setFillColor(...sc);
            doc.rect(sBar, y - 2, sBarW * (s.score / 10), 2.5, 'F');

            const comps = Object.entries(s.components || {});
            if (comps.length) {
                doc.setFontSize(5.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...LIGHT);
                const parts = comps.map(([key, comp]) => {
                    const isObj = typeof comp === 'object' && comp !== null;
                    const display = isObj && comp.display ? comp.display : (isObj ? comp.score.toFixed(1) : Number(comp).toFixed(1));
                    return `${key.replace(/_/g, ' ')}: ${display}`;
                });
                const txt = parts.join('  |  ');
                doc.text(doc.splitTextToSize(txt, PW - MG - sComp)[0], sComp, y);
            }
            y += ROW_H + 0.5;
        });
    }

    // ════════════════════════════════════════════════════════
    // 3. MOMENTUM
    // ════════════════════════════════════════════════════════
    const m = result.momentum;
    if (m) {
        section('Momentum');
        if (m.rsi != null)       ikv('RSI', Number(m.rsi).toFixed(1), G[0],
            { color: m.rsi <= 30 ? GREEN : m.rsi >= 70 ? RED : GRAY });
        if (m.rsiDivergence)     ikv('RSI Div', m.rsiDivergence, G[1]);
        if (m.adx != null)       ikv('ADX', Number(m.adx).toFixed(1), G[2]);
        if (m.trendStatus)       ikv('Trend', m.trendStatus, G[3]);
        row();
        if (m.macdSignal)        ikv('MACD', m.macdSignal, G[0]);
        if (m.macdHistogram != null) ikv('Hist', Number(m.macdHistogram).toFixed(3), G[1]);
        if (m.stochK != null) {
            const k = Number(m.stochK), d = Number(m.stochD);
            const sl = k < 20 ? 'oversold' : k > 80 ? 'overbought' : k > d ? 'bullish' : k < d ? 'bearish' : 'neutral';
            ikv('Stoch', `${sl} (${k.toFixed(0)}/${d.toFixed(0)})`, G[2]);
        }
        if (m.marketTrend)       ikv('SPY', m.marketTrend, G[3]);
    }

    // ════════════════════════════════════════════════════════
    // 4. S&R (left) + TRADE REC (right) — side by side
    // ════════════════════════════════════════════════════════
    const levels = result.levels;
    const rec = result.recommendation;

    if (levels && (levels.supports?.length || levels.resistances?.length)) {
        section('Support & Resistance');
        // Place "Trade Recommendation" title on the same line as the section title
        const sectionTitleY = y - ROW_H;
        if (rec) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...INDIGO);
            doc.text('Trade Recommendation', R[0], sectionTitleY);
        }
        const res = (levels.resistances || []).slice(0, 3);
        const sup = (levels.supports || []).slice(0, 4);
        const srData = [];
        res.reverse().forEach((l, i) => {
            srData.push([`R${res.length - i}`, usd(l.price), dist(l.price), l.type || '—', `${l.strength || 0}%`, `${l.touches || 0}`]);
        });
        if (result.price) srData.push(['Price', usd(result.price), '—', '', '', '']);
        sup.forEach((l, i) => {
            srData.push([`S${i + 1}`, usd(l.price), dist(l.price), l.type || '—', `${l.strength || 0}%`, `${l.touches || 0}`]);
        });

        const halfW = CW / 2 - 2;
        let bodyStartY = y;
        autoTable(doc, {
            startY: y,
            head: [['', 'Price', 'Dist', 'Type', 'Str', 'Tch']],
            body: srData,
            theme: 'grid',
            margin: { left: MG, right: PW - MG - halfW },
            tableWidth: halfW,
            headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 6, halign: 'center', cellPadding: 1 },
            bodyStyles: { fontSize: 6, cellPadding: 1 },
            alternateRowStyles: { fillColor: ROW_ALT },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 10, halign: 'center' },
                1: { halign: 'right', cellWidth: 18 },
                2: { halign: 'right', cellWidth: 14 },
                3: { halign: 'center' },
                4: { halign: 'center', cellWidth: 10 },
                5: { halign: 'center', cellWidth: 8 },
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const lbl = data.row.raw[0];
                    if (lbl === 'Price') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = INDIGO; }
                    else if (lbl.startsWith('R')) data.cell.styles.textColor = RED;
                    else if (lbl.startsWith('S')) data.cell.styles.textColor = GREEN;
                }
            },
            didDrawCell: (data) => {
                // Capture Y of first body row to align Trade Rec
                if (data.section === 'body' && data.row.index === 0 && data.column.index === 0) {
                    bodyStartY = data.cell.y + 1 + data.cell.height / 2;
                }
            },
        });
        const tableBottomY = doc.lastAutoTable.finalY;

        // ── Trade Recommendation — right half ──
        if (rec) {
            y = bodyStartY;
            // Row 1
            ikv('Strategy', rec.strategy || 'Bull-Put Spread', R[0], { w: 30 });
            ikv('Exp', rec.expiration || '—', R[1], { w: 30 });
            row();
            // Row 2
            ikv('Short', rec.shortStrike != null ? `$${rec.shortStrike}` : '—', R[0], { w: 30 });
            ikv('Long', rec.longStrike != null ? `$${rec.longStrike}` : '—', R[1], { w: 30 });
            ikv('DTE', rec.dte != null ? `${rec.dte}d` : '—', R[2], { w: 30 });
            row();
            // Row 3
            ikv('Credit', rec.creditEstimate || '—', R[0], { w: 30, color: GREEN });
            ikv('Max Risk', rec.maxRisk || '—', R[1], { w: 30, color: RED });
            ikv('RoR', rec.returnOnRisk || '—', R[2], { w: 30 });
            row();
            // Row 4
            ikv('Delta', rec.shortDelta != null ? Number(rec.shortDelta).toFixed(2) : '—', R[0], { w: 30 });
            ikv('Break Even', rec.breakEven != null ? usd(rec.breakEven) : '—', R[1], { w: 30 });
            ikv('Prob Profit', rec.probProfit != null ? pct(rec.probProfit, 0) : '—', R[2], { w: 30 });
            row();
            // Row 5
            if (rec.quality) {
                const qc = rec.quality === 'excellent' || rec.quality === 'good' ? GREEN : rec.quality === 'acceptable' ? AMBER : RED;
                ikv('Quality', rec.quality.charAt(0).toUpperCase() + rec.quality.slice(1), R[0], { w: 30, color: qc });
            }
            row();

            // Warnings
            if (rec.warnings?.length) {
                doc.setFontSize(5.5);
                doc.setTextColor(...AMBER);
                doc.setFont('helvetica', 'normal');
                rec.warnings.slice(0, 2).forEach(w => {
                    doc.text(doc.splitTextToSize(w, CW / 2 - 6)[0], R[0], y);
                    y += 2.5;
                });
            }
        }

        y = Math.max(tableBottomY, y) + 1;

    } else if (rec) {
        section('Trade Recommendation');
        ikv('Strategy', rec.strategy || 'Bull-Put Spread', G[0]);
        ikv('Exp', rec.expiration || '—', G[1]);
        ikv('DTE', rec.dte != null ? `${rec.dte}d` : '—', G[2]);
        row();
        ikv('Short', rec.shortStrike != null ? `$${rec.shortStrike}` : '—', G[0]);
        ikv('Long', rec.longStrike != null ? `$${rec.longStrike}` : '—', G[1]);
        ikv('Credit', rec.creditEstimate || '—', G[2], { color: GREEN });
        ikv('Max Risk', rec.maxRisk || '—', G[3], { color: RED });
        ikv('RoR', rec.returnOnRisk || '—', G[4]);
        row();
        ikv('Delta', rec.shortDelta != null ? Number(rec.shortDelta).toFixed(2) : '—', G[0]);
        ikv('Break Even', rec.breakEven != null ? usd(rec.breakEven) : '—', G[1]);
        ikv('Prob Profit', rec.probProfit != null ? pct(rec.probProfit, 0) : '—', G[2]);
        if (rec.quality) {
            const qc = rec.quality === 'excellent' || rec.quality === 'good' ? GREEN : rec.quality === 'acceptable' ? AMBER : RED;
            ikv('Quality', rec.quality.charAt(0).toUpperCase() + rec.quality.slice(1), G[3], { color: qc });
        }
    }

    // ════════════════════════════════════════════════════════
    // 5. ANALYSTS (left) + NEWS (right)
    // ════════════════════════════════════════════════════════
    const a = result.analysts;
    const news = result.news || [];

    if (a || news.length) {
        section('Analysts & News');
        const blockStartY = y;

        if (a) {
            ikv('Consensus', a.consensus || '—', L[0], { w: 30,
                color: a.consensus === 'Buy' ? GREEN : a.consensus === 'Sell' ? RED : AMBER });
            ikv('Target', a.priceTarget != null ? usd(a.priceTarget) : '—', L[1], { w: 30 });
            ikv('High / Low', `${a.high != null ? usd(a.high) : '—'} / ${a.low != null ? usd(a.low) : '—'}`, L[2], { w: 30 });
            row();
            const total = (a.buy || 0) + (a.hold || 0) + (a.sell || 0);
            if (total > 0) {
                ikv('Buy', `${a.buy || 0}`, L[0], { w: 30, color: GREEN });
                ikv('Hold', `${a.hold || 0}`, L[1], { w: 30 });
                ikv('Sell', `${a.sell || 0}`, L[2], { w: 30, color: RED });
            }
        }
        const analystBottomY = y;

        if (news.length) {
            y = blockStartY;
            news.slice(0, 5).forEach((item) => {
                const sc = item.sentiment === 'positive' ? GREEN : item.sentiment === 'negative' ? RED : MID;
                doc.setFillColor(...sc);
                doc.circle(R[0] + 1, y - 0.8, 0.8, 'F');

                doc.setFontSize(5.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...GRAY);
                const maxW = PW - MG - R[0] - 4;
                doc.text(doc.splitTextToSize(item.title, maxW)[0], R[0] + 4, y);
                y += 2.5;
                doc.setFontSize(5);
                doc.setTextColor(...LIGHT);
                doc.text([item.source, item.time].filter(Boolean).join(' - '), R[0] + 4, y);
                y += ROW_H;
            });
        }

        y = Math.max(analystBottomY, y);
    }

    // ── Footer ──
    doc.setFontSize(6);
    doc.setTextColor(...LIGHT);
    doc.text(
        `OptionPlay Analysis  |  ${result.symbol}  |  ${dateStr} ${timeStr}`,
        PW / 2, PH - 5, { align: 'center' }
    );

    const fn = `optionplay-analysis-${result.symbol}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf`;
    doc.save(fn);
}
