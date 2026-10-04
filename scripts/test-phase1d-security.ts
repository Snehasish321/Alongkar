import prisma from '../src/lib/prisma.js';
import productsHandler, {
  validateProductCreatePayload,
  validateProductUpdatePayload,
} from '../api/products.js';
import cartHandler from '../api/cart.js';
import wishlistHandler from '../api/wishlist.js';
import jewelleryRequestsHandler, {
  validateJewelleryRequestCreatePayload,
} from '../api/jewellery-requests.js';
import adminJewelleryRequestsHandler from '../api/admin/jewellery-requests.js';
import productImageUploadHandler from '../api/uploads/product-image.js';
import inspirationUploadHandler from '../api/uploads/jewellery-inspiration.js';
import {
  isValidString,
  isValidNumber,
  isValidInteger,
  isValidSlug,
  isValidIdentifier,
  isValidPhoneNumber,
  isValidHttpUrl,
  sanitizeSearchQuery,
  sanitizeSortBy,
  getSafeErrorMessage,
  checkRateLimit,
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

async function runPhase1DSecurityTests() {
  console.log('====================================================');
  console.log('PHASE 1D: API SECURITY & INPUT VALIDATION HARDENING TESTS');
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
  // 1. Security Headers Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Security Headers Verification ---');
  {
    const req = { method: 'GET', url: '/api/products' };
    const res = createMockRes();
    await productsHandler(req, res);

    assert(
      res.headers['x-content-type-options'] === 'nosniff',
      'X-Content-Type-Options: nosniff header is present'
    );
    assert(
      res.headers['x-frame-options'] === 'DENY',
      'X-Frame-Options: DENY header is present'
    );
    assert(
      res.headers['referrer-policy'] === 'strict-origin-when-cross-origin',
      'Referrer-Policy: strict-origin-when-cross-origin header is present'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Unauthenticated Access Rejection (401)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Unauthenticated Access Rejection (401) ---');
  {
    const endpoints = [
      { name: 'GET /api/cart', handler: cartHandler, req: { method: 'GET', url: '/api/cart' } },
      { name: 'POST /api/cart', handler: cartHandler, req: { method: 'POST', url: '/api/cart', body: { productId: 'p1' } } },
      { name: 'PATCH /api/cart', handler: cartHandler, req: { method: 'PATCH', url: '/api/cart', body: { productId: 'p1', quantity: 2 } } },
      { name: 'DELETE /api/cart', handler: cartHandler, req: { method: 'DELETE', url: '/api/cart' } },
      { name: 'GET /api/wishlist', handler: wishlistHandler, req: { method: 'GET', url: '/api/wishlist' } },
      { name: 'POST /api/wishlist', handler: wishlistHandler, req: { method: 'POST', url: '/api/wishlist', body: { productId: 'p1' } } },
      { name: 'DELETE /api/wishlist', handler: wishlistHandler, req: { method: 'DELETE', url: '/api/wishlist' } },
      { name: 'GET /api/jewellery-requests', handler: jewelleryRequestsHandler, req: { method: 'GET', url: '/api/jewellery-requests' } },
      { name: 'POST /api/jewellery-requests', handler: jewelleryRequestsHandler, req: { method: 'POST', url: '/api/jewellery-requests', body: {} } },
      { name: 'POST /api/products', handler: productsHandler, req: { method: 'POST', url: '/api/products', body: {} } },
      { name: 'PATCH /api/products', handler: productsHandler, req: { method: 'PATCH', url: '/api/products', body: { id: 'p1' } } },
      { name: 'DELETE /api/products', handler: productsHandler, req: { method: 'DELETE', url: '/api/products', body: { id: 'p1' } } },
      { name: 'GET /api/admin/jewellery-requests', handler: adminJewelleryRequestsHandler, req: { method: 'GET', url: '/api/admin/jewellery-requests' } },
      { name: 'PATCH /api/admin/jewellery-requests', handler: adminJewelleryRequestsHandler, req: { method: 'PATCH', url: '/api/admin/jewellery-requests', body: { id: 'r1' } } },
      { name: 'POST /api/uploads/product-image', handler: productImageUploadHandler, req: { method: 'POST', url: '/api/uploads/product-image' } },
      { name: 'POST /api/uploads/jewellery-inspiration', handler: inspirationUploadHandler, req: { method: 'POST', url: '/api/uploads/jewellery-inspiration' } },
    ];

    for (const ep of endpoints) {
      const res = createMockRes();
      await ep.handler(ep.req, res);
      assert(
        res.statusCode === 401,
        `Unauthenticated request to ${ep.name} returns HTTP 401`,
        `Expected 401 but received ${res.statusCode}`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Payload Size and Malformed JSON Rejection
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Payload Size and Malformed JSON Rejection ---');
  {
    // Malformed JSON
    const malformedReq = {
      method: 'POST',
      url: '/api/products',
      body: '{ "name": "Broken JSON ...', // String that fails JSON.parse in getRequestBody
    };
    const resMalformed = createMockRes();
    await productsHandler(malformedReq, resMalformed);
    assert(
      resMalformed.statusCode === 400,
      'Malformed JSON body returns HTTP 400 Bad Request',
      `Received ${resMalformed.statusCode}`
    );

    // Oversized Payload (> 1MB)
    const oversizedBody = { _error: 'PAYLOAD_TOO_LARGE' };
    const oversizedReq = {
      method: 'POST',
      url: '/api/products',
      body: oversizedBody,
    };
    const resOversized = createMockRes();
    await productsHandler(oversizedReq, resOversized);
    assert(
      resOversized.statusCode === 413,
      'Oversized payload (>1MB) returns HTTP 413 Payload Too Large',
      `Received ${resOversized.statusCode}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Product Input Validation & Numeric Hardening
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Product Input Validation & Numeric Hardening ---');
  {
    // Negative price
    const negPrice = validateProductCreatePayload({
      name: 'Gold Ring',
      slug: 'gold-ring',
      category: 'Rings',
      price: -100,
      originalPrice: 150,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Nice ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '6 Months',
    });
    assert(
      negPrice.errors.some((e) => e.field === 'price'),
      'Negative price is rejected'
    );

    // NaN price
    const nanPrice = validateProductCreatePayload({
      name: 'Gold Ring',
      slug: 'gold-ring',
      category: 'Rings',
      price: NaN,
      originalPrice: 150,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Nice ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '6 Months',
    });
    assert(
      nanPrice.errors.some((e) => e.field === 'price'),
      'NaN price is rejected'
    );

    // Infinity price
    const infPrice = validateProductCreatePayload({
      name: 'Gold Ring',
      slug: 'gold-ring',
      category: 'Rings',
      price: Infinity,
      originalPrice: 150,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Nice ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '6 Months',
    });
    assert(
      infPrice.errors.some((e) => e.field === 'price'),
      'Infinity price is rejected'
    );

    // Excessive price (> 100,000,000)
    const bigPrice = validateProductCreatePayload({
      name: 'Gold Ring',
      slug: 'gold-ring',
      category: 'Rings',
      price: 200_000_000,
      originalPrice: 150,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Nice ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '6 Months',
    });
    assert(
      bigPrice.errors.some((e) => e.field === 'price'),
      'Excessive price (>100,000,000) is rejected'
    );

    // Invalid slug with uppercase and spaces
    const badSlug = validateProductCreatePayload({
      name: 'Gold Ring',
      slug: 'Gold Ring 123!',
      category: 'Rings',
      price: 100,
      originalPrice: 150,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Nice ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '6 Months',
    });
    assert(
      badSlug.errors.some((e) => e.field === 'slug'),
      'Malformed slug with spaces and uppercase is rejected'
    );

    // Valid create payload
    const validCreate = validateProductCreatePayload({
      name: 'Modern Gold Ring',
      slug: 'modern-gold-ring',
      category: 'Rings',
      price: 1299,
      originalPrice: 1999,
      image: 'https://img.com/1.jpg',
      hoverImage: 'https://img.com/2.jpg',
      description: 'Handcrafted gold ring',
      finish: '18K Gold Plated',
      baseMaterial: 'Sterling Silver',
      warranty: '6 Months',
    });
    assert(
      validCreate.errors.length === 0 && validCreate.data.name === 'Modern Gold Ring',
      'Valid product create payload passes validation'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Mass-Assignment Protection
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Mass-Assignment Protection ---');
  {
    const maliciousUpdatePayload = {
      id: 'attacker-injected-id',
      createdAt: '1970-01-01',
      userId: 'attacker-user',
      name: 'Legitimate Name Update',
      price: 499,
      arbitraryAdminColumn: true,
      __proto__: { polluted: true },
    };

    const updateValidation = validateProductUpdatePayload(maliciousUpdatePayload);

    assert(
      updateValidation.data.id === undefined,
      'Mass assignment prevented: id cannot be updated via payload'
    );
    assert(
      updateValidation.data.createdAt === undefined,
      'Mass assignment prevented: createdAt cannot be updated via payload'
    );
    assert(
      updateValidation.data.userId === undefined,
      'Mass assignment prevented: userId cannot be updated via payload'
    );
    assert(
      updateValidation.data.arbitraryAdminColumn === undefined,
      'Mass assignment prevented: arbitrary unlisted columns discarded'
    );
    assert(
      updateValidation.data.name === 'Legitimate Name Update',
      'Legitimate field (name) is preserved'
    );
    assert(
      updateValidation.data.price === 499,
      'Legitimate field (price) is preserved'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Query Parameter Security & Allowlist Sorting
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Query Parameter Security & Allowlist Sorting ---');
  {
    // Sorting allowlist
    assert(sanitizeSortBy('price-asc') === 'price-asc', 'Allowed sort "price-asc" is accepted');
    assert(sanitizeSortBy('PRICE-LOW-TO-HIGH') === 'price-low-to-high', 'Case-insensitive allowed sort is normalized');
    assert(sanitizeSortBy('bestseller') === 'bestseller', 'Allowed sort "bestseller" is accepted');
    assert(sanitizeSortBy('arbitrary_sql_injection; DROP TABLE Product;') === undefined, 'SQL injection sort value is rejected');
    assert(sanitizeSortBy('nonexistent_sort') === undefined, 'Unknown sort field is rejected');

    // Search query sanitization
    const longSearch = 'a'.repeat(250);
    const sanitized = sanitizeSearchQuery(longSearch, 100);
    assert(
      sanitized !== undefined && sanitized.length === 100,
      'Excessively long search query is bounded to max length 100'
    );

    // Identifier validation
    assert(isValidIdentifier('cuid1234567890'), 'Standard CUID identifier is valid');
    assert(isValidIdentifier('prod-br-1'), 'Hyphenated identifier is valid');
    assert(!isValidIdentifier('id<script>alert(1)</script>'), 'XSS in identifier is rejected');
    assert(!isValidIdentifier('../../etc/passwd'), 'Path traversal in identifier is rejected');

    // Slug validation
    assert(isValidSlug('royal-emerald-necklace'), 'Standard slug is valid');
    assert(!isValidSlug('royal emerald'), 'Slug with spaces is invalid');
    assert(!isValidSlug('slug_with_underscore'), 'Slug with underscores is invalid');
    assert(!isValidSlug('slug--double-hyphen'), 'Slug with consecutive hyphens is invalid');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Jewellery Request Validation & Security
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Jewellery Request Validation & Security ---');
  {
    // Valid phone validation
    assert(isValidPhoneNumber('9876543210'), 'Valid 10-digit phone is accepted');
    assert(isValidPhoneNumber('+919876543210'), 'Valid +91 phone is accepted');
    assert(!isValidPhoneNumber('12345'), 'Short phone is rejected');
    assert(!isValidPhoneNumber('abcdefghij'), 'Alpha phone is rejected');

    // Valid URL validation
    assert(isValidHttpUrl('https://images.cloudinary.com/demo.jpg'), 'HTTPS image URL is accepted');
    assert(isValidHttpUrl('http://example.com/ring.png'), 'HTTP image URL is accepted');
    assert(!isValidHttpUrl('javascript:alert(1)'), 'javascript: URI is rejected');
    assert(!isValidHttpUrl('data:image/png;base64,abc'), 'data: URI is rejected');

    // Jewellery request create payload validation
    const invalidPhoneReq = validateJewelleryRequestCreatePayload({
      jewelleryType: 'Necklace',
      description: 'Custom gold necklace',
      inspirationImageUrl: 'https://example.com/img.jpg',
      phone: '0000000000', // Invalid Indian mobile
    });
    assert(
      invalidPhoneReq.errors.some((e) => e.field === 'phone'),
      'Invalid mobile phone in jewellery request is rejected'
    );

    const validReq = validateJewelleryRequestCreatePayload({
      jewelleryType: 'Necklace',
      description: 'Custom emerald gold necklace',
      inspirationImageUrl: 'https://example.com/img.jpg',
      phone: '9876543210',
      budget: 50000,
      quantity: 1,
    });
    assert(
      validReq.errors.length === 0 && validReq.data?.jewelleryType === 'Necklace',
      'Valid jewellery request payload passes validation'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Safe Error Handling & Leakage Prevention
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Safe Error Handling & Leakage Prevention ---');
  {
    const dbError = new Error('PrismaClientKnownRequestError: connection to postgresql://user:pass@db.neon.tech/main failed');
    const safeMsg1 = getSafeErrorMessage(dbError, 'Internal Server Error');
    assert(
      safeMsg1 === 'Internal Server Error' && !safeMsg1.includes('neon.tech') && !safeMsg1.includes('postgresql://'),
      'Database connection string and Prisma stack details are stripped from error messages'
    );

    const secretError = new Error('CLOUDINARY_API_SECRET key mismatch at line 42');
    const safeMsg2 = getSafeErrorMessage(secretError, 'Image upload failed');
    assert(
      safeMsg2 === 'Image upload failed' && !safeMsg2.includes('CLOUDINARY_API_SECRET'),
      'Cloudinary API secret names and stack references are stripped from error messages'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Rate Limiter Validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Rate Limiter Validation ---');
  {
    const testId = `test-user-${Date.now()}`;
    const opts = { keyPrefix: 'test_limit', limit: 3, windowSeconds: 60 };

    const r1 = await checkRateLimit(testId, opts);
    const r2 = await checkRateLimit(testId, opts);
    const r3 = await checkRateLimit(testId, opts);
    const r4 = await checkRateLimit(testId, opts);

    assert(r1.allowed === true && r1.remaining === 2, 'Rate limiter permits request 1');
    assert(r2.allowed === true && r2.remaining === 1, 'Rate limiter permits request 2');
    assert(r3.allowed === true && r3.remaining === 0, 'Rate limiter permits request 3');
    assert(r4.allowed === false, 'Rate limiter blocks request 4 when limit is exceeded');
  }

  console.log('\n====================================================');
  console.log(`PHASE 1D TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1DSecurityTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
