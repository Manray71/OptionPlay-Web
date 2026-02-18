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
        r.sector || '—',
    ]);

    autoTable(doc, {
        startY: 28,
        head: [['#', 'Symbol', 'Strategy', 'Score', 'Signal', 'Earnings', 'Stability', 'Win Rate', 'Credit', 'Sector']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 27, 75],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
        },
        bodyStyles: {
            fontSize: 8,
            cellPadding: 2,
        },
        alternateRowStyles: {
            fillColor: [245, 245, 250],
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { fontStyle: 'bold', cellWidth: 22 },
            3: { halign: 'center' },
            4: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'right' },
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

    const filename = `optionplay-scan-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`;
    doc.save(filename);
}
