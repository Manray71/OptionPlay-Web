import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportScannerPdf(rows, { strategy = 'Multi-Strategy', scanTime } = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = scanTime ? new Date(scanTime) : new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFillColor(30, 27, 75); // dark indigo
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('OptionPlay', 14, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Scanner Report', 14, 16);
    doc.setFontSize(9);
    doc.text(`${strategy}  •  ${dateStr} ${timeStr}`, pageWidth - 14, 10, { align: 'right' });
    doc.text(`${rows.length} candidates`, pageWidth - 14, 16, { align: 'right' });

    // Table
    const tableData = rows.map((r, i) => [
        i + 1,
        r.symbol,
        r.strategy,
        r.score?.toFixed(1) ?? '—',
        r.signal || '—',
        r.earningsDays != null ? `${r.earningsDate} (${r.earningsDays}d)` : '—',
        r.stability ?? '—',
        r.winRate != null ? `${r.winRate}%` : '—',
        r.credit != null && r.credit > 0 ? `$${r.credit.toFixed(2)}` : '—',
        r.shortStrike != null && r.longStrike != null ? `${r.shortStrike} / ${r.longStrike}` : '—',
        r.riskReward != null ? `${(r.riskReward * 100).toFixed(0)}%` : '—',
        r.tradeQuality != null ? r.tradeQuality.charAt(0).toUpperCase() + r.tradeQuality.slice(1) : '—',
        r.sector || '—',
    ]);

    autoTable(doc, {
        startY: 28,
        head: [['#', 'Symbol', 'Strategy', 'Score', 'Signal', 'Earnings', 'Stability', 'Hist. Win Rate', 'Credit', 'Strikes', 'RoR', 'Quality', 'Sector']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 27, 75],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
        },
        bodyStyles: {
            fontSize: 7,
            cellPadding: 1.5,
        },
        alternateRowStyles: {
            fillColor: [245, 245, 250],
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            1: { fontStyle: 'bold', cellWidth: 20 },
            3: { halign: 'center' },
            4: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'right' },
            9: { halign: 'center' },
            10: { halign: 'center' },
            11: { halign: 'center' },
        },
        didDrawPage: (data) => {
            const pageNum = doc.internal.getNumberOfPages();
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `OptionPlay Scanner Report  •  Page ${data.pageNumber} of ${pageNum}`,
                pageWidth / 2,
                doc.internal.pageSize.getHeight() - 6,
                { align: 'center' }
            );
        },
    });

    // Legend / Explanation section after the table
    const finalY = doc.lastAutoTable.finalY + 8;
    const pageHeight = doc.internal.pageSize.getHeight();

    // Add new page if not enough space for the legend
    const legendHeight = 70;
    if (finalY + legendHeight > pageHeight - 12) {
        doc.addPage();
        var legendY = 16;
    } else {
        var legendY = finalY;
    }

    const lineHeight = 3.5;
    const sectionGap = 6;

    // Signal Strength section
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 27, 75);
    doc.text('Signal Strength', 14, legendY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    const signalLines = [
        'Signal strength is derived from the multi-strategy scanner score and strategy consensus:',
        '  Strong — score >= 7.0 with at least 2 confirming strategies',
        '  Moderate — score >= 5.0',
        '  Weak — score < 5.0',
    ];

    signalLines.forEach((line, i) => {
        doc.text(line, 14, legendY + 5 + i * lineHeight);
    });

    // Quality Rating section
    const qualityY = legendY + 5 + signalLines.length * lineHeight + sectionGap;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 27, 75);
    doc.text('Quality Rating', 14, qualityY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    const qualityLines = [
        'Strike recommendation quality is a composite score (0–100) based on five factors:',
        '  OTM Distance (25%) — ideal range 10–15% below current price',
        '  Support Level (25%) — strength of technical support at short strike, bonus for Fibonacci confirmation',
        '  IV Rank (25%) — higher implied volatility rank means more premium collected',
        '  Risk/Reward (15%) — credit received relative to maximum loss',
        '  Probability of Profit (10%) — likelihood the spread expires out of the money',
        '',
        'Excellent (80+)  •  Good (60–79)  •  Acceptable (40–59)  •  Poor (<40)',
    ];

    qualityLines.forEach((line, i) => {
        doc.text(line, 14, qualityY + 5 + i * lineHeight);
    });

    const filename = `optionplay-scan-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`;
    doc.save(filename);
}
