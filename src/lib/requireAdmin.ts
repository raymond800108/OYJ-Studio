import { NextResponse } from "next/server";
import { getSession, getUserProfile } from "./auth";
import type { UserProfile } from "./auth";

/**
 * Super-admin email — hardcoded per project convention.
 * See AGENTS.md / session notes.
 */
export const SUPER_ADMIN_EMAIL = "raymond800108@gmail.com";

/**
 * Guard for admin-only API routes. Returns the admin user profile
 * or a NextResponse error to return immediately.
 *
 * Usage:
 *   const guard = await requireAdmin();
 *   if (guard.error) return guard.error;
 *   const { user } = guard;
 */
export async function requireAdmin(): Promise<
  | { user: UserProfile; error?: undefined }
  | { user?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      ),
    };
  }
  const user = await getUserProfile(session.userId);
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return {
      error: NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      ),
    };
  }
  return { user };
}
