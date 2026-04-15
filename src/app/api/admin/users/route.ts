import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { listAllUsers } from "@/lib/auth";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const users = await listAllUsers();
  // Strip nothing — admin sees everything relevant
  users.sort((a, b) => {
    const an = a.name || a.email || "";
    const bn = b.name || b.email || "";
    return an.localeCompare(bn);
  });
  return NextResponse.json({ users });
}
