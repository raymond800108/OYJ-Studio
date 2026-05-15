import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildInvoice, renderInvoiceHtml } from "@/lib/invoices";
import { previewInvoiceNumber } from "@/lib/invoice-number";
import { renderInvoicePdfBase64 } from "@/lib/invoice-pdf";
import { INVOICE_DEFAULTS } from "@/lib/business";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const companyId = req.nextUrl.searchParams.get("companyId") || "";
  const year = Number(req.nextUrl.searchParams.get("year") || new Date().getFullYear());
  const month = Number(req.nextUrl.searchParams.get("month") || new Date().getMonth() + 1);
  const format = req.nextUrl.searchParams.get("format"); // "html" | "pdf" | null

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const built = await buildInvoice(companyId, year, month);
  if (!built) {
    return NextResponse.json({ error: "Company not found or Redis unavailable" }, { status: 404 });
  }

  // Stamp preview metadata
  const invoiceNumber = previewInvoiceNumber(year, month);
  const issueTs = Date.now();
  const dueTs = issueTs + INVOICE_DEFAULTS.netDays * 86400000;
  const invoice = { ...built, invoiceNumber, issueDate: issueTs, dueDate: dueTs };

  if (format === "html") {
    return new NextResponse(renderInvoiceHtml(invoice), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (format === "pdf") {
    try {
      const base64 = await renderInvoicePdfBase64(invoice, invoiceNumber, issueTs, dueTs);
      const buf = Buffer.from(base64, "base64");
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "PDF render failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ invoice });
}
