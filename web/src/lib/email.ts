/**
 * Sends invite and reset emails through Resend when RESEND_API_KEY and
 * EMAIL_FROM are set. Without them nothing is sent and the admin copies the
 * link from the Users screen instead — callers always get the link back.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function appUrl(path: string): string {
  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3100").replace(/\/$/, "");
  return `${base}${path}`;
}
