import localFont from "next/font/local";

/** Funnel Sans (OFL licence), variable 300–800 so 550/600 weights render exactly. */
export const funnelSans = localFont({
  src: [
    { path: "./fonts/Funnel Sans/FunnelSans-VariableFont_wght.ttf", weight: "300 800", style: "normal" },
    { path: "./fonts/Funnel Sans/FunnelSans-Italic-VariableFont_wght.ttf", weight: "300 800", style: "italic" },
  ],
  variable: "--font-funnel-sans",
  display: "swap",
});
