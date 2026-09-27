import prisma from '../src/lib/prisma';
import productHandler from '../api/products';
import { normalizeProduct } from '../src/services/productApi';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status: (code: number) => MockResponse;
  setHeader: (key: string, value: string) => MockResponse;
  json: (data: any) => MockResponse;
  end: (data?: any) => MockResponse;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    end(data?: any) {
      if (data && !this.body) {
        try {
          this.body = JSON.parse(data);
        } catch {
          this.body = data;
        }
      }
      return this;
    },
  };
  return res;
}

async function runPhase6Tests() {
  console.log('====================================================');
  console.log('PHASE 6: STOREFRONT DATABASE MIGRATION & SLUG ROUTING TEST');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  try {
    // 1. Database initial state
    const initialCount = await prisma.product.count();
    console.log(`📦 Neon PostgreSQL initial product count: ${initialCount}`);
    assert(initialCount >= 24, 'PostgreSQL contains at least 24 base products', `Found ${initialCount}`);

    // 2. GET /api/products handler
    const listReq = { method: 'GET', url: 'http://localhost/api/products' };
    const listRes = createMockRes();
    await productHandler(listReq, listRes);

    assert(listRes.statusCode === 200, 'GET /api/products returns HTTP 200');
    assert(Array.isArray(listRes.body?.products), 'GET /api/products returns products array');
    assert(listRes.body?.products?.length === initialCount, 'GET /api/products count matches database');

    // 3. Test Slug Lookup on existing product
    const firstProduct = listRes.body.products[0];
    console.log(`🔍 Testing slug lookup for: "${firstProduct.name}" (slug: ${firstProduct.slug})`);

    const slugReq = {
      method: 'GET',
      url: `http://localhost/api/products?slug=${encodeURIComponent(firstProduct.slug)}`,
      query: { slug: firstProduct.slug },
    };
    const slugRes = createMockRes();
    await productHandler(slugReq, slugRes);

    assert(slugRes.statusCode === 200, `GET /api/products?slug=${firstProduct.slug} returns HTTP 200`);
    assert(slugRes.body?.product?.id === firstProduct.id, 'Slug lookup matches exact product ID');
    assert(slugRes.body?.product?.slug === firstProduct.slug, 'Returned product has identical slug');
    assert(slugRes.body?.product?.details?.finish !== undefined, 'Returned product has nested details object');

    // 4. Test 404 on non-existent slug
    const nonExistentSlugReq = {
      method: 'GET',
      url: 'http://localhost/api/products?slug=non-existent-luxury-haar-slug-12345',
      query: { slug: 'non-existent-luxury-haar-slug-12345' },
    };
    const nonExistentRes = createMockRes();
    await productHandler(nonExistentSlugReq, nonExistentRes);

    assert(nonExistentRes.statusCode === 404, 'GET /api/products?slug=non-existent-slug returns HTTP 404');
    assert(nonExistentRes.body?.error === 'Product not found', 'Returns proper error message');

    // 5. Test normalizeProduct frontend client utility
    const normalized = normalizeProduct(firstProduct);
    assert(normalized.id === firstProduct.id, 'normalizeProduct preserves id');
    assert(normalized.slug === firstProduct.slug, 'normalizeProduct preserves slug');
    assert(typeof normalized.price === 'number', 'normalizeProduct guarantees numeric price');
    assert(Boolean(normalized.details?.finish), 'normalizeProduct preserves finish detail');
    assert(Boolean(normalized.details?.warranty), 'normalizeProduct preserves warranty detail');

    // 6. Test Category filtering via query
    const catReq = {
      method: 'GET',
      url: 'http://localhost/api/products?category=necklaces',
      query: { category: 'necklaces' },
    };
    const catRes = createMockRes();
    await productHandler(catReq, catRes);
    assert(catRes.statusCode === 200, 'GET /api/products?category=necklaces returns HTTP 200');
    assert(
      catRes.body?.products?.every((p: any) => p.category?.toLowerCase() === 'necklaces'),
      'Filtered products match requested category'
    );

    // 7. Full Lifecycle: Admin Create -> Storefront Visibility -> Cart/Wishlist -> Edit -> Delete
    console.log('\n--- Running Complete Admin Creation -> Storefront -> Slug URL -> Delete Flow ---');
    const testSlug = `test-swarna-mayura-haar-${Date.now()}`;
    const testProductData = {
      name: 'Swarna Mayura Royal Peacock Choker Set',
      slug: testSlug,
      category: 'necklaces',
      collectionId: 'festive-glow',
      price: 3499,
      originalPrice: 5999,
      discountPercent: 42,
      rating: 4.9,
      reviewCount: 18,
      isNew: true,
      isBestSeller: true,
      isTrending: true,
      image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop',
      hoverImage: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=800&auto=format&fit=crop',
      description: 'Handcrafted royal peacock bridal choker featuring 24K micron gold finish with emerald drops.',
      finish: '24K Micron Gold Plated',
      baseMaterial: 'Skin-friendly Brass Alloy',
      stoneType: 'Emerald & Kundan',
      warranty: '6 Months Polish Guarantee',
      inStock: true,
    };

    // A. Create product in Neon PostgreSQL
    const created = await prisma.product.create({
      data: testProductData,
    });
    console.log(`✨ Created test product ID: ${created.id}, slug: ${created.slug}`);
    assert(Boolean(created.id), 'Test product successfully created in Neon PostgreSQL');

    // B. Verify Storefront /api/products includes new product
    const storefrontListRes = createMockRes();
    await productHandler({ method: 'GET', url: 'http://localhost/api/products' }, storefrontListRes);
    const foundOnShop = storefrontListRes.body?.products?.find((p: any) => p.slug === testSlug);
    assert(Boolean(foundOnShop), 'New Admin product automatically visible in storefront catalogue GET /api/products');
    assert(foundOnShop?.name === testProductData.name, 'Storefront product name matches created product');

    // C. Verify Slug-based URL Lookup for new product
    const createdSlugRes = createMockRes();
    await productHandler(
      {
        method: 'GET',
        url: `http://localhost/api/products?slug=${encodeURIComponent(testSlug)}`,
        query: { slug: testSlug },
      },
      createdSlugRes
    );
    assert(createdSlugRes.statusCode === 200, 'Direct slug lookup /product/:slug API returns HTTP 200');
    assert(createdSlugRes.body?.product?.name === testProductData.name, 'Slug URL returns correct product');

    // D. Simulate Cart & Wishlist normalization
    const cartNormalized = normalizeProduct(createdSlugRes.body.product);
    assert(cartNormalized.id === created.id, 'Cart normalization handles newly created Admin product');
    assert(cartNormalized.price === 3499, 'Cart normalization preserves correct price');

    // E. Update product in database
    const updated = await prisma.product.update({
      where: { id: created.id },
      data: {
        price: 3299,
        description: 'Updated heirloom peacock choker description for testing.',
      },
    });
    assert(updated.price === 3299, 'Test product updated in PostgreSQL');

    // F. Verify Storefront reflects update
    const updatedSlugRes = createMockRes();
    await productHandler(
      {
        method: 'GET',
        url: `http://localhost/api/products?slug=${encodeURIComponent(testSlug)}`,
        query: { slug: testSlug },
      },
      updatedSlugRes
    );
    assert(updatedSlugRes.body?.product?.price === 3299, 'Updated product price immediately reflected on slug lookup');
    assert(
      updatedSlugRes.body?.product?.description === 'Updated heirloom peacock choker description for testing.',
      'Updated description immediately reflected on slug lookup'
    );

    // G. Delete product from database
    await prisma.product.delete({
      where: { id: created.id },
    });
    console.log(`🗑️ Deleted temporary test product ID: ${created.id}`);

    // H. Verify deleted product disappears from /api/products
    const postDeleteListRes = createMockRes();
    await productHandler({ method: 'GET', url: 'http://localhost/api/products' }, postDeleteListRes);
    const notFoundInShop = !postDeleteListRes.body?.products?.some((p: any) => p.slug === testSlug);
    assert(notFoundInShop, 'Deleted product immediately disappears from storefront catalogue');

    // I. Verify deleted slug returns 404
    const deletedSlugRes = createMockRes();
    await productHandler(
      {
        method: 'GET',
        url: `http://localhost/api/products?slug=${encodeURIComponent(testSlug)}`,
        query: { slug: testSlug },
      },
      deletedSlugRes
    );
    assert(deletedSlugRes.statusCode === 404, 'Deleted product slug returns HTTP 404 Not Found');

    // J. Verify original products count is unchanged
    const finalCount = await prisma.product.count();
    assert(finalCount === initialCount, `Original ${initialCount} database products remained intact`, `Count is ${finalCount}`);

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('Test execution encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase6Tests();
