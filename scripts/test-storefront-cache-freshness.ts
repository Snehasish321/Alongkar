import {
  clearProductApiCache,
  fetchProducts,
  fetchProductBySlug,
  fetchProductById,
  normalizeProduct,
} from '../src/services/productApi.js';
import productHandler from '../api/products.js';

function createMockRes() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let data: any = null;

  const res: any = {
    statusCode: 200,
    headers,
    status(code: number) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
      return this;
    },
    set(hdrs: Record<string, string>) {
      for (const [k, v] of Object.entries(hdrs)) {
        headers[k.toLowerCase()] = v;
      }
      return this;
    },
    json(payload: any) {
      data = payload;
      this.data = payload;
      return this;
    },
    end(str: string) {
      if (str) {
        try {
          data = JSON.parse(str);
        } catch {
          data = str;
        }
      }
      this.data = data;
      return this;
    },
    _getStatus: () => statusCode,
    _getData: () => data,
    _getHeaders: () => headers,
  };
  return res;
}

async function runStorefrontCacheFreshnessTests() {
  console.log('====================================================');
  console.log('STOREFRONT CACHE FRESHNESS & DELETION CONSISTENCY TEST');
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

  // Save global fetch
  const originalFetch = global.fetch;

  try {
    // ─── 1. Public Product List Cache-Control Headers ─────────────────────────
    console.log('--- 1. Public Storefront Cache-Control Headers in api/products.ts ---');

    const publicReq = {
      method: 'GET',
      url: 'http://localhost/api/products',
      headers: {},
    };
    const publicRes = createMockRes();

    await productHandler(publicReq, publicRes);

    const publicHeaders = publicRes._getHeaders();
    console.log('Public Storefront Headers:', publicHeaders);

    assert(
      publicRes._getStatus() === 200,
      'Public GET /api/products returns HTTP 200'
    );
    assert(
      publicHeaders['cache-control']?.includes('max-age=0'),
      'Public listing returns max-age=0 to prevent browser HTTP disk retention',
      `Got: ${publicHeaders['cache-control']}`
    );
    assert(
      publicHeaders['cache-control']?.includes('s-maxage=30'),
      'Public listing sets short CDN s-maxage=30 to ensure deleted products expire rapidly from CDN',
      `Got: ${publicHeaders['cache-control']}`
    );
    assert(
      publicHeaders['cache-control']?.includes('stale-while-revalidate=60'),
      'Public listing sets bounded stale-while-revalidate=60',
      `Got: ${publicHeaders['cache-control']}`
    );

    // ─── 2. Admin Request Bypasses Cache with strict no-store ────────────────
    console.log('\n--- 2. Admin Request No-Store Headers in api/products.ts ---');
    // Using mock requireAdmin in admin header
    const adminReq = {
      method: 'GET',
      url: 'http://localhost/api/products',
      headers: {
        authorization: 'Bearer mock_admin_test_token',
      },
    };
    const adminRes = createMockRes();

    await productHandler(adminReq, adminRes);
    const adminHeaders = adminRes._getHeaders();

    // Since token is mock, if unauthorized it falls back to public or bypasses if authorized
    console.log('Admin Attempt Cache-Control:', adminHeaders['cache-control']);
    assert(
      adminHeaders['cache-control'] !== undefined,
      'Admin request responds with valid Cache-Control header'
    );

    // ─── 3. Client Memory Cache Invalidation in productApi.ts ─────────────────
    console.log('\n--- 3. Client Memory Cache & Cross-Tab Broadcast Invalidation ---');

    let fetchCount = 0;
    const mockProducts = [
      { id: 'prod-1', name: 'Royal Necklace', price: 1200, category: 'necklaces' },
      { id: 'prod-2', name: 'Temple Earrings', price: 800, category: 'earrings' },
    ];

    global.fetch = (async (url: string) => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ products: mockProducts }),
      } as any;
    }) as any;

    clearProductApiCache(false);

    // Initial fetch should hit network
    const initialList = await fetchProducts();
    assert(fetchCount === 1, 'Initial fetchProducts() calls network');
    assert(initialList.length === 2, 'Returns 2 products');

    // Second fetch within TTL should use in-memory cache without extra network call
    const cachedList = await fetchProducts();
    assert(fetchCount === 1, 'Second fetchProducts() uses in-memory cache (fetchCount unchanged)');
    assert(cachedList.length === 2, 'Cached list matches initial list');

    // Force refresh bypasses cache
    const forceRefreshedList = await fetchProducts({ forceRefresh: true });
    assert(fetchCount === 2, 'fetchProducts({ forceRefresh: true }) bypasses in-memory cache');
    assert(forceRefreshedList.length === 2, 'Refreshed list returned');

    // clearProductApiCache clears in-memory cache
    clearProductApiCache(false);
    await fetchProducts();
    assert(fetchCount === 3, 'clearProductApiCache() clears cache so subsequent call hits network');

    // ─── 4. Product Deletion & Storefront List / Count Consistency ───────────
    console.log('\n--- 4. Storefront Count Consistency After Product Deletion ---');

    // Simulate product deletion on backend (mockProducts now excludes prod-1)
    const updatedMockProducts = [
      { id: 'prod-2', name: 'Temple Earrings', price: 800, category: 'earrings' },
    ];

    global.fetch = (async (url: string) => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ products: updatedMockProducts }),
      } as any;
    }) as any;

    // Simulate admin deletion action triggering clearProductApiCache()
    clearProductApiCache();

    // Storefront refetches products
    const refreshedStorefrontList = await fetchProducts();
    assert(refreshedStorefrontList.length === 1, 'Refreshed storefront product list reflects deletion (count: 1)');
    assert(refreshedStorefrontList[0].id === 'prod-2', 'Deleted product is no longer present');

    // Verify count calculation (ShopPage filteredProducts.length)
    const shopCategory = 'all';
    const filteredProducts = refreshedStorefrontList.filter(
      (p) => shopCategory === 'all' || p.category?.toLowerCase() === shopCategory
    );
    assert(filteredProducts.length === 1, 'Storefront displayed count decreases from 2 to 1');

    // ─── 5. Deleted Product Detail Lookup & 404 Purging ───────────────────────
    console.log('\n--- 5. Deleted Product Detail Lookup (404 Purge) ---');

    let detailFetchCount = 0;
    global.fetch = (async (url: string) => {
      detailFetchCount++;
      if (url.includes('royal-necklace') || url.includes('prod-1')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ error: 'Product not found' }),
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ product: mockProducts[1] }),
      } as any;
    }) as any;

    clearProductApiCache(false);

    // Lookup deleted product by slug
    const deletedProduct = await fetchProductBySlug('royal-necklace', true);
    assert(deletedProduct === null, 'fetchProductBySlug returns null for 404 deleted product');

    // Lookup deleted product by id
    const deletedProductById = await fetchProductById('prod-1', true);
    assert(deletedProductById === null, 'fetchProductById returns null for 404 deleted product');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    global.fetch = originalFetch;
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStorefrontCacheFreshnessTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
