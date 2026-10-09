import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/session";
import { emailConfigured } from "@/lib/email";
import { UsersTable, type UserRow } from "./users-table";
import { InviteUserButton } from "./invite-user-dialog";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdminPage();
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      authTokens: {
        where: { type: "INVITE", usedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { expiresAt: true },
      },
    },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    inviteExpiresAt: u.authTokens[0]?.expiresAt.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite people, set who is an admin, and disable accounts that should no longer have access."
        actions={<InviteUserButton emailEnabled={emailConfigured()} />}
      />
      <UsersTable rows={rows} currentUserId={me.id} emailEnabled={emailConfigured()} />
    </>
  );
}
