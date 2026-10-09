import { PrismaClient } from "@prisma/client";

// One client per process; dev hot reload would otherwise open a new pool each edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
