import { getRedis } from "./redis";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface Company {
  id: string;
  name: string;
  /** Billing email — where monthly invoices are sent */
  email: string;
  /** Optional notes shown on invoice footer */
  notes?: string;
  createdAt: number;
}

/* ─── Keys ──────────────────────────────────────────────────────── */

const COMPANY_KEY = (id: string) => `ce:company:${id}`;
const COMPANY_INDEX = "ce:companies"; // Redis Set of company IDs

/* ─── CRUD ──────────────────────────────────────────────────────── */

export async function listCompanies(): Promise<Company[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = (await redis.smembers(COMPANY_INDEX)) as string[];
  if (!ids || ids.length === 0) return [];
  const results = await Promise.all(
    ids.map(async (id) => {
      const data = await redis.get(COMPANY_KEY(id));
      if (!data) return null;
      return typeof data === "string" ? (JSON.parse(data) as Company) : (data as Company);
    })
  );
  return results
    .filter((c): c is Company => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCompany(id: string): Promise<Company | null> {
  const redis = getRedis();
  if (!redis) return null;
  const data = await redis.get(COMPANY_KEY(id));
  if (!data) return null;
  return typeof data === "string" ? (JSON.parse(data) as Company) : (data as Company);
}

export async function createCompany(input: {
  name: string;
  email: string;
  notes?: string;
}): Promise<Company> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis not configured");
  const id = crypto.randomUUID();
  const company: Company = {
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    notes: input.notes?.trim() || undefined,
    createdAt: Date.now(),
  };
  await redis.set(COMPANY_KEY(id), JSON.stringify(company));
  await redis.sadd(COMPANY_INDEX, id);
  return company;
}

export async function updateCompany(
  id: string,
  patch: Partial<Omit<Company, "id" | "createdAt">>
): Promise<Company | null> {
  const redis = getRedis();
  if (!redis) return null;
  const existing = await getCompany(id);
  if (!existing) return null;
  const updated: Company = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || undefined } : {}),
  };
  await redis.set(COMPANY_KEY(id), JSON.stringify(updated));
  return updated;
}

export async function deleteCompany(id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  await redis.del(COMPANY_KEY(id));
  await redis.srem(COMPANY_INDEX, id);
  return true;
}
