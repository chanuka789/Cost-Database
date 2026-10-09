import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/toaster";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { funnelSans } from "./font-config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cost Database | QSGS", template: "%s | QSGS Cost Database" },
  description: "Quantity Surveying Global Solutions — BOQ rate database",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme is read from a cookie on the server, so the first paint is
  // already in the right theme — no flash. Light unless the user chose dark.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={`${theme} h-full ${funnelSans.variable}`} style={{ colorScheme: theme }}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
