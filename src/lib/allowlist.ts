/**
 * Email allowlist for login access control.
 *
 * - If ALLOWED_EMAILS env var is set, only those emails can sign in.
 *   Format: comma-separated, e.g. "alice@gmail.com,bob@gmail.com"
 *
 * - If ALLOWED_EMAILS is not set, the hardcoded list below is used.
 *
 * - If both are empty, all users are allowed (open access).
 */

const HARDCODED_EMAILS: string[] = [
  // Add allowed emails here, e.g.:
  "olivia.sc.yao@gmail.com",
  "raymond800108@gmail.com",
];

export function isEmailAllowed(email: string | null): boolean {
  // Read from env var first (comma-separated)
  const envList = process.env.ALLOWED_EMAILS;
  const allowlist = envList
    ? envList.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : HARDCODED_EMAILS.map((e) => e.toLowerCase());

  // If allowlist is empty, allow everyone
  if (allowlist.length === 0) return true;

  // No email provided — reject
  if (!email) return false;

  return allowlist.includes(email.toLowerCase());
}
