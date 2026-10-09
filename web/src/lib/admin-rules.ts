import type { Role, UserStatus } from "@prisma/client";

type Member = { id: string; role: Role; status: UserStatus };

/**
 * Why a change to `target` must be refused, or null if it is allowed.
 * Guards: an admin can't lock themselves out, and the last active admin
 * can never be demoted or disabled.
 */
export function adminChangeProblem(
  actorId: string,
  target: Member,
  change: { role?: Role; status?: UserStatus },
  activeAdminCount: number,
): string | null {
  const isSelf = actorId === target.id;
  if (isSelf && change.status === "DISABLED") return "You can't disable your own account.";
  if (isSelf && change.role === "USER") return "You can't remove your own admin role. Ask another admin.";

  const losesAdmin =
    target.role === "ADMIN" &&
    target.status === "ACTIVE" &&
    (change.role === "USER" || change.status === "DISABLED");
  if (losesAdmin && activeAdminCount <= 1) return "This is the last active admin. Make someone else an admin first.";
  return null;
}
