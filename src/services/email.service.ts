import nodemailer from 'nodemailer';
import { Receipt } from '@prisma/client';
import { generateReceiptPDF } from './pdf.service';

function createTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendReceiptEmail(receipt: Receipt): Promise<void> {
  const pdfBuffer = await generateReceiptPDF(receipt);
  const transport = createTransport();

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'Code Heaven Studio <noreply@codeheaven.studio>',
    to: receipt.clientEmail,
    subject: `Receipt ${receipt.receiptNumber} from Code Heaven Studio`,
    html: buildEmailHtml(receipt),
    attachments: [
      {
        filename: `${receipt.receiptNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

function buildEmailHtml(receipt: Receipt): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; color: #374151; background: #f9fafb; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 32px auto; background: #fff; border-radius: 8px; padding: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    td { padding: 8px 0; font-size: 14px; }
    td:last-child { text-align: right; }
    .total td { font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .footer { font-size: 12px; color: #9ca3af; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Code Heaven Studio</h1>
    <p class="sub">Receipt ${receipt.receiptNumber}</p>

    <p>Hi ${receipt.clientName},</p>
    <p>Please find your receipt attached. Here is a summary:</p>

    <table>
      <tr><td>Receipt Number</td><td>${receipt.receiptNumber}</td></tr>
      <tr><td>Issue Date</td><td>${receipt.issueDate}</td></tr>
      ${receipt.dueDate ? `<tr><td>Due Date</td><td>${receipt.dueDate}</td></tr>` : ''}
      <tr><td>Subtotal</td><td>${fmtCurrency(receipt.subtotal)}</td></tr>
      ${receipt.tax > 0 ? `<tr><td>Tax</td><td>${fmtCurrency(receipt.tax)}</td></tr>` : ''}
      ${receipt.discount > 0 ? `<tr><td>Discount</td><td>-${fmtCurrency(receipt.discount)}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td>${fmtCurrency(receipt.total)}</td></tr>
    </table>

    ${receipt.notes ? `<p><strong>Notes:</strong> ${receipt.notes}</p>` : ''}

    <p class="footer">Thank you for your business!</p>
  </div>
</body>
</html>
  `.trim();
}

function fmtCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}
