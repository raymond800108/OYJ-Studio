import { NextResponse } from "next/server";
import { getSession, getUserProfile } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const profile = await getUserProfile(session.userId);
  if (!profile) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar,
      provider: profile.provider,
      plan: profile.plan,
      credits: profile.credits,
    },
  });
}
