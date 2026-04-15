import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildInvoice, sendInvoiceEmail } from "@/lib/invoices";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const companyId: string = typeof body?.companyId === "string" ? body.companyId : "";
  const year: number = typeof body?.year === "number" ? body.year : new Date().getFullYear();
  const month: number =
    typeof body?.month === "number" ? body.month : new Date().getMonth() + 1;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const invoice = await buildInvoice(companyId, year, month);
  if (!invoice) {
    return NextResponse.json(
      { error: "Company not found or Redis unavailable" },
      { status: 404 }
    );
  }

  const result = await sendInvoiceEmail(invoice);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        invoice: {
          companyName: invoice.company.name,
          companyEmail: invoice.company.email,
          periodLabel: invoice.periodLabel,
          totalCostUsd: invoice.totalCostUsd,
        },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: result.id,
    sentTo: invoice.company.email,
    periodLabel: invoice.periodLabel,
    totalCostUsd: invoice.totalCostUsd,
  });
}
