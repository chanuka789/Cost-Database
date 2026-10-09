"use server";

import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { runAction, UserFacingError } from "@/lib/action-result";
import { findValidToken, issueAuthToken, linkPath } from "@/lib/auth-tokens";
import { appUrl, sendEmail } from "@/lib/email";
import { BCRYPT_ROUNDS, passwordProblem } from "@/lib/password";
import { requireSignedIn } from "@/lib/session";
import { THEME_COOKIE } from "@/lib/theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

async function writeThemeCookie(theme: "light" | "dark") {
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: false });
}

/** Sets a password from an invite or reset link, then activates the account. */
export async function setPasswordWithToken(input: { token: string; password: string; confirm: string; type: "INVITE" | "RESET" }) {
  return runAction(async () => {
    const found = await findValidToken(input.token, input.type);
    if (found.state !== "valid") {
      throw new UserFacingError(
        found.state === "used"
          ? "This link has already been used. Ask an admin for a new one."
          : found.state === "expired"
            ? "This link has expired. Ask an admin for a new one."
            : "This link isn't valid. Check you copied the whole link.",
      );
    }
    const { token, user } = found;
    if (user.status === "DISABLED") throw new UserFacingError("This account is disabled. Contact an admin.");
    if (input.password !== input.confirm) throw new UserFacingError("The two passwords don't match.");
    const problem = passwordProblem(input.password, user.email);
    if (problem) throw new UserFacingError(problem);

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    await prisma.$transaction(async (tx) => {
      // Mark used inside the transaction, guarded on still-unused, so a link can't be used twice at once.
      const claimed = await tx.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new UserFacingError("This link has already been used. Ask an admin for a new one.");
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: "ACTIVE",
          failedLoginCount: 0,
          lockedUntil: null,
          sessionVersion: { increment: 1 },
        },
      });
      await audit(
        { userId: user.id, action: input.type === "INVITE" ? "auth.invite_accepted" : "auth.password_reset", entity: "user", entityId: user.id },
        tx,
      );
    });
    return { email: user.email };
  });
}

/**
 * "Forgot password". Always answers the same way, so it can't be used to find
 * out which emails have accounts. At most 3 links per hour per account.
 */
export async function requestPasswordReset(input: { email: string }) {
  return runAction(async () => {
    const email = z.string().trim().toLowerCase().email("Enter a valid email address.").parse(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE") {
      const recent = await prisma.authToken.count({
        where: { userId: user.id, type: "RESET", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      });
      if (recent < 3) {
        const token = await issueAuthToken(user.id, "RESET", null);
        const sent = await sendEmail(
          user.email,
          "Reset your QSGS Cost Database password",
          `Hello ${user.name},\n\nUse this link to set a new password. It works once and expires in 48 hours:\n\n${appUrl(linkPath("RESET", token))}\n\nIf you didn't ask for this, you can ignore this email.`,
        );
        await audit({ userId: user.id, action: "auth.reset_requested", entity: "user", entityId: user.id, details: { emailed: sent } });
      }
    }
    return undefined;
  });
}

/** After sign-in: copy the user's saved theme into the cookie the layout reads. */
export async function syncThemeCookie() {
  return runAction(async () => {
    const user = await requireSignedIn();
    await writeThemeCookie(user.theme === "DARK" ? "dark" : "light");
    return user.theme === "DARK" ? "dark" : "light";
  });
}

export async function updateMyTheme(theme: "light" | "dark") {
  return runAction(async () => {
    const user = await requireSignedIn();
    const value = theme === "dark" ? "DARK" : "LIGHT";
    await prisma.user.update({ where: { id: user.id }, data: { theme: value } });
    await writeThemeCookie(theme);
    return undefined;
  });
}

export async function updateMyName(input: { name: string }) {
  return runAction(async () => {
    const user = await requireSignedIn();
    const name = z.string().trim().min(2, "Enter your name.").max(80, "Use 80 characters or fewer.").parse(input.name);
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    await audit({ userId: user.id, action: "user.renamed_self", entity: "user", entityId: user.id, details: { name } });
    return undefined;
  });
}

/** Changing your password signs out your other sessions; the caller signs in again on this device. */
export async function changeMyPassword(input: { current: string; password: string; confirm: string }) {
  return runAction(async () => {
    const me = await requireSignedIn();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!user.passwordHash || !(await compare(input.current, user.passwordHash))) {
      throw new UserFacingError("Your current password is incorrect.");
    }
    if (input.password !== input.confirm) throw new UserFacingError("The two new passwords don't match.");
    if (input.password === input.current) throw new UserFacingError("Choose a password you haven't used here.");
    const problem = passwordProblem(input.password, user.email);
    if (problem) throw new UserFacingError(problem);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(input.password, BCRYPT_ROUNDS), sessionVersion: { increment: 1 } },
    });
    await audit({ userId: user.id, action: "auth.password_changed", entity: "user", entityId: user.id });
    return { email: user.email };
  });
}
