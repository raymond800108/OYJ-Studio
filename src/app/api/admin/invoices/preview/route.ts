import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildInvoice, renderInvoiceHtml } from "@/lib/invoices";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const companyId = req.nextUrl.searchParams.get("companyId") || "";
  const year = Number(req.nextUrl.searchParams.get("year") || new Date().getFullYear());
  const month = Number(req.nextUrl.searchParams.get("month") || new Date().getMonth() + 1);
  const format = req.nextUrl.searchParams.get("format"); // "html" | null

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const invoice = await buildInvoice(companyId, year, month);
  if (!invoice) {
    return NextResponse.json({ error: "Company not found or Redis unavailable" }, { status: 404 });
  }

  if (format === "html") {
    return new NextResponse(renderInvoiceHtml(invoice), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json({ invoice });
}
