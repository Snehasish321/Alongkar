import prisma from '../src/lib/prisma.js';
import healthHandler from '../api/health.js';
import productsHandler from '../api/products.js';
import cartHandler from '../api/cart.js';
import wishlistHandler from '../api/wishlist.js';
import jewelleryRequestsHandler from '../api/jewellery-requests.js';
import adminJewelleryRequestsHandler from '../api/admin/jewellery-requests.js';
import {
  getOrCreateRequestId,
  maskSensitiveString,
  logEvent,
  logServerError,
  logSlowRequest,
  logSecurityEvent,
  logDependencyFailure,
  getSlowRequestThresholdMs,
  getLogLevel,
} from '../api/_utils/security.js';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    set(headers: Record<string, string>) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v;
      }
      return this;
    },
    json(payload: any) {
      this.data = payload;
      return this;
    },
    end(str: string) {
      if (str) {
        try {
          this.data = JSON.parse(str);
        } catch {
          this.data = str;
        }
      }
      return this;
    },
  };
  return res;
}

async function runPhase1FObservabilityTests() {
  console.log('====================================================');
  console.log('PHASE 1F: PRODUCTION OBSERVABILITY & MONITORING TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Request Correlation ID Generation, Validation & Propagation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Request Correlation ID ---');
  {
    // A. Generate unique ID when absent
    const req1: any = { headers: {} };
    const id1 = getOrCreateRequestId(req1);
    assert(Boolean(id1 && id1.startsWith('req_')), 'Generates unique request ID with "req_" prefix when absent');
    assert(req1._requestId === id1, 'Caches generated ID on req._requestId');

    const req2: any = { headers: {} };
    const id2 = getOrCreateRequestId(req2);
    assert(id1 !== id2, 'Successive requests receive unique IDs');

    // B. Validate and propagate safe incoming request ID
    const reqSafe: any = { headers: { 'x-request-id': 'client-trace-12345' } };
    const idSafe = getOrCreateRequestId(reqSafe);
    assert(idSafe === 'client-trace-12345', 'Safe incoming X-Request-ID is propagated exactly');

    // C. Rejects oversized request ID (>100 chars) and falls back to generated
    const oversizedId = 'a'.repeat(150);
    const reqOversized: any = { headers: { 'x-request-id': oversizedId } };
    const idOver = getOrCreateRequestId(reqOversized);
    assert(idOver.startsWith('req_') && idOver !== oversizedId, 'Oversized incoming request ID is rejected and regenerated');

    // D. Rejects malicious / script injection request ID and falls back to generated
    const maliciousId = '<script>alert(1)</script>';
    const reqMalicious: any = { headers: { 'x-request-id': maliciousId } };
    const idMalicious = getOrCreateRequestId(reqMalicious);
    assert(idMalicious.startsWith('req_') && !idMalicious.includes('<'), 'Malicious incoming request ID is rejected');

    // E. Rejects token leakage inside request ID header (e.g. Bearer JWT)
    const tokenHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30';
    const reqToken: any = { headers: { 'x-request-id': tokenHeader } };
    const idToken = getOrCreateRequestId(reqToken);
    assert(idToken.startsWith('req_') && !idToken.includes('eyJ'), 'JWT / Bearer token in request ID header is rejected');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Response Headers: X-Request-ID & Security Headers Preservation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Response Headers (X-Request-ID & Security Headers) ---');
  {
    const endpoints = [
      { name: 'GET /api/products', handler: productsHandler, req: { method: 'GET', url: '/api/products' } },
      { name: 'GET /api/health', handler: healthHandler, req: { method: 'GET', url: '/api/health' } },
      { name: 'GET /api/cart (401)', handler: cartHandler, req: { method: 'GET', url: '/api/cart' } },
      { name: 'GET /api/wishlist (401)', handler: wishlistHandler, req: { method: 'GET', url: '/api/wishlist' } },
      { name: 'GET /api/jewellery-requests (401)', handler: jewelleryRequestsHandler, req: { method: 'GET', url: '/api/jewellery-requests' } },
      { name: 'GET /api/admin/jewellery-requests (401)', handler: adminJewelleryRequestsHandler, req: { method: 'GET', url: '/api/admin/jewellery-requests' } },
    ];

    for (const ep of endpoints) {
      const res = createMockRes();
      await ep.handler(ep.req, res);

      assert(
        Boolean(res.headers['x-request-id'] && res.headers['x-request-id'].length > 0),
        `${ep.name} returns X-Request-ID header (${res.headers['x-request-id']})`
      );
      assert(
        res.headers['x-content-type-options'] === 'nosniff',
        `${ep.name} preserves X-Content-Type-Options: nosniff`
      );
      assert(
        res.headers['x-frame-options'] === 'DENY',
        `${ep.name} preserves X-Frame-Options: DENY`
      );
      assert(
        res.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
        `${ep.name} preserves Referrer-Policy`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Structured Logging & Secret Redaction
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Structured Logging & Sensitive String Redaction ---');
  {
    // Verify credential redaction
    const secretPostgres = 'postgresql://alongkar_user:super_secret_db_pass@db.neon.tech/alongkar_db';
    const redactedPostgres = maskSensitiveString(secretPostgres);
    assert(!redactedPostgres.includes('super_secret_db_pass'), 'PostgreSQL password is redacted');
    assert(redactedPostgres.includes('[REDACTED]'), 'PostgreSQL host contains [REDACTED]');

    const secretBearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
    const redactedBearer = maskSensitiveString(secretBearer);
    assert(!redactedBearer.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Bearer token / JWT is redacted');
    assert(redactedBearer.includes('[REDACTED_TOKEN]'), 'Bearer token replaced with [REDACTED_TOKEN]');

    const secretClerk = 'CLERK_SECRET_KEY=sk_test_51Abcdef1234567890';
    const redactedClerk = maskSensitiveString(secretClerk);
    assert(!redactedClerk.includes('sk_test_51Abcdef1234567890'), 'Clerk secret key is redacted');

    const secretCloudinary = 'CLOUDINARY_API_SECRET=abc123secretxyz456';
    const redactedCloudinary = maskSensitiveString(secretCloudinary);
    assert(!redactedCloudinary.includes('abc123secretxyz456'), 'Cloudinary API secret is redacted');

    // Intercept console.error to verify structured log formatting
    const originalConsoleError = console.error;
    let loggedErrorLine = '';
    console.error = (msg: string) => {
      loggedErrorLine = msg;
    };

    try {
      logServerError({
        endpoint: '/api/test-endpoint',
        method: 'POST',
        operation: 'unit_test_operation',
        requestId: 'req_trace_test_999',
        statusCode: 500,
        durationMs: 42,
        error: new Error(`Failed to connect: postgresql://admin:secret@localhost:5432/db`),
        extra: { apiKey: 'secret_key_value' },
      });

      assert(loggedErrorLine.includes('[ERROR]'), 'Structured log includes [ERROR] level');
      assert(loggedErrorLine.includes('[POST /api/test-endpoint]'), 'Structured log includes method and endpoint');
      assert(loggedErrorLine.includes('[unit_test_operation]'), 'Structured log includes operation');
      assert(loggedErrorLine.includes('[req:req_trace_test_999]'), 'Structured log includes requestId');
      assert(loggedErrorLine.includes('[status:500]'), 'Structured log includes statusCode');
      assert(loggedErrorLine.includes('[42ms]'), 'Structured log includes duration');
      assert(!loggedErrorLine.includes('secret@localhost'), 'Sensitive DB connection string is stripped from log');
    } finally {
      console.error = originalConsoleError;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. API Duration & Slow Request Monitoring
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. API Duration & Slow Request Monitoring ---');
  {
    const originalConsoleWarn = console.warn;
    let loggedWarnLine = '';
    console.warn = (msg: string) => {
      loggedWarnLine = msg;
    };

    try {
      // Below threshold (default 1000ms): should NOT log slow request
      const fastResult = logSlowRequest({
        endpoint: '/api/products',
        method: 'GET',
        durationMs: 50,
        requestId: 'req_fast_1',
      });
      assert(fastResult === false, 'Fast request (50ms < 1000ms) is not flagged as slow');

      // Above threshold (e.g. 1250ms): MUST log slow request with details
      const slowResult = logSlowRequest({
        endpoint: '/api/products',
        method: 'GET',
        durationMs: 1250,
        requestId: 'req_slow_1',
      });
      assert(slowResult === true, 'Slow request (1250ms >= 1000ms) is detected and flagged');
      assert(loggedWarnLine.includes('[WARN]'), 'Slow request logs at [WARN] severity');
      assert(loggedWarnLine.includes('[cat:performance]'), 'Slow request includes performance category');
      assert(loggedWarnLine.includes('[1250ms]'), 'Slow request logs exact duration');
      assert(loggedWarnLine.includes('req_slow_1'), 'Slow request logs requestId');
    } finally {
      console.warn = originalConsoleWarn;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Dependency Failure Monitoring (Redis, Database, Cloudinary)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Dependency Failure Monitoring ---');
  {
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    let lastWarn = '';
    let lastError = '';
    console.warn = (msg: string) => { lastWarn = msg; };
    console.error = (msg: string) => { lastError = msg; };

    try {
      // Non-fatal Redis degradation
      logDependencyFailure('redis', 'cache_lookup', new Error('Upstash connection timeout'), {
        endpoint: '/api/products',
        method: 'GET',
        requestId: 'req_dep_1',
        isFatal: false,
      });
      assert(lastWarn.includes('[WARN]'), 'Non-fatal Redis failure logs at [WARN] severity');
      assert(lastWarn.includes('[cat:redis]'), 'Includes [cat:redis] tag');
      assert(lastWarn.includes('(DEGRADED)'), 'Marks dependency status as DEGRADED');

      // Fatal Database failure
      logDependencyFailure('database', 'execute_transaction', new Error('Neon connection pool timeout'), {
        endpoint: '/api/cart',
        method: 'POST',
        requestId: 'req_dep_2',
        isFatal: true,
      });
      assert(lastError.includes('[ERROR]'), 'Fatal Database failure logs at [ERROR] severity');
      assert(lastError.includes('[cat:database]'), 'Includes [cat:database] tag');
      assert(lastError.includes('(FATAL)'), 'Marks dependency status as FATAL');
    } finally {
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Security Event Logging
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Security Event Logging ---');
  {
    const originalConsoleWarn = console.warn;
    let lastSecWarn = '';
    console.warn = (msg: string) => { lastSecWarn = msg; };

    try {
      logSecurityEvent({
        event: 'rate_limit_exceeded',
        endpoint: '/api/jewellery-requests',
        method: 'POST',
        requestId: 'req_sec_1',
        statusCode: 429,
        userId: 'usr_abc123',
        details: 'Rate limit: 10 requests per 10 minutes exceeded',
      });

      assert(lastSecWarn.includes('[WARN]'), 'Security event logs at [WARN] severity');
      assert(lastSecWarn.includes('[cat:security]'), 'Security event includes [cat:security]');
      assert(lastSecWarn.includes('[rate_limit_exceeded]'), 'Security event includes event operation');
      assert(lastSecWarn.includes('[user:usr_abc123]'), 'Security event includes user identifier');
      assert(lastSecWarn.includes('req_sec_1'), 'Security event includes correlation requestId');
    } finally {
      console.warn = originalConsoleWarn;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Health Endpoint (/api/health)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Health Endpoint (/api/health) ---');
  {
    // A. Healthy Check
    const res = createMockRes();
    await healthHandler({ method: 'GET', url: '/api/health' }, res);

    assert(res.statusCode === 200, 'GET /api/health returns HTTP 200');
    assert(res.data?.status === 'healthy', 'Health status is "healthy"');
    assert(res.data?.checks?.database === 'healthy', 'Database check is "healthy"');
    assert(
      res.data?.checks?.cache === 'healthy' ||
      res.data?.checks?.cache === 'degraded' ||
      res.data?.checks?.cache === 'not_configured',
      `Cache check returns valid non-leaking status (${res.data?.checks?.cache})`
    );
    assert(typeof res.data?.latencyMs === 'number', 'Health response includes latencyMs');
    assert(Boolean(res.headers['x-request-id']), 'Health response returns X-Request-ID');
    assert(res.headers['x-content-type-options'] === 'nosniff', 'Health response includes nosniff');

    // B. No exposed infrastructure secrets
    const rawJson = JSON.stringify(res.data);
    assert(!rawJson.includes('postgres://') && !rawJson.includes('postgresql://'), 'Health response does not leak DB URL');
    assert(!rawJson.includes('upstash.io') && !rawJson.includes('redis://'), 'Health response does not leak Redis URL');
    assert(!rawJson.includes('password') && !rawJson.includes('secret'), 'Health response does not leak secrets');

    // C. Disallowed HTTP Method
    const resPost = createMockRes();
    await healthHandler({ method: 'POST', url: '/api/health' }, resPost);
    assert(resPost.statusCode === 405, 'POST /api/health returns HTTP 405 Method Not Allowed');
  }

  console.log(`\n====================================================`);
  console.log(`PHASE 1F TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================`);
  if (failed > 0) process.exit(1);
}

runPhase1FObservabilityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
