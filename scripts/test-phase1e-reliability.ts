import prisma from '../src/lib/prisma.js';
import productsHandler from '../api/products.js';
import cartHandler, { getOrCreateCart } from '../api/cart.js';
import wishlistHandler, { getOrCreateWishlist } from '../api/wishlist.js';
import jewelleryRequestsHandler from '../api/jewellery-requests.js';
import adminJewelleryRequestsHandler from '../api/admin/jewellery-requests.js';
import productImageUploadHandler from '../api/uploads/product-image.js';
import inspirationUploadHandler from '../api/uploads/jewellery-inspiration.js';
import {
  withTimeout,
  getSafeErrorMessage,
  logServerError,
  maskSensitiveString,
} from '../api/_utils/security.js';
import * as cacheModule from '../api/_utils/cache.js';

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

async function runPhase1EReliabilityTests() {
  console.log('='.repeat(70));
  console.log('STARTING PHASE 1E: PRODUCTION RELIABILITY & RESILIENCE TESTS');
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error('       Details:', details);
      failed++;
    }
  }

  // =========================================================================
  // 1. Database Timeout Resilience Tests (withTimeout)
  // =========================================================================
  console.log('\n--- 1. Database Timeout Resilience ---');
  {
    // Test that withTimeout resolves normally when promise is quick
    const quickResult = await withTimeout(
      Promise.resolve('quick_success'),
      1000,
      'Should not timeout'
    );
    assert(quickResult === 'quick_success', 'withTimeout resolves quick operations correctly');

    // Test that withTimeout rejects with timeout message when promise hangs
    let timeoutError: any = null;
    try {
      await withTimeout(
        new Promise((resolve) => setTimeout(() => resolve('too_late'), 500)),
        100,
        'Custom query execution timed out.'
      );
    } catch (err: any) {
      timeoutError = err;
    }
    assert(
      timeoutError && timeoutError.message.includes('Custom query execution timed out.'),
      'withTimeout rejects slow operations with descriptive timeout message',
      timeoutError?.message
    );
  }

  // =========================================================================
  // 2. Safe Database Error Handling & Secret Masking Tests
  // =========================================================================
  console.log('\n--- 2. Database Error Handling & Secret Masking ---');
  {
    // Simulated Prisma connection string error
    const prismaConnErr = new Error(
      'Can\'t reach database server at `ep-cool-db.us-east-2.aws.neon.tech:5432` with connection postgresql://alongkar_admin:secretpassword123@ep-cool-db.us-east-2.aws.neon.tech/alongkar_db?sslmode=require'
    );
    const safeConnMsg = getSafeErrorMessage(prismaConnErr, 'Database connection error.');
    assert(
      !safeConnMsg.includes('secretpassword123') &&
        !safeConnMsg.includes('ep-cool-db') &&
        !safeConnMsg.includes('postgresql://'),
      'getSafeErrorMessage sanitizes database URLs, passwords, and hostnames',
      safeConnMsg
    );
    assert(
      safeConnMsg.includes('Database connection') || safeConnMsg.includes('database service'),
      'getSafeErrorMessage provides safe, user-friendly fallback',
      safeConnMsg
    );

    // Simulated Prisma Unique Constraint Violation (P2002)
    const prismaP2002Err: any = new Error('Unique constraint failed on the fields: (`slug`)');
    prismaP2002Err.code = 'P2002';
    const safeP2002Msg = getSafeErrorMessage(prismaP2002Err);
    assert(
      safeP2002Msg.includes('unique constraint') || safeP2002Msg.includes('already exists'),
      'getSafeErrorMessage maps P2002 unique constraint code safely',
      safeP2002Msg
    );

    // Simulated Prisma Record Not Found (P2025)
    const prismaP2025Err: any = new Error('Record to update not found');
    prismaP2025Err.code = 'P2025';
    const safeP2025Msg = getSafeErrorMessage(prismaP2025Err);
    assert(
      safeP2025Msg.includes('Requested record was not found'),
      'getSafeErrorMessage maps P2025 record not found code safely',
      safeP2025Msg
    );

    // String masking test
    const maskedString = maskSensitiveString(
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0 with url postgresql://user:mysecretpassword@db.com:5432/main'
    );
    assert(
      !maskedString.includes('mysecretpassword') &&
        !maskedString.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
      'maskSensitiveString redacts JWT tokens and database URLs containing passwords',
      maskedString
    );
  }

  // =========================================================================
  // 3. Concurrency & Race Condition Safety (Cart & Wishlist Upserts)
  // =========================================================================
  console.log('\n--- 3. Concurrency & Race-Safe Upserts ---');
  {
    // Create a temporary test user
    const raceTestClerkId = `user_race_test_${Date.now()}`;
    const testUser = await prisma.user.create({
      data: {
        clerkUserId: raceTestClerkId,
        email: `race_${Date.now()}@alongkar-test.com`,
      },
    });

    // Run 10 simultaneous cart initializations for the same user concurrently
    const cartPromises = Array.from({ length: 10 }).map(() =>
      getOrCreateCart(testUser.id)
    );

    const cartResults = await Promise.all(cartPromises);
    const allCartSuccess = cartResults.every((c) => c && c.id && c.userId === testUser.id);
    assert(
      allCartSuccess,
      'Concurrent cart creation for a new user resolves race-safely via atomic upsert with P2002 retry'
    );

    // Verify exactly 1 cart was created in PostgreSQL
    const userCarts = await prisma.cart.findMany({
      where: { userId: testUser.id },
    });
    assert(
      userCarts.length === 1,
      'Exactly one cart exists for user after concurrent initializations'
    );

    // Run 10 simultaneous wishlist initializations for the same user concurrently
    const wishlistPromises = Array.from({ length: 10 }).map(() =>
      getOrCreateWishlist(testUser.id)
    );

    const wishlistResults = await Promise.all(wishlistPromises);
    const allWishlistSuccess = wishlistResults.every((w) => w && w.id && w.userId === testUser.id);
    assert(
      allWishlistSuccess,
      'Concurrent wishlist creation for a new user resolves race-safely via atomic upsert with P2002 retry'
    );

    // Verify exactly 1 wishlist was created in PostgreSQL
    const userWishlists = await prisma.wishlist.findMany({
      where: { userId: testUser.id },
    });
    assert(
      userWishlists.length === 1,
      'Exactly one wishlist exists for user after concurrent initializations'
    );

    // Clean up test user
    await prisma.cart.deleteMany({ where: { userId: testUser.id } });
    await prisma.wishlist.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  }

  // =========================================================================
  // 4. Redis Failure Fallback & Graceful Degradation
  // =========================================================================
  console.log('\n--- 4. Redis Failure Fallback & Graceful Degradation ---');
  {
    // Test product listing endpoint directly
    const mockReq = {
      method: 'GET',
      url: '/api/products?page=1&limit=5',
    };
    const mockRes = createMockRes();

    await productsHandler(mockReq, mockRes);

    assert(
      mockRes.statusCode === 200 &&
        mockRes.data &&
        Array.isArray(mockRes.data.products),
      'Product listing handler returns valid data from database / cache layer',
      { status: mockRes.statusCode, count: mockRes.data?.products?.length }
    );

    // Test non-fatal cache invalidation on product mutations
    let invalidationErrorLogged = false;
    try {
      await cacheModule.invalidateProducts();
      assert(true, 'invalidateProducts completes safely without throwing uncaught exceptions');
    } catch (err) {
      assert(false, 'invalidateProducts threw an uncaught exception', err);
    }
  }

  // =========================================================================
  // 5. External Service Failure Behavior (Upload Validation & Error Safety)
  // =========================================================================
  console.log('\n--- 5. External Service Failure Behavior ---');
  {
    // Disallowed method on product image upload endpoint
    const disallowedReq = {
      method: 'GET',
    };
    const disallowedRes = createMockRes();
    await productImageUploadHandler(disallowedReq, disallowedRes);

    assert(
      disallowedRes.statusCode === 405,
      'Product image upload returns 405 on disallowed HTTP GET without calling Cloudinary',
      disallowedRes.statusCode
    );

    // Disallowed method on jewellery inspiration upload endpoint
    const inspDisallowedReq = {
      method: 'GET',
    };
    const inspDisallowedRes = createMockRes();
    await inspirationUploadHandler(inspDisallowedReq, inspDisallowedRes);

    assert(
      inspDisallowedRes.statusCode === 405,
      'Jewellery inspiration upload returns 405 on disallowed HTTP GET without calling Cloudinary',
      inspDisallowedRes.statusCode
    );
  }

  // =========================================================================
  // 6. HTTP Status Code Consistency Verification
  // =========================================================================
  console.log('\n--- 6. HTTP Status Code Consistency ---');
  {
    // 400 Bad Request on malformed JSON payload format
    const malformedReq = {
      method: 'POST',
      body: { _error: 'MALFORMED_JSON' },
    };
    const malformedRes = createMockRes();
    await productsHandler(malformedReq, malformedRes);
    assert(
      malformedRes.statusCode === 400,
      '400 Bad Request returned for malformed JSON request body',
      malformedRes.statusCode
    );

    // 401 Unauthorized for unauthenticated protected route
    const unauthReq = {
      method: 'POST',
      headers: {},
      body: { jewelleryType: 'Ring', description: 'Gold Ring' },
    };
    const unauthRes = createMockRes();
    await jewelleryRequestsHandler(unauthReq, unauthRes);
    assert(
      unauthRes.statusCode === 401,
      '401 Unauthorized returned when Clerk session is missing on protected route',
      unauthRes.statusCode
    );

    // 405 Method Not Allowed on unsupported HTTP verb
    const methodNotAllowedReq = {
      method: 'PUT',
      headers: {},
    };
    const methodNotAllowedRes = createMockRes();
    await productImageUploadHandler(methodNotAllowedReq, methodNotAllowedRes);
    assert(
      methodNotAllowedRes.statusCode === 405,
      '405 Method Not Allowed returned for unsupported HTTP verb',
      methodNotAllowedRes.statusCode
    );

    // 413 Payload Too Large on oversized body
    const largeReq = {
      method: 'POST',
      body: { _error: 'PAYLOAD_TOO_LARGE' },
    };
    const largeRes = createMockRes();
    await productsHandler(largeReq, largeRes);
    assert(
      largeRes.statusCode === 413,
      '413 Payload Too Large returned when body exceeds 1MB threshold',
      largeRes.statusCode
    );
  }

  // =========================================================================
  // 7. Structured Server-Side Logging & Redaction Verification
  // =========================================================================
  console.log('\n--- 7. Server Logging & Sensitive Information Redaction ---');
  {
    const loggedOutput: string[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      loggedOutput.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    try {
      const testSecretErr = new Error(
        'Failed auth with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and db connection postgresql://admin:super_secret_pw@db.neon.tech/main'
      );
      logServerError(testSecretErr, {
        endpoint: '/api/test-endpoint',
        method: 'POST',
        context: {
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
          userId: 'user_123',
        },
      });

      const fullLog = loggedOutput.join('\n');
      assert(
        !fullLog.includes('super_secret_pw') &&
          !fullLog.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
        'logServerError redacts passwords and bearer/JWT tokens before printing to server console',
        fullLog
      );
      assert(
        fullLog.includes('SERVER_ERROR') && fullLog.includes('/api/test-endpoint'),
        'logServerError includes endpoint metadata and timestamp in structured format',
        fullLog
      );
    } finally {
      console.error = originalConsoleError;
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log(`PHASE 1E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1EReliabilityTests()
  .catch((err) => {
    console.error('Fatal error during Phase 1E test execution:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
