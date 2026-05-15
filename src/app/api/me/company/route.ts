import { NextResponse } from "next/server";
import { getSession, getUserProfile } from "@/lib/auth";
import { getCompany } from "@/lib/companies";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ company: null });
  }
  const user = await getUserProfile(session.userId);
  if (!user?.companyId) {
    return NextResponse.json({ company: null });
  }
  const company = await getCompany(user.companyId);
  if (!company) {
    return NextResponse.json({ company: null });
  }
  // Return only safe fields to the user
  return NextResponse.json({
    company: { id: company.id, name: company.name },
  });
}
