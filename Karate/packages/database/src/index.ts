import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __karatePrismaClient: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient. In dev, Node's module cache is cleared on every
 * hot-reload, which would otherwise open a new DB connection pool per
 * reload; stashing the instance on `global` survives that.
 */
const nodeEnv = process.env["NODE_ENV"];

export const prisma: PrismaClient =
  globalThis.__karatePrismaClient ??
  new PrismaClient({
    log: nodeEnv === "development" ? ["warn", "error"] : ["error"],
  });

if (nodeEnv !== "production") {
  globalThis.__karatePrismaClient = prisma;
}

export * from "@prisma/client";
