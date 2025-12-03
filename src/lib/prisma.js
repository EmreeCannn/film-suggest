import { PrismaClient } from "@prisma/client";

const prisma = globalThis.prisma || new PrismaClient({ log: ['query', 'info', 'warn', 'error'] });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;