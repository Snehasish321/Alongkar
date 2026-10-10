/**
 * Isolated Unit Test Suite for testDbGuard
 * 
 * Verifies guard safety rules completely in-memory.
 * Does NOT connect to any database, network, or external service.
 */

// Set guard unit-test mode before loading guard module
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';

const {
  validateTestDatabaseUrl,
  enforceTestDatabaseGuard,
  BLOCKED_PROD_ENDPOINT,
} = await import('./testDbGuard.js');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('UNIT TEST SUITE: Centralized Test Database Safety Guard');
  console.log('====================================================================\n');

  // 1. Missing TEST_DATABASE_URL
  console.log('--- 1. Missing TEST_DATABASE_URL Checks ---');
  const resUndefined = validateTestDatabaseUrl(undefined);
  assert(resUndefined.valid === false, 'Rejects undefined TEST_DATABASE_URL');
  assert(resUndefined.error?.includes('TEST_DATABASE_URL is not configured'), 'Error message reports unconfigured URL');

  const resEmpty = validateTestDatabaseUrl('   ');
  assert(resEmpty.valid === false, 'Rejects empty whitespace TEST_DATABASE_URL');

  // 2. Blocked Production Endpoint
  console.log('\n--- 2. Blocked Production Endpoint Checks ---');
  const prodUrl = `postgresql://alongkar_owner:secretPass123@${BLOCKED_PROD_ENDPOINT}-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
  const resProd = validateTestDatabaseUrl(prodUrl);
  assert(resProd.valid === false, 'Strictly rejects known production Neon endpoint');
  assert(resProd.error?.includes('targets the known production Neon database endpoint'), 'Identifies production target violation');
  assert(!resProd.error?.includes('secretPass123'), 'Never leaks database password in error message');
  assert(!resProd.error?.includes('alongkar_owner'), 'Never leaks database username in error message');

  // Direct unpooled production endpoint
  const prodDirectUrl = `postgresql://alongkar_owner:secretPass123@${BLOCKED_PROD_ENDPOINT}.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
  const resProdDirect = validateTestDatabaseUrl(prodDirectUrl);
  assert(resProdDirect.valid === false, 'Strictly rejects direct unpooled production endpoint');

  // 3. Protocol & Format Validation
  console.log('\n--- 3. Protocol & Format Validation Checks ---');
  const resHttp = validateTestDatabaseUrl('https://example.com/api');
  assert(resHttp.valid === false, 'Rejects non-postgres URL protocol');

  const resMalformed = validateTestDatabaseUrl('not-a-valid-url');
  assert(resMalformed.valid === false, 'Rejects malformed connection string');

  // 4. Valid Isolated Test Database URL
  console.log('\n--- 4. Valid Isolated Test Database URL Checks ---');
  const validTestUrl = 'postgresql://test_user:test_secret@ep-isolated-test-branch-12345.c-4.ap-southeast-1.aws.neon.tech/test_db?sslmode=require';
  const resValid = validateTestDatabaseUrl(validTestUrl);
  assert(resValid.valid === true, 'Accepts valid non-production PostgreSQL URL');
  assert(resValid.sanitizedHost === 'ep-isolated-test-branch-12345.c-4.ap-southeast-1.aws.neon.tech', 'Extracts sanitized host');

  // 5. enforceTestDatabaseGuard() Environment Manipulation
  console.log('\n--- 5. enforceTestDatabaseGuard() Behavior ---');
  const originalDbUrl = process.env.DATABASE_URL;
  const originalTestDbUrl = process.env.TEST_DATABASE_URL;

  try {
    // 5.1 Fails when TEST_DATABASE_URL is missing
    delete process.env.TEST_DATABASE_URL;
    let threwOnMissing = false;
    try {
      enforceTestDatabaseGuard();
    } catch (e: any) {
      threwOnMissing = e.message.includes('[TEST_DB_GUARD_VIOLATION]');
    }
    assert(threwOnMissing === true, 'enforceTestDatabaseGuard() throws when TEST_DATABASE_URL is absent');

    // 5.2 Fails when TEST_DATABASE_URL points to production
    process.env.TEST_DATABASE_URL = prodUrl;
    let threwOnProd = false;
    try {
      enforceTestDatabaseGuard();
    } catch (e: any) {
      threwOnProd = e.message.includes('[TEST_DB_GUARD_VIOLATION]');
    }
    assert(threwOnProd === true, 'enforceTestDatabaseGuard() throws when TEST_DATABASE_URL is production');

    // 5.3 Overwrites DATABASE_URL when valid
    process.env.TEST_DATABASE_URL = validTestUrl;
    enforceTestDatabaseGuard();
    assert(process.env.DATABASE_URL === validTestUrl, 'Overwrites process.env.DATABASE_URL with validated test URL');
    assert(process.env.DIRECT_URL === validTestUrl, 'Overwrites process.env.DIRECT_URL with validated test URL');

  } finally {
    // Restore original env vars
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;

    if (originalTestDbUrl) process.env.TEST_DATABASE_URL = originalTestDbUrl;
    else delete process.env.TEST_DATABASE_URL;
  }

  console.log('\n====================================================================');
  console.log(`TEST RESULTS: ${passed}/${passed + failed} PASSED (${failed} FAILED)`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
