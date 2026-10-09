import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export async function audit(
  entry: { userId: string | null; action: string; entity: string; entityId?: string | null; details?: Prisma.InputJsonValue },
  db: Db = prisma,
) {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      details: entry.details,
    },
  });
}
