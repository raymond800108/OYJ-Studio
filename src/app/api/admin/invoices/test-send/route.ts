import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendInvoiceEmail, renderInvoiceHtml } from "@/lib/invoices";
import type { InvoiceData } from "@/lib/invoices";

/**
 * Send a sample invoice to a target email to verify Resend is wired up.
 * Doesn't touch Redis — pure mock data.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const to: string = typeof body?.to === "string" && body.to
    ? body.to
    : "raymond800108@gmail.com";

  const now = new Date();
  const periodLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const mockInvoice: InvoiceData = {
    company: {
      id: "test-company",
      name: "Test Company Ltd.",
      email: to,
      notes: "This is a test invoice — no real charges apply.",
      createdAt: Date.now(),
    },
    users: [],
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
    periodLabel,
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

  const result = await sendInvoiceEmail(mockInvoice);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        // Include rendered HTML so admin can preview even on failure
        previewHtml: renderInvoiceHtml(mockInvoice),
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: result.id,
    sentTo: to,
    note: "Test invoice sent. Check inbox (and spam folder).",
  });
}
