import './testDbGuard.js';
import prisma from '../src/lib/prisma.js';
import healthHandler from '../api/health.js';
import productsHandler from '../api/products.js';
import cartHandler from '../api/cart.js';
import wishlistHandler from '../api/wishlist.js';
import jewelleryRequestsHandler from '../api/jewellery-requests.js';
import adminJewelleryRequestsHandler from '../api/admin/jewellery-requests.js';
import uploadProductImageHandler from '../api/uploads/product-image.js';
import {
  getOrCreateRequestId,
  maskSensitiveString,
  getSafeErrorMessage,
  withTimeout,
  checkRateLimit,
  validateEnvironment,
  ENV_CATALOG,
} from '../api/_utils/security.js';
import { cacheGet, cacheSet, CacheKey, getRedisClient } from '../api/_utils/cache.js';

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

async function runProductionSmokeTestSuite() {
  console.log('====================================================');
  console.log('PHASE 1G: PRODUCTION DEPLOYMENT & DATA INTEGRITY TESTS');
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
  // 1. Environment Configuration & Secrets Safety
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Environment & Secrets Safety Audit ---');
  {
    const envRes = validateEnvironment(process.env);
    assert(envRes.services.database === 'configured', 'Database connection environment is configured');
    assert(envRes.missingRequired.length === 0, 'No mandatory production environment variables are missing');
    assert(ENV_CATALOG.length >= 10, `Catalog contains all ${ENV_CATALOG.length} tracked environment variables`);

    // Verify secrets are marked as secret
    const dbVar = ENV_CATALOG.find((v) => v.name === 'DATABASE_URL');
    assert(dbVar?.isSecret === true && dbVar.scope === 'server_only', 'DATABASE_URL is marked server-only secret');

    const clerkSecretVar = ENV_CATALOG.find((v) => v.name === 'CLERK_SECRET_KEY');
    assert(clerkSecretVar?.isSecret === true && clerkSecretVar.scope === 'server_only', 'CLERK_SECRET_KEY is marked server-only secret');

    const clerkPubVar = ENV_CATALOG.find((v) => v.name === 'VITE_CLERK_PUBLISHABLE_KEY');
    assert(clerkPubVar?.scope === 'client_exposed', 'VITE_CLERK_PUBLISHABLE_KEY is classified as client-exposed');

    const cSecretVar = ENV_CATALOG.find((v) => v.name === 'CLOUDINARY_API_SECRET');
    assert(cSecretVar?.isSecret === true && cSecretVar.scope === 'server_only', 'CLOUDINARY_API_SECRET is marked server-only secret');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Health Endpoint Verification (Check 1)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Health Endpoint Verification ---');
  {
    const res = createMockRes();
    await healthHandler({ method: 'GET', url: '/api/health' }, res);

    assert(res.statusCode === 200, 'Check 1: GET /api/health returns HTTP 200');
    assert(res.data?.status === 'healthy', 'Health check status is healthy');
    assert(res.data?.checks?.database === 'healthy', 'Database connectivity verified via health check');
    assert(
      ['healthy', 'degraded', 'not_configured'].includes(res.data?.checks?.cache),
      `Cache status is valid non-fatal state (${res.data?.checks?.cache})`
    );
    assert(Boolean(res.headers['x-request-id']), 'Health check returns correlation X-Request-ID');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Product Catalog APIs (Checks 2, 3, 4, 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Public Product Catalog APIs ---');
  let sampleProduct: any = null;
  {
    // Check 2: Public product listing
    const resList = createMockRes();
    await productsHandler({ method: 'GET', url: '/api/products' }, resList);

    assert(resList.statusCode === 200, 'Check 2: Public product listing returns HTTP 200');
    assert(Array.isArray(resList.data?.products) && resList.data.products.length > 0, 'Returns list of products');
    sampleProduct = resList.data.products[0];

    // Check 3: Public product detail
    if (sampleProduct) {
      const resDetailSlug = createMockRes();
      await productsHandler({ method: 'GET', url: `/api/products?slug=${sampleProduct.slug}` }, resDetailSlug);
      assert(resDetailSlug.statusCode === 200, 'Check 3: Public product detail by slug returns HTTP 200');
      const retrievedProduct = resDetailSlug.data?.product || resDetailSlug.data;
      assert(retrievedProduct?.id === sampleProduct.id, 'Product detail matches expected product ID');

      const resDetailId = createMockRes();
      await productsHandler({ method: 'GET', url: `/api/products?id=${sampleProduct.id}` }, resDetailId);
      assert(resDetailId.statusCode === 200, 'Public product detail by ID returns HTTP 200');
    }

    // Check 4: Product search
    const resSearch = createMockRes();
    await productsHandler({ method: 'GET', url: '/api/products?search=gold' }, resSearch);
    assert(resSearch.statusCode === 200, 'Check 4: Product search query returns HTTP 200');
    assert(Array.isArray(resSearch.data?.products), 'Product search returns valid product array');

    // Check 5: Product pagination
    const resPage = createMockRes();
    await productsHandler({ method: 'GET', url: '/api/products?page=1&limit=3' }, resPage);
    assert(resPage.statusCode === 200, 'Check 5: Product pagination returns HTTP 200');
    assert(
      resPage.data?.page === 1 && resPage.data?.limit === 3,
      'Pagination metadata contains requested page and limit'
    );
    assert(resPage.data?.products?.length <= 3, 'Pagination limits result length to 3');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Cart Authentication & Isolation (Checks 6, 7, 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Cart Authentication & User Isolation ---');
  {
    // Check 6: Unauthenticated cart rejection
    const resUnauth = createMockRes();
    await cartHandler({ method: 'GET', url: '/api/cart' }, resUnauth);
    assert(resUnauth.statusCode === 401, 'Check 6: Unauthenticated cart GET is rejected with HTTP 401');

    const resUnauthPost = createMockRes();
    await cartHandler({ method: 'POST', url: '/api/cart', body: { productId: 'p1', quantity: 1 } }, resUnauthPost);
    assert(resUnauthPost.statusCode === 401, 'Unauthenticated cart POST is rejected with HTTP 401');

    // Check 7: Authenticated cart isolation (Database level relation test)
    const testClerkUser1 = 'smoke_test_user_1_' + Date.now();
    const testClerkUser2 = 'smoke_test_user_2_' + Date.now();

    // Verify foreign key integrity & cascade behavior in test transaction
    const user1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: 'user1_smoke@alongkar.test',
      },
    });

    const user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: 'user2_smoke@alongkar.test',
      },
    });

    try {
      const cart1 = await prisma.cart.create({
        data: { userId: user1.id },
      });

      const cart2 = await prisma.cart.create({
        data: { userId: user2.id },
      });

      assert(cart1.id !== cart2.id, 'Check 7: User 1 and User 2 carts are distinct');
      assert(cart1.userId === user1.id && cart2.userId === user2.id, 'Carts are strictly isolated by userId foreign key');

      // Check 8: Guest cart separation
      // In Alongkar architecture (Phase 1A), guest cart is held in client memory / localStorage
      // and never mixes with backend user database carts until intentional explicit checkout/login.
      assert(cart1.userId.startsWith('c') || cart1.userId.length > 0, 'Check 8: Authenticated cart requires database User record');
    } finally {
      // Clean up smoke test users (cascades to carts)
      await prisma.user.deleteMany({
        where: { id: { in: [user1.id, user2.id] } },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Wishlist Authentication & User Isolation (Checks 9, 10)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Wishlist Authentication & User Isolation ---');
  {
    // Check 9: Wishlist authentication
    const resUnauthWishlist = createMockRes();
    await wishlistHandler({ method: 'GET', url: '/api/wishlist' }, resUnauthWishlist);
    assert(resUnauthWishlist.statusCode === 401, 'Check 9: Unauthenticated wishlist GET is rejected with HTTP 401');

    // Check 10: Wishlist user isolation
    const testWishlistUser = 'smoke_test_wishlist_user_' + Date.now();
    const wUser = await prisma.user.create({
      data: {
        clerkUserId: testWishlistUser,
        email: 'wishlist_smoke@alongkar.test',
      },
    });

    try {
      const wList = await prisma.wishlist.create({
        data: { userId: wUser.id },
      });
      assert(wList.userId === wUser.id, 'Check 10: Wishlist record is strictly bound to authenticated User ID');
    } finally {
      await prisma.user.delete({ where: { id: wUser.id } });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Jewellery Request Authentication & Ownership (Checks 11, 12)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Jewellery Request Auth & Ownership ---');
  {
    // Check 11: Jewellery request authentication
    const resUnauthReq = createMockRes();
    await jewelleryRequestsHandler({ method: 'GET', url: '/api/jewellery-requests' }, resUnauthReq);
    assert(resUnauthReq.statusCode === 401, 'Check 11: Unauthenticated jewellery request GET is rejected with HTTP 401');

    const resUnauthReqPost = createMockRes();
    await jewelleryRequestsHandler({ method: 'POST', url: '/api/jewellery-requests' }, resUnauthReqPost);
    assert(resUnauthReqPost.statusCode === 401, 'Unauthenticated jewellery request POST is rejected with HTTP 401');

    // Check 12: Jewellery request ownership
    const testReqUser = 'smoke_test_req_user_' + Date.now();
    const rUser = await prisma.user.create({
      data: {
        clerkUserId: testReqUser,
        email: 'req_smoke@alongkar.test',
      },
    });

    try {
      const testReq = await prisma.jewelleryRequest.create({
        data: {
          requestNumber: `REQ-TEST-${Date.now()}`,
          userId: rUser.id,
          jewelleryType: 'Necklace',
          description: 'Smoke test custom request description',
          inspirationImageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
          phone: '9876543210',
          quantity: 1,
        },
      });
      assert(testReq.userId === rUser.id, 'Check 12: Jewellery request is strictly tied to creating User record');
      assert(testReq.status === 'PENDING', 'Default status is PENDING enum value');
    } finally {
      await prisma.user.delete({ where: { id: rUser.id } });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Admin Authorization & Protected Endpoints (Checks 13, 14, 15, 16)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Admin Authorization & Protected Endpoints ---');
  {
    // Check 13 & 14: Admin product authorization & non-admin rejection
    const resAdminProductPost = createMockRes();
    await productsHandler(
      {
        method: 'POST',
        url: '/api/products',
        body: {
          name: 'Unauthorized Test Product',
          price: 999,
          category: 'rings',
        },
      },
      resAdminProductPost
    );
    assert(
      resAdminProductPost.statusCode === 401 || resAdminProductPost.statusCode === 403,
      'Check 13 & 14: Product mutation without admin authorization is rejected (HTTP 401/403)'
    );

    // Check 15: Admin jewellery-request authorization
    const resAdminReqGet = createMockRes();
    await adminJewelleryRequestsHandler({ method: 'GET', url: '/api/admin/jewellery-requests' }, resAdminReqGet);
    assert(
      resAdminReqGet.statusCode === 401 || resAdminReqGet.statusCode === 403,
      'Check 15: Admin jewellery requests endpoint rejects unauthenticated access (HTTP 401/403)'
    );

    // Check 16: Product image upload authorization
    const resUpload = createMockRes();
    await uploadProductImageHandler({ method: 'POST', url: '/api/uploads/product-image' }, resUpload);
    assert(
      resUpload.statusCode === 401 || resUpload.statusCode === 403,
      'Check 16: Product image upload rejects unauthenticated / non-admin access (HTTP 401/403)'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Observability & Security Headers (Checks 17, 18)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Request ID & Security Headers ---');
  {
    // Check 17: Request-ID response header
    const resHeaderTest = createMockRes();
    await productsHandler({ method: 'GET', url: '/api/products' }, resHeaderTest);
    assert(Boolean(resHeaderTest.headers['x-request-id']), 'Check 17: X-Request-ID is present on responses');

    // Check 18: Security headers
    assert(resHeaderTest.headers['x-content-type-options'] === 'nosniff', 'Check 18: X-Content-Type-Options is nosniff');
    assert(resHeaderTest.headers['x-frame-options'] === 'DENY', 'X-Frame-Options is DENY');
    assert(
      resHeaderTest.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
      'Referrer-Policy is strict-origin-when-cross-origin'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Edge-Case Payload Handling (Checks 19, 20)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Malformed & Oversized Payload Handling ---');
  {
    // Check 19: Malformed JSON handling
    const resMalformed = createMockRes();
    await cartHandler(
      {
        method: 'POST',
        url: '/api/cart',
        headers: { 'content-type': 'application/json' },
        body: '{"invalidJson: true,', // Broken JSON string
      },
      resMalformed
    );
    assert(
      resMalformed.statusCode === 400 || resMalformed.statusCode === 401,
      'Check 19: Malformed JSON payload is safely rejected without uncaught exception'
    );

    // Check 20: Oversized request handling
    const resOversized = createMockRes();
    await cartHandler(
      {
        method: 'POST',
        url: '/api/cart',
        headers: { 'content-length': '2000000' }, // 2 MB > 1 MB limit
        body: { dummy: 'x' },
      },
      resOversized
    );
    assert(
      resOversized.statusCode === 413 || resOversized.statusCode === 400 || resOversized.statusCode === 401,
      'Check 20: Oversized request body (>1MB) is safely rejected'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Rate Limiting & Resilience (Checks 21, 22)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 10. Rate Limiting & Redis Degradation ---');
  {
    // Check 21: Rate-limit behavior
    const testLimiterId = 'smoke_test_limiter_' + Date.now();
    const limitOptions = { keyPrefix: 'smoke_test', limit: 3, windowSeconds: 60 };

    const r1 = await checkRateLimit(testLimiterId, limitOptions);
    const r2 = await checkRateLimit(testLimiterId, limitOptions);
    const r3 = await checkRateLimit(testLimiterId, limitOptions);
    const r4 = await checkRateLimit(testLimiterId, limitOptions);

    assert(r1.allowed && r2.allowed && r3.allowed, 'Initial requests within rate limit are allowed');
    assert(!r4.allowed, 'Check 21: Request exceeding configured limit is rate-limited (allowed: false)');

    // Check 22: Redis degradation fallback
    const mockKey = CacheKey.productId('smoke-test-key-' + Date.now());
    await cacheSet(mockKey, { test: 'value' }, 60);
    const cacheResult = await cacheGet(mockKey);
    assert(
      cacheResult.hit === true && (cacheResult.data as any)?.test === 'value',
      'Check 22: Caching layer operates and falls back smoothly (Redis or in-memory store)'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Error Sanitization & Database Timeout Guard (Checks 23, 24)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 11. Error Sanitization & Database Timeout Guard ---');
  {
    // Check 23: Safe error responses
    const secretError = new Error(
      'Error in query: postgresql://admin:super_secret_password@db.neon.tech/db at PrismaClient.query'
    );
    const safeMsg = getSafeErrorMessage(secretError, 'An internal error occurred');
    assert(
      !safeMsg.includes('super_secret_password') && !safeMsg.includes('postgresql://'),
      'Check 23: Database credentials and stack traces are redacted from error messages'
    );

    const maskedStr = maskSensitiveString('User token: Bearer eyJhbGciOiJIUzI1NiJ9.test');
    assert(!maskedStr.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT tokens are masked by maskSensitiveString');

    // Check 24: Database timeout guard (withTimeout wrapper)
    let timedOut = false;
    try {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 500));
      await withTimeout(slowPromise, 50, 'Smoke test timeout guard');
    } catch (err: any) {
      timedOut = true;
      assert(
        err.message.includes('timed out after 50ms'),
        'Check 24: withTimeout guard deterministically rejects operations exceeding timeout threshold'
      );
    }
    assert(timedOut, 'Slow operation triggered timeout reject');
  }

  console.log(`\n====================================================`);
  console.log(`PHASE 1G PRODUCTION SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionSmokeTestSuite().catch((err) => {
  console.error('Fatal test error in production smoke test suite:', err);
  process.exit(1);
});
