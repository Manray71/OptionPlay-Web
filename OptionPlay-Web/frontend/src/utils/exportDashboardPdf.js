import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Palette ──
const INDIGO  = [30, 27, 75];
const ACCENT  = [129, 140, 248];
const WHITE   = [255, 255, 255];
const GRAY    = [60, 60, 60];
const MID     = [120, 120, 120];
const LIGHT   = [160, 160, 160];
const GREEN   = [22, 163, 74];
const RED     = [220, 38, 38];
const AMBER   = [217, 119, 6];
const ROW_ALT = [245, 245, 250];

// ── Grid constants (A4 portrait) ──
const MG    = 10;
const PW    = 210;
const PH    = 297;
const CW    = PW - MG * 2;
const COL   = 38;
const ROW_H = 3.5;
const MID_X = MG + CW / 2;

const G = [MG, MG + COL, MG + COL * 2, MG + COL * 3, MG + COL * 4];
const R = [MID_X + 2, MID_X + 32, MID_X + 62];

const vixColor = (v) => v > 25 ? RED : v > 20 ? AMBER : v > 15 ? ACCENT : GREEN;

export function exportDashboardPdf(data) {
    if (!data) return;
    const { vix, vixChange, vixChangePct, regime, market = [], events = [], sectors = [], earnings = [], news = [] } = data;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let y = 0;

    // ── Helpers ──
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

    const fmtPrice = (p) => {
        if (p == null) return '—';
        return p >= 100 ? Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : Number(p).toFixed(p >= 10 ? 2 : 4);
    };
    const fmtChg = (pct) => pct != null ? `${pct >= 0 ? '+' : ''}${Number(pct).toFixed(2)}%` : '—';

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
    doc.text('Market Overview Report', MG, 13);

    // VIX on right with change
    if (vix != null) {
        let vixStr = `VIX ${Number(vix).toFixed(1)}`;
        if (vixChange != null) {
            vixStr += `  ${vixChange >= 0 ? '+' : ''}${vixChange.toFixed(2)}`;
            if (vixChangePct != null) vixStr += ` (${vixChangePct >= 0 ? '+' : ''}${vixChangePct.toFixed(2)}%)`;
        }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text(vixStr, PW - MG, 8, { align: 'right' });
    }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...WHITE);
    doc.text(`${dateStr}  ${timeStr}`, PW - MG, 13, { align: 'right' });
    y = 19;

    // ════════════════════════════════════════════════════════
    // 1. MARKET SNAPSHOT (key stats row)
    // ════════════════════════════════════════════════════════
    section('Market Snapshot');
    const vc = vixColor(vix);
    ikv('VIX', vix != null ? Number(vix).toFixed(1) : '—', G[0], { color: vc });
    ikv('Regime', regime || '—', G[1], { color: vc });
    if (vixChange != null) {
        const chgStr = `${vixChange >= 0 ? '+' : ''}${vixChange.toFixed(2)}${vixChangePct != null ? ` (${vixChangePct >= 0 ? '+' : ''}${vixChangePct.toFixed(2)}%)` : ''}`;
        ikv('Change', chgStr, G[2], { color: vixChange > 0 ? RED : vixChange < 0 ? GREEN : GRAY });
    }
    row();
    const spy = market.find(m => m.symbol === 'SPY');
    const qqq = market.find(m => m.symbol === 'QQQ');
    if (spy) ikv('SPY', `${fmtPrice(spy.price)} (${fmtChg(spy.change_pct)})`, G[0], { color: spy.change_pct >= 0 ? GREEN : RED });
    if (qqq) ikv('QQQ', `${fmtPrice(qqq.price)} (${fmtChg(qqq.change_pct)})`, G[2], { color: qqq.change_pct >= 0 ? GREEN : RED });
    row();

    // ════════════════════════════════════════════════════════
    // 2. MARKET INDICES TABLE
    // ════════════════════════════════════════════════════════
    section('Market Indices');
    autoTable(doc, {
        startY: y,
        head: [['Symbol', 'Name', 'Price', 'Change']],
        body: market.map(m => [m.symbol, m.name || m.symbol, fmtPrice(m.price), fmtChg(m.change_pct)]),
        theme: 'grid',
        margin: { left: MG, right: MG },
        tableWidth: CW,
        headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 6, cellPadding: 1 },
        bodyStyles: { fontSize: 6, cellPadding: 1 },
        alternateRowStyles: { fillColor: ROW_ALT },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 22 },
            1: { cellWidth: 50 },
            2: { halign: 'right', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 25 },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
                const val = parseFloat(data.cell.raw);
                data.cell.styles.textColor = val > 0 ? GREEN : val < 0 ? RED : GRAY;
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });
    y = doc.lastAutoTable.finalY + 1;

    // ════════════════════════════════════════════════════════
    // 3. UPCOMING EVENTS & EARNINGS (merged)
    // ════════════════════════════════════════════════════════
    if (events.length || earnings.length) {
        section('Upcoming Events & Earnings');

        // Economic Events sub-table
        if (events.length) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...MID);
            doc.text('ECONOMIC EVENTS', MG, y);
            y += 1;
            autoTable(doc, {
                startY: y,
                head: [['Date', 'Days', 'Event', 'Description', 'Impact']],
                body: events.slice(0, 6).map(ev => [
                    ev.date, `${ev.days_away}d`, ev.name, ev.description || '', ev.impact || '',
                ]),
                theme: 'grid',
                margin: { left: MG, right: MG },
                tableWidth: CW,
                headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 6, cellPadding: 1 },
                bodyStyles: { fontSize: 5.5, cellPadding: 1 },
                alternateRowStyles: { fillColor: ROW_ALT },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 12, halign: 'center' },
                    2: { cellWidth: 40, fontStyle: 'bold' },
                    3: {},
                    4: { cellWidth: 18, halign: 'center' },
                },
                didParseCell: (data) => {
                    if (data.section === 'body') {
                        if (data.column.index === 1) {
                            const days = parseInt(data.cell.raw);
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = days <= 3 ? RED : days <= 7 ? AMBER : GRAY;
                        }
                        if (data.column.index === 4) {
                            const impact = data.cell.raw;
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = (impact === 'HIGH' || impact === 'CRITICAL') ? RED
                                : impact === 'MEDIUM' ? AMBER : MID;
                        }
                    }
                },
            });
            y = doc.lastAutoTable.finalY + 2;
        }

        // Earnings Calendar sub-table
        if (earnings.length) {
            doc.setFontSize(6);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...MID);
            doc.text('EARNINGS CALENDAR', MG, y);
            y += 1;
            autoTable(doc, {
                startY: y,
                head: [['Symbol', 'Date', 'Days', 'Status']],
                body: earnings.slice(0, 8).map(e => [
                    e.symbol,
                    e.date,
                    `${e.days_away}d`,
                    e.status ? e.status.charAt(0).toUpperCase() + e.status.slice(1) : '—',
                ]),
                theme: 'grid',
                margin: { left: MG, right: MG },
                tableWidth: CW,
                headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 6, cellPadding: 1 },
                bodyStyles: { fontSize: 6, cellPadding: 1 },
                alternateRowStyles: { fillColor: ROW_ALT },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 25 },
                    1: { cellWidth: 28 },
                    2: { cellWidth: 18, halign: 'center' },
                    3: { cellWidth: 22, halign: 'center' },
                },
                didParseCell: (data) => {
                    if (data.section === 'body') {
                        if (data.column.index === 2) {
                            const days = parseInt(data.cell.raw);
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = days <= 14 ? RED : days <= 45 ? AMBER : GRAY;
                        }
                        if (data.column.index === 3) {
                            const s = data.cell.raw.toLowerCase();
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.textColor = s === 'safe' ? GREEN : s === 'caution' ? AMBER : RED;
                        }
                    }
                },
            });
            y = doc.lastAutoTable.finalY + 1;
        }
    }

    // ════════════════════════════════════════════════════════
    // 4. SECTOR MOMENTUM
    // ════════════════════════════════════════════════════════
    if (sectors.length) {
        section('Sector Momentum');
        autoTable(doc, {
            startY: y,
            head: [['Sector', 'ETF', 'Factor', 'Regime', 'RS 30d', 'RS 60d', 'Breadth']],
            body: sectors.slice(0, 11).map(s => [
                s.sector,
                s.etf,
                s.momentum_factor != null ? Number(s.momentum_factor).toFixed(3) : '—',
                s.regime || '—',
                s.rs_30d != null ? `${s.rs_30d >= 0 ? '+' : ''}${Number(s.rs_30d).toFixed(2)}%` : '—',
                s.rs_60d != null ? `${s.rs_60d >= 0 ? '+' : ''}${Number(s.rs_60d).toFixed(2)}%` : '—',
                s.breadth != null ? Number(s.breadth).toFixed(3) : '—',
            ]),
            theme: 'grid',
            margin: { left: MG, right: MG },
            tableWidth: CW,
            headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 6, cellPadding: 1 },
            bodyStyles: { fontSize: 5.5, cellPadding: 1 },
            alternateRowStyles: { fillColor: ROW_ALT },
            columnStyles: {
                0: { cellWidth: 36, fontStyle: 'bold' },
                1: { cellWidth: 16, halign: 'center' },
                2: { cellWidth: 22, halign: 'right' },
                3: { cellWidth: 22, halign: 'center' },
                4: { cellWidth: 22, halign: 'right' },
                5: { cellWidth: 22, halign: 'right' },
                6: { cellWidth: 22, halign: 'right' },
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    if (data.column.index === 2) {
                        const val = parseFloat(data.cell.raw);
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = val >= 1.0 ? GREEN : val < 0.85 ? RED : GRAY;
                    }
                    if (data.column.index === 3) {
                        const r = data.cell.raw;
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = r === 'STRONG' ? GREEN
                            : (r === 'WEAK' || r === 'CRISIS') ? RED : MID;
                    }
                    if (data.column.index === 4 || data.column.index === 5) {
                        data.cell.styles.textColor = parseFloat(data.cell.raw) >= 0 ? GREEN : RED;
                    }
                }
            },
        });
        y = doc.lastAutoTable.finalY + 1;
    }

    // ════════════════════════════════════════════════════════
    // 5. TOP NEWS
    // ════════════════════════════════════════════════════════
    if (news.length) {
        section('Top News');
        news.slice(0, 5).forEach((item) => {
            const sc = item.sentiment === 'positive' ? GREEN : item.sentiment === 'negative' ? RED : MID;
            doc.setFillColor(...sc);
            doc.circle(MG + 1, y - 0.8, 0.8, 'F');

            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...GRAY);
            const maxW = CW - 6;
            doc.text(doc.splitTextToSize(item.title || '', maxW)[0], MG + 4, y);
            y += 2.5;
            doc.setFontSize(5);
            doc.setTextColor(...LIGHT);
            doc.text([item.publisher || item.source, item.date].filter(Boolean).join(' - '), MG + 4, y);
            y += ROW_H;
        });
    }

    // ── Footer ──
    doc.setFontSize(6);
    doc.setTextColor(...LIGHT);
    doc.text(
        `OptionPlay Market Overview  |  ${dateStr} ${timeStr}`,
        PW / 2, PH - 5, { align: 'center' }
    );

    const fn = `optionplay-market-overview-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf`;
    doc.save(fn);
}
