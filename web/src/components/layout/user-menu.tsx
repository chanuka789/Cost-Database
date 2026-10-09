"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Settings } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { initials } from "@/lib/format";

export function UserMenu({ name, email, role }: { name: string; email: string; role: "ADMIN" | "USER" }) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className="inline-flex size-[34px] items-center justify-center rounded-full bg-qs-hover text-[12px] font-[600] text-qs-text-secondary transition-shadow outline-none hover:shadow-[0_0_0_2px_var(--qs-border-strong)] focus-visible:shadow-[var(--qs-focus-ring)] data-popup-open:shadow-[var(--qs-focus-ring)]"
      >
        {initials(name)}
      </MenuTrigger>
      <MenuContent className="w-60">
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="truncate text-[13px] font-[600]">{name}</p>
          <p className="truncate text-[12px] text-qs-text-muted">{email}</p>
          <span className="qs-badge mt-2" data-tone={role === "ADMIN" ? "brand" : undefined}>
            {role === "ADMIN" ? "Admin" : "User"}
          </span>
        </div>
        <MenuSeparator />
        <MenuItem render={<Link href="/settings" />}>
          <Settings aria-hidden />
          Settings
        </MenuItem>
        <MenuItem onClick={() => signOut({ callbackUrl: "/login?notice=signed-out" })}>
          <LogOut aria-hidden />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
