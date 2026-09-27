import { PrismaClient } from '@prisma/client';

/**
 * Server-side PrismaClient Singleton
 * 
 * IMPORTANT:
 * - This module is intended for SERVER-SIDE / API ROUTE usage only.
 * - Do NOT import this file into React client/browser components.
 * - In Vite / browser environments, database connections must be made via backend APIs.
 */

const isProduction = process.env.NODE_ENV === 'production';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['query', 'error', 'warn'],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
