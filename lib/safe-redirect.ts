// Only same-app relative paths are ever safe to redirect to after login;
// "//host" and "/\host" are protocol-relative and would leave the app.
export function safeCallbackUrl(value: string | undefined | null, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
