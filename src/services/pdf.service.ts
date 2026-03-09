import PDFDocument from 'pdfkit';
import { Receipt } from '@prisma/client';

interface ReceiptItem {
  id: string;
  serviceName: string;
  description: string;
  quantity: number;
  price: number;
}

export async function generateReceiptPDF(receipt: Receipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const items: ReceiptItem[] = (() => {
      try {
        return JSON.parse(receipt.items) as ReceiptItem[];
      } catch {
        return [];
      }
    })();

    const pageW = doc.page.width - 100; // usable width with margins

    // ── Header ─────────────────────────────────────────────────────────────────
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('Code Heaven Studio', 50, 50);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text('codeheaven.studio', 50, 80);

    // Receipt label + number (top-right)
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('RECEIPT', 350, 50, { align: 'right', width: 195 });

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#444444')
      .text(receipt.receiptNumber, 350, 76, { align: 'right', width: 195 });

    // Horizontal rule
    doc
      .moveTo(50, 100)
      .lineTo(545, 100)
      .strokeColor('#dddddd')
      .lineWidth(1)
      .stroke();

    // ── Dates & status ─────────────────────────────────────────────────────────
    const statusColors: Record<string, string> = {
      paid: '#16a34a',
      sent: '#2563eb',
      draft: '#9ca3af',
    };
    const statusColor = statusColors[receipt.status] ?? '#9ca3af';

    doc.y = 115;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888888')
      .text('Issue Date', 50, doc.y)
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .text(receipt.issueDate, 50, doc.y + 12);

    if (receipt.dueDate) {
      doc
        .font('Helvetica')
        .fillColor('#888888')
        .text('Due Date', 160, 115)
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text(receipt.dueDate, 160, 127);
    }

    // Status badge (top-right area)
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(statusColor)
      .text(receipt.status.toUpperCase(), 350, 120, { align: 'right', width: 195 });

    // ── Bill To ────────────────────────────────────────────────────────────────
    doc.y = 160;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888888')
      .text('BILL TO', 50, doc.y);

    doc.y += 14;
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(receipt.clientName, 50, doc.y);

    doc.y += 16;
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#444444')
      .text(receipt.clientEmail, 50, doc.y);

    if (receipt.companyName) {
      doc.y += 14;
      doc.text(receipt.companyName, 50, doc.y);
    }

    // ── Items table ────────────────────────────────────────────────────────────
    const tableTop = doc.y + 30;

    // Table header background
    doc.rect(50, tableTop, pageW, 22).fill('#f3f4f6');

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#374151')
      .text('SERVICE', 58, tableTop + 7)
      .text('QTY', 340, tableTop + 7, { width: 50, align: 'right' })
      .text('UNIT PRICE', 395, tableTop + 7, { width: 70, align: 'right' })
      .text('AMOUNT', 470, tableTop + 7, { width: 70, align: 'right' });

    let rowY = tableTop + 22;

    for (const [i, item] of items.entries()) {
      const rowBg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      const lineTotal = item.quantity * item.price;
      const serviceText = item.serviceName;
      const descText = item.description;

      // Estimate row height
      const textHeight = descText ? 32 : 20;
      doc.rect(50, rowY, pageW, textHeight).fill(rowBg);

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(serviceText, 58, rowY + 6, { width: 270 });

      if (descText) {
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#6b7280')
          .text(descText, 58, rowY + 18, { width: 270 });
      }

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#374151')
        .text(String(item.quantity), 340, rowY + 6, { width: 50, align: 'right' })
        .text(formatCurrency(item.price), 395, rowY + 6, { width: 70, align: 'right' })
        .text(formatCurrency(lineTotal), 470, rowY + 6, { width: 70, align: 'right' });

      rowY += textHeight;
    }

    // Bottom border of table
    doc.moveTo(50, rowY).lineTo(545, rowY).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // ── Totals ─────────────────────────────────────────────────────────────────
    rowY += 16;
    const totalsX = 380;

    function totalRow(label: string, value: number, bold = false): void {
      doc
        .fontSize(10)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(bold ? '#000000' : '#374151')
        .text(label, totalsX, rowY, { width: 90 })
        .text(formatCurrency(value), 475, rowY, { width: 65, align: 'right' });
      rowY += 18;
    }

    totalRow('Subtotal', receipt.subtotal);
    if (receipt.tax > 0) totalRow('Tax', receipt.tax);
    if (receipt.discount > 0) totalRow('Discount', -receipt.discount);

    // Divider before total
    doc.moveTo(totalsX, rowY).lineTo(545, rowY).strokeColor('#9ca3af').lineWidth(0.5).stroke();
    rowY += 8;
    totalRow('Total', receipt.total, true);

    // ── Notes ──────────────────────────────────────────────────────────────────
    if (receipt.notes) {
      rowY += 20;
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#888888')
        .text('NOTES', 50, rowY);

      rowY += 14;
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#374151')
        .text(receipt.notes, 50, rowY, { width: pageW });
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#9ca3af')
      .text('Thank you for your business.', 50, doc.page.height - 60, {
        align: 'center',
        width: pageW,
      });

    doc.end();
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}
