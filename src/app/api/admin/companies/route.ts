import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "@/lib/companies";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const companies = await listCompanies();
  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const notes = typeof body?.notes === "string" ? body.notes : undefined;

  if (!name.trim() || !email.trim()) {
    return NextResponse.json(
      { error: "name and email are required" },
      { status: 400 }
    );
  }

  const company = await createCompany({ name, email, notes });
  return NextResponse.json({ company });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const patch: Record<string, string | undefined> = {};
  if (typeof body?.name === "string") patch.name = body.name;
  if (typeof body?.email === "string") patch.email = body.email;
  if (typeof body?.notes === "string") patch.notes = body.notes;

  const company = await updateCompany(id, patch);
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  return NextResponse.json({ company });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  await deleteCompany(id);
  return NextResponse.json({ ok: true });
}
