import { NextResponse } from "next/server";
import { getSession, getUserProfile, deductCredits } from "./auth";
import type { UserProfile } from "./auth";
import type { ApiAction } from "./usage";
import { getCreditsForAction } from "./credits";

/**
 * Auth + credit check helper for API route handlers.
 *
 * Returns the user profile if authenticated and has enough credits,
 * or a NextResponse error to return immediately.
 *
 * Usage:
 *   const authResult = await requireAuth("camera-generate");
 *   if (authResult.error) return authResult.error;
 *   const { user } = authResult;
 */
export async function requireAuth(
  action?: ApiAction
): Promise<
  | { user: UserProfile; error?: undefined }
  | { user?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Authentication required. Please sign in." },
        { status: 401 }
      ),
    };
  }

  const user = await getUserProfile(session.userId);
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "User profile not found." },
        { status: 401 }
      ),
    };
  }

  // Check and deduct credits if action specified
  if (action) {
    const cost = getCreditsForAction(action);
    if (cost > 0) {
      if (user.credits < cost) {
        return {
          error: NextResponse.json(
            {
              error: `Insufficient credits. This action costs ${cost} credit(s), you have ${user.credits}.`,
              creditsNeeded: cost,
              creditsAvailable: user.credits,
            },
            { status: 402 }
          ),
        };
      }

      const deducted = await deductCredits(session.userId, cost);
      if (!deducted) {
        return {
          error: NextResponse.json(
            { error: "Failed to deduct credits. Please try again." },
            { status: 500 }
          ),
        };
      }
      // Update user credits in returned profile
      user.credits -= cost;
    }
  }

  return { user };
}
