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

/**
 * Normalizes the runtime database connection URL.
 * 
 * NOTE ON POSTGRESQL STATEMENT TIMEOUTS:
 * Appending `statement_timeout` (or `?options=-c statement_timeout=...`) to `DATABASE_URL`
 * is INEFFECTIVE on Neon pooled connections:
 * 1. Neither Prisma's query engine nor PostgreSQL libpq accepts `statement_timeout` as a top-level URL parameter.
 * 2. Neon PgBouncer in transaction pooling mode rejects connection startup options (`options`).
 * 3. Preflight inspection confirms `SHOW statement_timeout` returns 0 when relying on URL parameters.
 * 
 * To prevent false security assumptions, this function strips any ineffective `statement_timeout`
 * parameter from the runtime URL while preserving legitimate connection parameters (e.g., sslmode).
 * 
 * True database-side statement timeout enforcement requires PostgreSQL role-level configuration
 * (`ALTER ROLE <runtime_role> SET statement_timeout = '8000ms'`) applied to a dedicated runtime role.
 * It must NOT be applied to `neondb_owner` because `DIRECT_URL` shares that role and long-running
 * schema migrations (`prisma migrate deploy`) would be terminated.
 */
export function getRuntimeDatabaseUrl(rawUrl?: string): string | undefined {
  const urlStr = arguments.length > 0 ? rawUrl : process.env.DATABASE_URL;
  if (!urlStr) return undefined;

  try {
    const parsed = new URL(urlStr);
    if (parsed.searchParams.has('statement_timeout')) {
      parsed.searchParams.delete('statement_timeout');
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

const runtimeDbUrl = getRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: runtimeDbUrl
      ? {
          db: {
            url: runtimeDbUrl,
          },
        }
      : undefined,
    log: isProduction ? ['error'] : ['query', 'error', 'warn'],
  });

globalForPrisma.prisma = prisma;

export default prisma;
