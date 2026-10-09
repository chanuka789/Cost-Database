"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { updateMyTheme } from "@/app/actions/account";
import { applyThemeToDocument } from "@/lib/apply-theme";
import { HEADER_ICON_BUTTON } from "./styles";

/** Sun/moon switch. Applies at once, then saves the choice to the user's account. */
export function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);

  async function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeToDocument(next);
    const res = await updateMyTheme(next);
    if (!res.ok) toast.error("Couldn't save your theme. It will reset next time you sign in.");
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={HEADER_ICON_BUTTON}>
      {theme === "dark" ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}
