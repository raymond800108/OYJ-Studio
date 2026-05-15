import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildInvoice, sendInvoiceEmail, purgeUserUsageInRange } from "@/lib/invoices";
import { allocateInvoiceNumber } from "@/lib/invoice-number";
import { renderInvoicePdfBase64 } from "@/lib/invoice-pdf";
import { INVOICE_DEFAULTS } from "@/lib/business";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const companyId: string = typeof body?.companyId === "string" ? body.companyId : "";
  const year: number = typeof body?.year === "number" ? body.year : new Date().getFullYear();
  const month: number =
    typeof body?.month === "number" ? body.month : new Date().getMonth() + 1;
  /** Optional explicit recipient — must be a user assigned to the company,
   *  or the company's billing email. Falls back to company.email when absent. */
  const recipientEmail: string | undefined =
    typeof body?.recipientEmail === "string" && body.recipientEmail
      ? body.recipientEmail.toLowerCase()
      : undefined;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const builtInvoice = await buildInvoice(companyId, year, month);
  if (!builtInvoice) {
    return NextResponse.json(
      { error: "Company not found or Redis unavailable" },
      { status: 404 }
    );
  }

  // Validate the chosen recipient — must be the company billing email or a
  // user actually assigned to this company (prevents arbitrary emails).
  let finalRecipient = builtInvoice.company.email;
  if (recipientEmail) {
    const allowedEmails = new Set<string>(
      [
        builtInvoice.company.email.toLowerCase(),
        ...builtInvoice.users.map((u) => u.email?.toLowerCase()).filter(Boolean) as string[],
      ]
    );
    if (!allowedEmails.has(recipientEmail)) {
      return NextResponse.json(
        {
          error: `Recipient ${recipientEmail} is not the company billing email or a user assigned to this company.`,
        },
        { status: 400 }
      );
    }
    finalRecipient = recipientEmail;
  }

  // Allocate sequential invoice number + dates
  const invoiceNumber = await allocateInvoiceNumber(year, month);
  const issueTs = Date.now();
  const dueTs = issueTs + INVOICE_DEFAULTS.netDays * 86400000;
  const invoice = {
    ...builtInvoice,
    company: { ...builtInvoice.company, email: finalRecipient },
    invoiceNumber,
    issueDate: issueTs,
    dueDate: dueTs,
  };

  // Render PDF attachment
  let pdfBase64: string | null = null;
  try {
    pdfBase64 = await renderInvoicePdfBase64(invoice, invoiceNumber, issueTs, dueTs);
  } catch (err) {
    console.error("[invoice-send] PDF render error:", err);
    // Continue without attachment rather than failing the email
  }

  const attachments = pdfBase64
    ? [{ filename: `${invoiceNumber}.pdf`, content: pdfBase64 }]
    : undefined;

  const result = await sendInvoiceEmail(invoice, attachments);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        invoice: {
          invoiceNumber,
          companyName: invoice.company.name,
          companyEmail: invoice.company.email,
          periodLabel: invoice.periodLabel,
          totalCostUsd: invoice.totalCostUsd,
        },
      },
      { status: 502 }
    );
  }

  // Close out the billing period: delete invoiced entries for each
  // user in the company within the period.
  let purged = 0;
  for (const line of invoice.lines) {
    if (!line.userEmail) continue;
    purged += await purgeUserUsageInRange(
      line.userEmail,
      invoice.periodStart,
      invoice.periodEnd
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: result.id,
    invoiceNumber,
    sentTo: invoice.company.email,
    periodLabel: invoice.periodLabel,
    totalCostUsd: invoice.totalCostUsd,
    purgedEntries: purged,
    pdfAttached: !!pdfBase64,
  });
}
