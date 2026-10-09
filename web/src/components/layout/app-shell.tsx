/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { HEADER_ICON_BUTTON } from "./styles";

type ShellUser = { name: string; email: string; role: "ADMIN" | "USER" };
const COLLAPSE_KEY = "qs-sidebar-collapsed";

function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src="/brand/logo.png" alt="QSGS" className={cn("brand-light-only h-[30px] w-auto", className)} />
      <img src="/brand/logo-white.png" alt="QSGS" className={cn("brand-dark-only h-[30px] w-auto", className)} />
    </>
  );
}

function NavList({ role, collapsed, onNavigate }: { role: ShellUser["role"]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Main">
      {NAV.filter((s) => !s.adminOnly || role === "ADMIN").map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.label ? (
            <p
              className={cn(
                "mb-1 px-3 text-[11px] font-[600] tracking-[0.08em] text-qs-text-faint uppercase transition-opacity",
                collapsed && "pointer-events-none h-0 overflow-hidden opacity-0",
              )}
            >
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                data-tooltip={collapsed ? item.label : undefined}
                className={cn("qs-nav-item", collapsed && "justify-center gap-0 px-0")}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * App frame: 56px top bar across the full width, a 240px sidebar (64px when
 * collapsed) docked below it from `lg`, and a slide-in sidebar on smaller screens.
 */
export function AppShell({ user, theme, children }: { user: ShellUser; theme: "light" | "dark"; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a saved preference after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage can be unavailable (private mode); the sidebar just starts open.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile menu after navigating
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  return (
    <div className="min-h-dvh bg-qs-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:inline-flex focus:h-[34px] focus:items-center focus:rounded-md focus:bg-qs-brand focus:px-3.5 focus:text-[13.5px] focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-qs-topbar-border bg-qs-topbar px-3 sm:px-4">
        <button type="button" className={cn(HEADER_ICON_BUTTON, "lg:hidden")} aria-label="Open menu" onClick={() => setMobileOpen(true)}>
          <MenuIcon className="size-[18px]" aria-hidden />
        </button>
        <Link href="/" className="flex h-[30px] shrink-0 items-center gap-3" aria-label="Cost Database home">
          <Logo />
          <span className="hidden h-5 w-px bg-qs-border sm:block" aria-hidden />
          <span className="hidden text-[13.5px] font-[600] text-qs-text-secondary sm:block">Cost Database</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle initial={theme} />
          <UserMenu {...user} />
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed top-14 bottom-0 left-0 z-30 hidden flex-col border-r border-qs-border bg-qs-panel transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex-1", collapsed ? "overflow-visible" : "overflow-y-auto")}>
          <NavList role={user.role} collapsed={collapsed} />
        </div>
        <div className="border-t border-qs-border p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn("qs-nav-item w-full", collapsed && "justify-center gap-0 px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-tooltip={collapsed ? "Expand sidebar" : undefined}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden /> : <PanelLeftClose className="size-[18px]" aria-hidden />}
            <span className={cn(collapsed && "sr-only")}>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-[var(--qs-backdrop)]" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-qs-panel shadow-qs-popup animate-in slide-in-from-left-4 fade-in-0 duration-150">
            <div className="flex h-14 items-center justify-between border-b border-qs-border px-4">
              <Logo />
              <button type="button" className={HEADER_ICON_BUTTON} aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavList role={user.role} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("pt-14 transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-16" : "lg:pl-60")}>
        <main id="main" className="mx-auto w-full max-w-[calc(1280px_+_2*clamp(16px,2.5vw,24px))] px-[clamp(16px,2.5vw,24px)] py-5 max-sm:px-3 max-sm:py-4 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
