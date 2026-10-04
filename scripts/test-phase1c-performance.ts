import prisma from '../src/lib/prisma.js';
import { CacheKey } from '../api/_utils/cache.js';
import productHandler from '../api/products.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 1C: API & DATABASE PERFORMANCE HARDENING TESTS');
  console.log('====================================================\n');

  // Helper for mock HTTP requests
  const createMockReq = (method: string, query: Record<string, string> = {}, body: any = null, headers: Record<string, string> = {}) => ({
    method,
    query,
    url: `/api/products?${new URLSearchParams(query).toString()}`,
    headers,
    body,
  });

  const createMockRes = () => {
    const res: any = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      end(data: string) {
        try {
          this.body = JSON.parse(data);
        } catch {
          this.body = data;
        }
      },
    };
    return res;
  };

  try {
    // ─── 1. Cache Key Determinism with Filter Options ──────────────────────────
    console.log('--- 1. Cache Key Determinism with Filters & Pagination ---');
    const key1 = CacheKey.productsList({ category: 'Earrings', collectionId: 'all' });
    const key2 = CacheKey.productsList('Earrings', 'all');
    assert(key1 === key2, 'Object-based and argument-based productsList keys match for standard category');
    assert(key1 === 'products:list:earrings:all', 'Canonical format is products:list:earrings:all');

    const keySearch1 = CacheKey.productsList({ category: 'Rings', search: 'gold', sortBy: 'price-asc', page: 1, limit: 10 });
    const keySearch2 = CacheKey.productsList({ category: 'rings ', search: ' GOLD ', sortBy: 'PRICE-ASC', page: '1', limit: '10' });
    assert(keySearch1 === keySearch2, 'Filter cache keys are case, whitespace, and type invariant');

    const keyDiffSort = CacheKey.productsList({ category: 'Rings', sortBy: 'price-desc' });
    assert(keySearch1 !== keyDiffSort, 'Distinct sort orders generate distinct cache keys');

    // ─── 2. Product Database Indexes & Query Optimizations ────────────────────
    console.log('\n--- 2. Product Query Filtering, Search & Sorting ---');

    // Seed test products
    const seed1 = await prisma.product.create({
      data: {
        name: 'Perf Test Emerald Gold Ring',
        slug: 'perf-test-emerald-gold-ring',
        category: 'Rings',
        price: 15000,
        originalPrice: 18000,
        discountPercent: 16,
        rating: 4.8,
        reviewCount: 12,
        isNew: true,
        isBestSeller: true,
        image: 'https://images.unsplash.com/photo-1',
        hoverImage: 'https://images.unsplash.com/photo-2',
        description: 'Handcrafted emerald studded gold ring with pure finish',
        finish: 'Glossy',
        baseMaterial: 'Gold',
        stoneType: 'Emerald',
        warranty: '1 Year',
        inStock: true,
      },
    });

    const seed2 = await prisma.product.create({
      data: {
        name: 'Perf Test Diamond Silver Earrings',
        slug: 'perf-test-diamond-silver-earrings',
        category: 'Earrings',
        price: 8500,
        originalPrice: 10000,
        discountPercent: 15,
        rating: 4.2,
        reviewCount: 5,
        isNew: false,
        isBestSeller: false,
        image: 'https://images.unsplash.com/photo-3',
        hoverImage: 'https://images.unsplash.com/photo-4',
        description: 'Exquisite silver earrings with diamond sparkle',
        finish: 'Matte',
        baseMaterial: 'Silver',
        stoneType: 'Diamond',
        warranty: '6 Months',
        inStock: true,
      },
    });

    const seed3 = await prisma.product.create({
      data: {
        name: 'Perf Test Platinum Bracelet',
        slug: 'perf-test-platinum-bracelet',
        category: 'Bracelets',
        price: 32000,
        originalPrice: 35000,
        discountPercent: 8,
        rating: 4.9,
        reviewCount: 20,
        isNew: true,
        isBestSeller: false,
        image: 'https://images.unsplash.com/photo-5',
        hoverImage: 'https://images.unsplash.com/photo-6',
        description: 'Modern platinum bracelet designed for elegance',
        finish: 'High Polish',
        baseMaterial: 'Platinum',
        warranty: '2 Years',
        inStock: false,
      },
    });

    // Test Category filter
    const reqCat = createMockReq('GET', { category: 'Rings' });
    const resCat = createMockRes();
    await productHandler(reqCat, resCat);
    assert(resCat.statusCode === 200, 'GET /api/products?category=Rings returns 200');
    assert(
      resCat.body.products.some((p: any) => p.slug === seed1.slug) &&
      !resCat.body.products.some((p: any) => p.slug === seed2.slug),
      'Category filter only returns matching category products'
    );

    // Test Search filter
    const reqSearch = createMockReq('GET', { search: 'emerald' });
    const resSearch = createMockRes();
    await productHandler(reqSearch, resSearch);
    assert(resSearch.statusCode === 200, 'GET /api/products?search=emerald returns 200');
    assert(
      resSearch.body.products.some((p: any) => p.slug === seed1.slug) &&
      !resSearch.body.products.some((p: any) => p.slug === seed2.slug),
      'Search query matches title/description at database level'
    );

    // Test Price sorting (asc)
    const reqSortAsc = createMockReq('GET', { sortBy: 'price-asc', limit: '50' });
    const resSortAsc = createMockRes();
    await productHandler(reqSortAsc, resSortAsc);
    assert(resSortAsc.statusCode === 200, 'GET /api/products?sortBy=price-asc returns 200');
    const prices = resSortAsc.body.products.map((p: any) => p.price);
    let isAsc = true;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] < prices[i - 1]) isAsc = false;
    }
    assert(isAsc, 'Products are sorted in ascending order of price');

    // Test In-Stock filter
    const reqStock = createMockReq('GET', { inStock: 'false' });
    const resStock = createMockRes();
    await productHandler(reqStock, resStock);
    assert(resStock.statusCode === 200, 'GET /api/products?inStock=false returns 200');
    assert(
      resStock.body.products.every((p: any) => p.inStock === false),
      'inStock=false filter strictly returns out of stock products'
    );

    // ─── 3. Database-Level Pagination ──────────────────────────────────────────
    console.log('\n--- 3. Database-Level Pagination & Limit Enforcement ---');
    const reqPage1 = createMockReq('GET', { page: '1', limit: '2' });
    const resPage1 = createMockRes();
    await productHandler(reqPage1, resPage1);
    assert(resPage1.statusCode === 200, 'GET /api/products?page=1&limit=2 returns 200');
    assert(resPage1.body.products.length <= 2, 'Page size respects limit=2');
    assert(typeof resPage1.body.total === 'number', 'Response contains total count');
    assert(typeof resPage1.body.totalPages === 'number', 'Response contains totalPages');
    assert(resPage1.body.page === 1, 'Response confirms page number');
    assert(resPage1.body.limit === 2, 'Response confirms limit size');

    // Enforce max page size cap (e.g. limit=500 capped at 100)
    const reqCap = createMockReq('GET', { page: '1', limit: '500' });
    const resCap = createMockRes();
    await productHandler(reqCap, resCap);
    assert(resCap.body.limit === 100, 'Max page size is safely capped at 100');

    // Clean up test products
    await prisma.product.deleteMany({
      where: { id: { in: [seed1.id, seed2.id, seed3.id] } },
    });
    console.log('Cleaned up seeded test products.');

    // ─── 4. Serverless Singleton Connection Verification ─────────────────────
    console.log('\n--- 4. Serverless PrismaClient Singleton Persistence ---');
    const globalPrisma = (globalThis as any).prisma;
    assert(globalPrisma !== undefined && globalPrisma !== null, 'PrismaClient is stored on globalThis for serverless warm execution');
    assert(globalPrisma === prisma, 'Exported prisma instance matches globalThis singleton instance');

  } catch (err) {
    console.error('Test execution exception:', err);
    failedTests++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
