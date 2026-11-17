import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { labelQr, type PrintLabel, SHEET, sheetPositions } from '@inventory/shared';

/** The QR is about 30 mm square (spec §10.3); the rest of the label holds the name and code. */
const QR_MM = 30;
const PAD_MM = 4;

/** Draws a QR as filled squares, so it prints sharp at any printer resolution. */
function drawQr(doc: jsPDF, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell, 'F');
    }
  }
}

/**
 * An A4 PDF of labels: QR, the thing's name and the code in small print for an assigned Label; QR
 * and code for a Blank label. The Location isn't printed. Starts at sheet position `start`.
 */
export function labelPdf(labels: PrintLabel[], start = 1): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let page = 0;
  for (const [i, pos] of sheetPositions(labels.length, start).entries()) {
    const label = labels[i]!;
    while (pos.page > page) {
      doc.addPage('a4', 'portrait');
      page += 1;
    }
    const qrY = pos.y + (SHEET.labelHeight - QR_MM) / 2;
    drawQr(doc, labelQr(label.code), pos.x + 1.5, qrY, QR_MM);
    const textX = pos.x + QR_MM + PAD_MM;
    const textWidth = SHEET.labelWidth - QR_MM - PAD_MM - 2;
    if (label.name) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const lines = (doc.splitTextToSize(label.name, textWidth) as string[]).slice(0, 4);
      doc.text(lines, textX, pos.y + 10);
    }
    doc.setFont('courier', 'normal');
    doc.setFontSize(label.name ? 8 : 14);
    doc.text(label.code, textX, label.name ? pos.y + SHEET.labelHeight - 6 : pos.y + SHEET.labelHeight / 2 + 2);
  }
  return doc;
}
