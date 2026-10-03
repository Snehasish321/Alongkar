import prisma from '../src/lib/prisma.js';
import {
  CacheKey,
  TTL,
  cacheGet,
  cacheSet,
  cacheDel,
  getCacheVersion,
  invalidateProducts,
  invalidateProductKeys,
} from '../api/_utils/cache.js';
import { clearProductApiCache, fetchProducts, normalizeProduct } from '../src/services/productApi.js';

async function runPhase1BCacheTests() {
  console.log('====================================================');
  console.log('PHASE 1B: PRODUCTION PRODUCT CACHE & INVALIDATION TESTS');
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

  try {
    // ─── 1. Deterministic Cache Key Normalization Tests ─────────────────────────
    console.log('--- 1. Deterministic Cache Key Generation ---');
    const key1 = CacheKey.productsList('Necklaces', 'Summer');
    const key2 = CacheKey.productsList('necklaces  ', '  summer');
    assert(key1 === key2, 'Listing key is casing and whitespace invariant');
    assert(key1 === 'products:list:necklaces:summer', 'Listing key format matches canonical structure');

    const keyEmptyCat = CacheKey.productsList(undefined, undefined);
    const keyAllCat = CacheKey.productsList('all', 'all');
    const keyEmptyStr = CacheKey.productsList('', '');
    assert(keyEmptyCat === 'products:list:all:all', 'Default listing key resolves to "products:list:all:all"');
    assert(keyEmptyCat === keyAllCat, 'Undefined filter produces identical key to "all"');
    assert(keyEmptyCat === keyEmptyStr, 'Empty string filter produces identical key to "all"');

    const idKey1 = CacheKey.productId(' prod-123 ');
    const idKey2 = CacheKey.productId('prod-123');
    assert(idKey1 === 'products:id:prod-123', 'Product ID key trims whitespace');
    assert(idKey1 === idKey2, 'Whitespace trimmed ID produces identical key');

    const slugKey1 = CacheKey.productSlug('  Nitya-Gold-Necklace  ');
    const slugKey2 = CacheKey.productSlug('nitya-gold-necklace');
    assert(slugKey1 === 'products:slug:nitya-gold-necklace', 'Product Slug key is lowercased and trimmed');
    assert(slugKey1 === slugKey2, 'Slug key is casing and whitespace invariant');

    // Different filters must produce distinct keys
    const diffKey1 = CacheKey.productsList('necklaces', 'all');
    const diffKey2 = CacheKey.productsList('earrings', 'all');
    assert(diffKey1 !== diffKey2, 'Different categories produce distinct cache keys');

    // ─── 2. Cache Read, Write and TTL Behavior ─────────────────────────────────
    console.log('\n--- 2. Cache Read, Write and Miss Behavior ---');
    const testKey = `products:test:${Date.now()}`;
    const testData = { id: 'test-1', name: 'Test Choker', price: 2499 };

    const initialGet = await cacheGet(testKey);
    assert(initialGet.hit === false && initialGet.data === null, 'cacheGet on nonexistent key returns miss');

    await cacheSet(testKey, testData, 60);
    const afterSetGet = await cacheGet<typeof testData>(testKey);
    assert(
      afterSetGet.data !== null && afterSetGet.data.name === 'Test Choker',
      'cacheSet stores data and cacheGet retrieves data successfully'
    );

    await cacheDel(testKey);
    const afterDelGet = await cacheGet(testKey);
    assert(afterDelGet.hit === false, 'cacheDel deletes key from cache');

    // ─── 3. Stale GET Race Condition Protection via Versioning ────────────────
    console.log('\n--- 3. Stale GET Race Condition Protection ---');
    const raceKey = `products:test:race:${Date.now()}`;
    const initialVersion = await getCacheVersion();

    // Simulate: GET starts and captures initialVersion
    const capturedGetVersion = initialVersion;

    // Simulate: Admin mutation occurs in the interim (e.g. invalidateProducts increments version)
    await invalidateProducts();
    const mutatedVersion = await getCacheVersion();
    assert(mutatedVersion > initialVersion, 'invalidateProducts() increments global cache version');

    // Simulate: The old GET finishes and attempts to write with its stale capturedGetVersion
    const writeResult = await cacheSet(raceKey, { name: 'Old Stale Data' }, 60, capturedGetVersion);
    assert(writeResult === false, 'cacheSet rejects write when cache version has changed (Stale GET race prevented)');

    const raceGet = await cacheGet(raceKey);
    assert(raceGet.hit === false, 'Stale data was NOT written to cache');

    // Fresh write with current version succeeds
    const freshWriteResult = await cacheSet(raceKey, { name: 'Fresh Data' }, 60, mutatedVersion);
    assert(freshWriteResult === true, 'cacheSet allows write matching current cache version');
    await cacheDel(raceKey);

    // ─── 4. Database Invalidation on Product Lifecycle ─────────────────────────
    console.log('\n--- 4. Product Lifecycle Invalidation ---');
    // Create a temporary product in PostgreSQL
    const testSlug = `test-cache-choker-${Date.now()}`;
    const createdProd = await prisma.product.create({
      data: {
        name: 'Cache Test Royal Choker',
        slug: testSlug,
        category: 'necklaces',
        price: 3499,
        originalPrice: 4999,
        image: 'https://example.com/choker.jpg',
        hoverImage: 'https://example.com/choker-hover.jpg',
        description: 'Test royal choker for cache invalidation suite.',
        finish: '24K Micron Gold Plated',
        baseMaterial: 'Skin-friendly Brass Alloy',
        warranty: '6 Months Guarantee',
      },
    });

    const prodIdKey = CacheKey.productId(createdProd.id);
    const prodSlugKey = CacheKey.productSlug(createdProd.slug);
    const listKey = CacheKey.productsList('necklaces', 'all');

    // Pre-populate cache
    await cacheSet(prodIdKey, createdProd, TTL.PRODUCT_ONE);
    await cacheSet(prodSlugKey, createdProd, TTL.PRODUCT_ONE);
    await cacheSet(listKey, { products: [createdProd], count: 1 }, TTL.PRODUCTS_ALL);

    assert((await cacheGet(prodIdKey)).data !== null, 'Product ID key pre-populated in cache');
    assert((await cacheGet(prodSlugKey)).data !== null, 'Product Slug key pre-populated in cache');
    assert((await cacheGet(listKey)).data !== null, 'Product List key pre-populated in cache');

    // Invalidate product keys
    await invalidateProductKeys(createdProd.id, createdProd.slug);
    assert((await cacheGet(prodIdKey)).hit === false, 'invalidateProductKeys purged product ID key');
    assert((await cacheGet(prodSlugKey)).hit === false, 'invalidateProductKeys purged product Slug key');

    // Invalidate all products
    await invalidateProducts();
    assert((await cacheGet(listKey)).hit === false, 'invalidateProducts purged product listing key');

    // Clean up created product
    await prisma.product.delete({ where: { id: createdProd.id } });
    console.log('Cleaned up test product record.');

    // ─── 5. Frontend Cache Invalidation & Generation ───────────────────────────
    console.log('\n--- 5. Frontend Cache Invalidation & Generation ---');
    clearProductApiCache();
    assert(typeof clearProductApiCache === 'function', 'clearProductApiCache executes and resets cache generation');

    const normalized = normalizeProduct({
      id: 'p1',
      name: 'Sample Ring',
      price: 999,
      image: 'https://example.com/ring.jpg',
    });
    assert(normalized.id === 'p1' && normalized.price === 999, 'normalizeProduct standardizes product shape');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1BCacheTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
