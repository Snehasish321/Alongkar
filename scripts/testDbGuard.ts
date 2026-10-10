import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

/**
 * Centralized Test Database Safety Guard
 * 
 * Prevents automated test scripts from connecting to or mutating the production database.
 * Requires TEST_DATABASE_URL to be explicitly configured.
 * Strictly blocks the known production Neon endpoint.
 */

export const BLOCKED_PROD_ENDPOINT = 'ep-dark-flower-b3pxf650';

export interface GuardValidationResult {
  valid: boolean;
  error?: string;
  sanitizedHost?: string;
}

/**
 * Validates a test database connection URL against safety rules.
 * Never leaks credentials or secrets in error messages.
 */
export function validateTestDatabaseUrl(url?: string): GuardValidationResult {
  if (!url || !url.trim()) {
    return {
      valid: false,
      error: 'TEST_DATABASE_URL is not configured. Database-mutating test scripts must explicitly specify an isolated test database target.',
    };
  }

  // Reject the known production Neon endpoint regardless of environment
  if (url.includes(BLOCKED_PROD_ENDPOINT)) {
    return {
      valid: false,
      error: 'TEST_DATABASE_URL targets the known production Neon database endpoint. Tests are strictly blocked from executing against production.',
    };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('postgres')) {
      return {
        valid: false,
        error: 'TEST_DATABASE_URL must be a valid PostgreSQL connection URL.',
      };
    }
    return {
      valid: true,
      sanitizedHost: parsed.hostname,
    };
  } catch {
    return {
      valid: false,
      error: 'TEST_DATABASE_URL is malformed.',
    };
  }
}

/**
 * Enforces the test database guard.
 * Reads environment variables (loads .env and .env.test if present), validates TEST_DATABASE_URL,
 * and overrides process.env.DATABASE_URL so that subsequent Prisma initializations use the guarded test target.
 */
export function enforceTestDatabaseGuard(): void {
  // Load .env first
  dotenv.config();

  // Load .env.test if present (overriding .env)
  const envTestPath = path.resolve(process.cwd(), '.env.test');
  if (fs.existsSync(envTestPath)) {
    dotenv.config({ path: envTestPath, override: true });
  }

  const testDbUrl = process.env.TEST_DATABASE_URL;
  const validation = validateTestDatabaseUrl(testDbUrl);

  if (!validation.valid) {
    const message = [
      '',
      '====================================================================',
      '🚨 [TEST_DB_GUARD_VIOLATION] EXECUTION BLOCKED',
      validation.error,
      '====================================================================',
      '',
    ].join('\n');
    console.error(message);
    throw new Error(`[TEST_DB_GUARD_VIOLATION] ${validation.error}`);
  }

  // Set DATABASE_URL and DIRECT_URL to the validated test database URL
  // so any subsequent new PrismaClient() or singleton connects to TEST_DATABASE_URL
  process.env.DATABASE_URL = testDbUrl;
  process.env.DIRECT_URL = testDbUrl;
}

// Automatically enforce the guard upon import unless explicitly running in guard unit-test mode
if (process.env.SKIP_TEST_DB_GUARD_AUTO !== 'true') {
  enforceTestDatabaseGuard();
}
