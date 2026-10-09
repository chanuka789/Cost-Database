import { Activity, FolderKanban, ListChecks, Search, Sparkles, Upload, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };
export type NavSection = { label?: string; adminOnly?: boolean; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "Rate search", icon: Search },
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { href: "/uploads", label: "Uploads", icon: Upload },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/lists", label: "Lists", icon: ListChecks },
      { href: "/admin/ai", label: "AI helper", icon: Sparkles },
      { href: "/admin/activity", label: "Activity log", icon: Activity },
    ],
  },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
