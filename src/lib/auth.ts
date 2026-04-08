import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getRedis } from "./redis";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: "line" | "google";
  plan: "free" | "starter" | "pro" | "business";
  credits: number;
  createdAt: number;
}

interface SessionPayload {
  sessionId: string;
  userId: string;
  expiresAt: number;
}

/* ─── Constants ─────────────────────────────────────────────────── */

const COOKIE_NAME = "ce-session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
const FREE_CREDITS = 15;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

/* ─── JWT helpers ───────────────────────────────────────────────── */

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Lightweight JWT verification for proxy (no Redis call) */
export async function verifySessionToken(token: string): Promise<boolean> {
  const payload = await decrypt(token);
  if (!payload) return false;
  return payload.expiresAt > Date.now();
}

/* ─── Session management ────────────────────────────────────────── */

export async function createSession(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis not configured");

  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL * 1000;

  // Store session in Redis
  await redis.set(
    `ce:session:${sessionId}`,
    JSON.stringify({ userId, expiresAt }),
    { ex: SESSION_TTL }
  );

  // Create JWT
  const token = await encrypt({ sessionId, userId, expiresAt });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await decrypt(token);
  if (!payload) return null;

  // Verify session still exists in Redis
  const redis = getRedis();
  if (!redis) return null;

  const session = await redis.get(`ce:session:${payload.sessionId}`);
  if (!session) return null;

  const data = typeof session === "string" ? JSON.parse(session) : session;
  return { userId: data.userId };
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    const payload = await decrypt(token);
    if (payload) {
      const redis = getRedis();
      if (redis) {
        await redis.del(`ce:session:${payload.sessionId}`);
      }
    }
  }

  cookieStore.delete(COOKIE_NAME);
}

/* ─── User management ───────────────────────────────────────────── */

export async function createOrUpdateUser(profile: {
  providerUserId: string;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: "line" | "google";
}): Promise<string> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis not configured");

  // Check if user exists by provider ID
  const providerKey = `ce:provider:${profile.provider}:${profile.providerUserId}`;
  let userId = await redis.get(providerKey) as string | null;

  // Check by email if no provider match
  if (!userId && profile.email) {
    userId = await redis.get(`ce:user:email:${profile.email}`) as string | null;
  }

  if (userId) {
    // Update existing user (name, avatar may change)
    const existing = await getUserProfile(userId);
    if (existing) {
      const updated: UserProfile = {
        ...existing,
        name: profile.name || existing.name,
        avatar: profile.avatar || existing.avatar,
      };
      await redis.set(`ce:user:${userId}`, JSON.stringify(updated));
    }
    return userId;
  }

  // Create new user
  userId = crypto.randomUUID();
  const user: UserProfile = {
    id: userId,
    name: profile.name,
    email: profile.email,
    avatar: profile.avatar,
    provider: profile.provider,
    plan: "free",
    credits: FREE_CREDITS,
    createdAt: Date.now(),
  };

  await redis.set(`ce:user:${userId}`, JSON.stringify(user));
  await redis.set(providerKey, userId);
  if (profile.email) {
    await redis.set(`ce:user:email:${profile.email}`, userId);
  }

  return userId;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const redis = getRedis();
  if (!redis) return null;

  const data = await redis.get(`ce:user:${userId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data as UserProfile;
}

/* ─── Credit management ─────────────────────────────────────────── */

export async function getUserCredits(userId: string): Promise<number> {
  const profile = await getUserProfile(userId);
  return profile?.credits ?? 0;
}

export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const profile = await getUserProfile(userId);
  if (!profile) return false;
  if (profile.credits < amount) return false;

  profile.credits -= amount;
  await redis.set(`ce:user:${userId}`, JSON.stringify(profile));
  return true;
}

export async function addCredits(userId: string, amount: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const profile = await getUserProfile(userId);
  if (!profile) return;

  profile.credits += amount;
  await redis.set(`ce:user:${userId}`, JSON.stringify(profile));
}

export async function hasEnoughCredits(userId: string, creditsNeeded: number): Promise<boolean> {
  const credits = await getUserCredits(userId);
  return credits >= creditsNeeded;
}
