/** Only same-site paths are allowed after sign-in, so links can't bounce users to other sites. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/login") || value.startsWith("/api/")) return fallback;
  return value;
}
