/**
 * Platform administrators, by email: ADMIN_EMAILS="you@example.com,other@example.com".
 * They see the admin panel and can change any account's plan.
 */
export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
