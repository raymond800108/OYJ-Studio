import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildInvoice, sendInvoiceEmail } from "@/lib/invoices";
import type { InvoiceData } from "@/lib/invoices";

/**
 * Send a real invoice (built from the selected company/year/month) but
 * redirected to a test recipient (default raymond800108@gmail.com).
 * Does NOT purge entries — strictly a preview-by-email.
 *
 * Falls back to fully mocked data if no companyId is provided, so admin
 * can still smoke-test the email pipeline before any company exists.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const to: string =
    typeof body?.to === "string" && body.to ? body.to : "raymond800108@gmail.com";
  const companyId: string | undefined =
    typeof body?.companyId === "string" && body.companyId ? body.companyId : undefined;
  const year: number =
    typeof body?.year === "number" ? body.year : new Date().getFullYear();
  const month: number =
    typeof body?.month === "number" ? body.month : new Date().getMonth() + 1;

  let invoice: InvoiceData | null = null;

  if (companyId) {
    invoice = await buildInvoice(companyId, year, month);
    if (!invoice) {
      return NextResponse.json(
        { error: "Company not found or Redis unavailable" },
        { status: 404 }
      );
    }
    // Redirect: keep the real company name in the body, but override the
    // recipient and tag the subject as a test.
    invoice = {
      ...invoice,
      company: {
        ...invoice.company,
        email: to, // Send target
        notes:
          (invoice.company.notes ? invoice.company.notes + "\n\n" : "") +
          "[TEST SEND] This is a preview — no charges apply.",
      },
    };
  } else {
    // No company selected → fall back to a synthetic invoice
    const now = new Date(year, month - 1, 1);
    invoice = {
      company: {
        id: "test-company",
        name: "Test Company Ltd.",
        email: to,
        notes: "[TEST SEND] No company selected — synthetic data.",
        createdAt: Date.now(),
      },
      users: [],
      periodStart: now.getTime(),
      periodEnd: new Date(year, month, 1).getTime(),
      periodLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      lines: [
        {
          userId: "u1",
          userName: "Sample User A",
          userEmail: "user-a@example.com",
          calls: 42,
          costUsd: 8.4,
        },
        {
          userId: "u2",
          userName: "Sample User B",
          userEmail: "user-b@example.com",
          calls: 17,
          costUsd: 3.4,
        },
      ],
      totalCalls: 59,
      totalCostUsd: 11.8,
    };
  }

  const result = await sendInvoiceEmail(invoice);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    messageId: result.id,
    sentTo: to,
    companyName: invoice.company.name,
    periodLabel: invoice.periodLabel,
    totalCostUsd: invoice.totalCostUsd,
    lineCount: invoice.lines.length,
  });
}
