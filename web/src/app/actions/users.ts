"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { adminChangeProblem } from "@/lib/admin-rules";
import { runAction, UserFacingError } from "@/lib/action-result";
import { issueAuthToken, linkPath } from "@/lib/auth-tokens";
import { appUrl, sendEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/session";

const roleSchema = z.enum(["ADMIN", "USER"]);

type LinkResult = { link: string; emailed: boolean };

async function sendInvite(user: { id: string; name: string; email: string }, adminId: string, adminName: string): Promise<LinkResult> {
  const token = await issueAuthToken(user.id, "INVITE", adminId);
  const link = appUrl(linkPath("INVITE", token));
  const emailed = await sendEmail(
    user.email,
    "You're invited to the QSGS Cost Database",
    `Hello ${user.name},\n\n${adminName} has invited you to the QSGS Cost Database.\n\nSet your password with this link. It works once and expires in 48 hours:\n\n${link}`,
  );
  return { link, emailed };
}

async function activeAdminCount() {
  return prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
}

export async function inviteUser(input: { name: string; email: string; role: Role }) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z
      .object({
        name: z.string().trim().min(2, "Enter the person's name.").max(80, "Use 80 characters or fewer."),
        email: z.string().trim().toLowerCase().email("Enter a valid email address."),
        role: roleSchema,
      })
      .parse(input);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new UserFacingError("Someone with this email already has an account.");
    }
    const user = await prisma.user.create({ data: { name: data.name, email: data.email, role: data.role, status: "INVITED" } });
    const result = await sendInvite(user, admin.id, admin.name);
    await audit({
      userId: admin.id,
      action: "user.invited",
      entity: "user",
      entityId: user.id,
      details: { email: user.email, role: user.role, emailed: result.emailed },
    });
    revalidatePath("/admin/users");
    return result;
  });
}

export async function resendInvite(userId: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserFacingError("User not found.");
    if (user.status !== "INVITED") throw new UserFacingError("This person has already set a password.");
    const result = await sendInvite(user, admin.id, admin.name);
    await audit({ userId: admin.id, action: "user.invite_resent", entity: "user", entityId: user.id, details: { emailed: result.emailed } });
    revalidatePath("/admin/users");
    return result;
  });
}

/** A password-reset link an admin can pass on (or that is emailed when email is set up). */
export async function createResetLink(userId: string) {
  return runAction(async (): Promise<LinkResult> => {
    const admin = await requireAdmin();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserFacingError("User not found.");
    if (user.status !== "ACTIVE") throw new UserFacingError("Only active accounts can reset a password.");
    const token = await issueAuthToken(user.id, "RESET", admin.id);
    const link = appUrl(linkPath("RESET", token));
    const emailed = await sendEmail(
      user.email,
      "Reset your QSGS Cost Database password",
      `Hello ${user.name},\n\nAn admin created a password reset link for you. It works once and expires in 48 hours:\n\n${link}`,
    );
    await audit({ userId: admin.id, action: "user.reset_link_created", entity: "user", entityId: user.id, details: { emailed } });
    return { link, emailed };
  });
}

export async function changeUserRole(userId: string, role: Role) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const next = roleSchema.parse(role);
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new UserFacingError("User not found.");
    if (target.role === next) return undefined;
    const problem = adminChangeProblem(admin.id, target, { role: next }, await activeAdminCount());
    if (problem) throw new UserFacingError(problem);
    // A role change signs the person out, so their next sign-in picks up the new role.
    await prisma.user.update({ where: { id: userId }, data: { role: next, sessionVersion: { increment: 1 } } });
    await audit({ userId: admin.id, action: "user.role_changed", entity: "user", entityId: userId, details: { from: target.role, to: next } });
    revalidatePath("/admin/users");
    return undefined;
  });
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new UserFacingError("User not found.");
    const status: UserStatus = disabled ? "DISABLED" : target.passwordHash ? "ACTIVE" : "INVITED";
    if (target.status === status) return undefined;
    const problem = adminChangeProblem(admin.id, target, { status }, await activeAdminCount());
    if (problem) throw new UserFacingError(problem);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status, sessionVersion: { increment: 1 } } });
      // Disabling also kills any outstanding invite or reset link.
      if (disabled) await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date() } });
      await audit({ userId: admin.id, action: disabled ? "user.disabled" : "user.enabled", entity: "user", entityId: userId }, tx);
    });
    revalidatePath("/admin/users");
    return undefined;
  });
}

export async function renameUser(userId: string, name: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const clean = z.string().trim().min(2, "Enter a name.").max(80, "Use 80 characters or fewer.").parse(name);
    await prisma.user.update({ where: { id: userId }, data: { name: clean } });
    await audit({ userId: admin.id, action: "user.renamed", entity: "user", entityId: userId, details: { name: clean } });
    revalidatePath("/admin/users");
    return undefined;
  });
}
