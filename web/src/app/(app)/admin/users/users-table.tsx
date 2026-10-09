"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, MailPlus, MoreHorizontal, Pencil, Search, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { FormMessage } from "@/components/auth/form-message";
import { changeUserRole, createResetLink, renameUser, resendInvite, setUserDisabled } from "@/app/actions/users";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { LinkResult } from "./link-result";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
  inviteExpiresAt: string | null;
};

const STATUS: Record<UserRow["status"], { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INVITED: { label: "Invited", tone: "warning" },
  DISABLED: { label: "Disabled", tone: "neutral" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "INVITED", label: "Invited" },
  { key: "DISABLED", label: "Disabled" },
] as const;

type Pending =
  | { kind: "role"; user: UserRow; role: UserRow["role"] }
  | { kind: "disable"; user: UserRow; disabled: boolean }
  | null;

export function UsersTable({ rows, currentUserId }: { rows: UserRow[]; currentUserId: string; emailEnabled: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  // The confirm dialog keeps its content while it fades out, so `open` is separate from `confirm`.
  const [confirm, setConfirmState] = useState<Pending>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setConfirm = (p: NonNullable<Pending>) => {
    setConfirmState(p);
    setConfirmOpen(true);
  };
  const [link, setLinkState] = useState<{ link: string; emailed: boolean; email: string; kind: "invite" | "reset" } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [renaming, setRenaming] = useState<UserRow | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (filter === "all" || r.status === filter) && (!q || r.name.toLowerCase().includes(q) || r.email.includes(q)),
    );
  }, [rows, query, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, ACTIVE: 0, INVITED: 0, DISABLED: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  async function getLink(user: UserRow, kind: "invite" | "reset") {
    const res = kind === "invite" ? await resendInvite(user.id) : await createResetLink(user.id);
    if (!res.ok) return toast.error(res.error);
    setLinkState({ ...res.data, email: user.email, kind });
    setLinkOpen(true);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="qs-segmented w-fit" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className="qs-segmented-item"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="text-[11.5px] text-qs-text-faint tabular-nums">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-qs-text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search users" />
        </div>
      </div>

      <div className="qs-card overflow-x-auto">
        <table className="qs-table min-w-[720px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th className="w-12">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-qs-text-muted">
                  No users match.
                </td>
              </tr>
            ) : (
              visible.map((u) => {
                const isMe = u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3 py-1">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-qs-hover text-[11.5px] font-[600] text-qs-text-secondary">
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-[550]">
                            {u.name}
                            {isMe ? <span className="ml-1.5 text-[12px] font-normal text-qs-text-faint">(you)</span> : null}
                          </p>
                          <p className="truncate text-[12px] text-qs-text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>{u.role === "ADMIN" ? "Admin" : "User"}</Badge>
                    </td>
                    <td>
                      <Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge>
                      {u.status === "INVITED" && u.inviteExpiresAt ? (
                        <p className="mt-1 text-[11.5px] text-qs-text-faint">
                          {new Date(u.inviteExpiresAt) > new Date() ? `Link expires ${formatDate(u.inviteExpiresAt)}` : "Link expired"}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-qs-text-muted tabular-nums">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
                    <td>
                      <Menu>
                        <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`} />}>
                          <MoreHorizontal aria-hidden />
                        </MenuTrigger>
                        <MenuContent className="w-56">
                          <MenuItem onClick={() => setRenaming(u)}>
                            <Pencil aria-hidden />
                            Edit name
                          </MenuItem>
                          {u.status === "INVITED" ? (
                            <MenuItem onClick={() => getLink(u, "invite")}>
                              <MailPlus aria-hidden />
                              New invite link
                            </MenuItem>
                          ) : null}
                          {u.status === "ACTIVE" ? (
                            <MenuItem onClick={() => getLink(u, "reset")}>
                              <KeyRound aria-hidden />
                              Password reset link
                            </MenuItem>
                          ) : null}
                          {!isMe ? (
                            <>
                              <MenuSeparator />
                              <MenuItem onClick={() => setConfirm({ kind: "role", user: u, role: u.role === "ADMIN" ? "USER" : "ADMIN" })}>
                                {u.role === "ADMIN" ? <ShieldOff aria-hidden /> : <ShieldCheck aria-hidden />}
                                {u.role === "ADMIN" ? "Make user" : "Make admin"}
                              </MenuItem>
                              <MenuItem
                                tone={u.status === "DISABLED" ? undefined : "danger"}
                                onClick={() => setConfirm({ kind: "disable", user: u, disabled: u.status !== "DISABLED" })}
                              >
                                {u.status === "DISABLED" ? <UserCheck aria-hidden /> : <UserX aria-hidden />}
                                {u.status === "DISABLED" ? "Enable account" : "Disable account"}
                              </MenuItem>
                            </>
                          ) : null}
                        </MenuContent>
                      </Menu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirm?.kind === "role"
            ? confirm.role === "ADMIN"
              ? `Make ${confirm.user.name} an admin?`
              : `Remove admin role from ${confirm.user.name}?`
            : confirm?.kind === "disable"
              ? confirm.disabled
                ? `Disable ${confirm.user.name}?`
                : `Enable ${confirm.user.name}?`
              : ""
        }
        description={
          confirm?.kind === "role"
            ? confirm.role === "ADMIN"
              ? "Admins can upload BOQs, manage users and change lists. They'll be signed out and get admin access on their next sign-in."
              : "They'll keep access to search and projects but lose admin screens. They'll be signed out."
            : confirm?.kind === "disable" && confirm.disabled
              ? "They'll be signed out straight away and can't sign in until an admin enables the account again. Any open invite or reset link stops working."
              : "They'll be able to sign in again."
        }
        confirmLabel={
          confirm?.kind === "role" ? (confirm.role === "ADMIN" ? "Make admin" : "Make user") : confirm?.kind === "disable" && confirm.disabled ? "Disable" : "Enable"
        }
        tone={confirm?.kind === "disable" && confirm.disabled ? "danger" : "default"}
        onConfirm={async () => {
          if (!confirm) return null;
          const res =
            confirm.kind === "role" ? await changeUserRole(confirm.user.id, confirm.role) : await setUserDisabled(confirm.user.id, confirm.disabled);
          if (!res.ok) return res.error;
          toast.success(confirm.kind === "role" ? "Role changed" : confirm.disabled ? "Account disabled" : "Account enabled");
          router.refresh();
          return null;
        }}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{link?.kind === "invite" ? "New invite link" : "Password reset link"}</DialogTitle>
          </DialogHeader>
          {link ? <LinkResult {...link} /> : null}
          <DialogFooter>
            <Button onClick={() => setLinkOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RenameDialog
        user={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          toast.success("Name updated");
          router.refresh();
        }}
      />
    </>
  );
}

function RenameDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setPending(true);
    const res = await renameUser(user.id, String(new FormData(e.currentTarget).get("name") ?? ""));
    setPending(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    onSaved();
  }
  return (
    <Dialog
      open={user !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit name</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-user">Full name</Label>
            <Input id="rename-user" name="name" defaultValue={user?.name} required autoFocus />
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
