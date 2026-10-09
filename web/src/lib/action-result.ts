import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "./session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action body and turns expected failures into a message for the form. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserFacingError || e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That name is already used." };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** An error whose message is safe and useful to show to the user. */
export class UserFacingError extends Error {}
