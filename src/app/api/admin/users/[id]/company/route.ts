import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateUserProfile } from "@/lib/auth";
import { getCompany } from "@/lib/companies";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const companyId: string | null =
    body?.companyId === null || body?.companyId === ""
      ? null
      : typeof body?.companyId === "string"
      ? body.companyId
      : null;

  // Verify the company exists if not unassigning
  if (companyId) {
    const company = await getCompany(companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
  }

  const updated = await updateUserProfile(id, { companyId });
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ user: updated });
}
