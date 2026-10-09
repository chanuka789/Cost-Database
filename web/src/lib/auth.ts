import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";
import { audit } from "./audit";
import {
  addressBlocked,
  afterFailedLogin,
  isLockedOut,
  minutesLeft,
  recordAddressFailure,
} from "./login-throttle";

/** Compared against when the email is unknown, so both paths take about as long. */
const DUMMY_HASH = "$2b$12$oytfHDoJueCdKmDnw3rA0u2AXSR5VFr6GvGEzYwh10kkOOE6ZtHlS";
const INVALID = "Incorrect email or password.";

function clientAddress(headers: Record<string, unknown> | undefined): string {
  const fwd = headers?.["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : "";
  return first || "unknown";
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) throw new Error("Enter your email and password.");

        const address = clientAddress(req?.headers as Record<string, unknown> | undefined);
        if (addressBlocked(address)) throw new Error("Too many attempts. Try again in 15 minutes.");

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
          await compare(password, DUMMY_HASH);
          recordAddressFailure(address);
          throw new Error(INVALID);
        }
        if (isLockedOut(user.lockedUntil)) {
          throw new Error(`Too many attempts. Try again in ${minutesLeft(user.lockedUntil!)} minutes.`);
        }
        if (!(await compare(password, user.passwordHash))) {
          recordAddressFailure(address);
          const next = afterFailedLogin(user.failedLoginCount);
          await prisma.user.update({ where: { id: user.id }, data: next });
          if (next.lockedUntil) {
            await audit({ userId: user.id, action: "auth.locked", entity: "user", entityId: user.id });
          }
          throw new Error(INVALID);
        }
        // Status is revealed only after the password is proven.
        if (user.status === "DISABLED") throw new Error("Your account is disabled. Contact an admin.");
        if (user.status !== "ACTIVE") throw new Error(INVALID);

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await audit({ userId: user.id, action: "auth.signed_in", entity: "user", entityId: user.id });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        role: token.role,
        sessionVersion: token.sessionVersion,
      };
      return session;
    },
  },
};
