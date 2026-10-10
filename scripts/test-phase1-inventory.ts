import './testDbGuard.js';
import 'dotenv/config';

process.env.NODE_ENV = 'test';

import prisma from '../src/lib/prisma.js';
import productsHandler, {
  validateProductCreatePayload,
  validateProductUpdatePayload,
  formatProductResponse,
} from '../api/products.js';
import { cacheGet, cacheSet, invalidateProducts, CacheKey, TTL } from '../api/_utils/cache.js';
import { normalizeProduct } from '../src/services/productApi.js';

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

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, val: string) {
      this.headers[key] = val;
      return this;
    },
    json(payload: any) {
      this.data = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

async function runInventoryTests() {
  console.log('===============================================================');
  console.log('STARTING INVENTORY MANAGEMENT PHASE 1 SUITE');
  console.log('===============================================================');

  // =========================================================================
  // 1. UNIT TESTS: Payload Validation for availableStock
  // =========================================================================
  console.log('\n--- 1. Unit Tests: availableStock Validation ---');

  const basePayload = {
    name: 'Test Jhumka Set',
    slug: 'test-jhumka-set-' + Date.now(),
    category: 'earrings',
    price: 1299,
    originalPrice: 2499,
    image: 'https://images.unsplash.com/test-earring-1.jpg',
    hoverImage: 'https://images.unsplash.com/test-earring-2.jpg',
    description: 'Artisanal traditional Jhumka with micro pearl drops.',
    finish: '24K Micron Gold Plated',
    baseMaterial: 'Brass Alloy',
    warranty: '6 Months Polish Guarantee',
  };

  // 1.1 availableStock accepts 0
  const valZero = validateProductCreatePayload({ ...basePayload, availableStock: 0 });
  assert(valZero.errors.length === 0, 'availableStock accepts 0 (valid out-of-stock count)');
  assert(valZero.data?.availableStock === 0, 'availableStock is parsed as 0');
  assert(valZero.data?.inStock === false, 'inStock is derived as false when availableStock is 0');

  // 1.2 availableStock accepts positive integers
  const valPos = validateProductCreatePayload({ ...basePayload, availableStock: 10 });
  assert(valPos.errors.length === 0, 'availableStock accepts positive integer 10');
  assert(valPos.data?.availableStock === 10, 'availableStock is parsed as 10');
  assert(valPos.data?.inStock === true, 'inStock is derived as true when availableStock > 0');

  // 1.3 Negative stock is rejected
  const valNeg = validateProductCreatePayload({ ...basePayload, availableStock: -5 });
  assert(valNeg.errors.length > 0, 'Negative availableStock (-5) is rejected');
  assert(
    valNeg.errors.some((e) => e.field === 'availableStock'),
    'Validation error mentions availableStock for negative number'
  );

  // 1.4 Fractional stock is rejected
  const valFraction = validateProductCreatePayload({ ...basePayload, availableStock: 10.5 });
  assert(valFraction.errors.length > 0, 'Fractional availableStock (10.5) is rejected');
  assert(
    valFraction.errors.some((e) => e.field === 'availableStock'),
    'Validation error mentions availableStock for fractional number'
  );

  // 1.5 Invalid stock types are rejected
  const valString = validateProductCreatePayload({ ...basePayload, availableStock: 'ten' });
  assert(valString.errors.length > 0, 'String availableStock ("ten") is rejected');

  const valObject = validateProductCreatePayload({ ...basePayload, availableStock: { count: 5 } });
  assert(valObject.errors.length > 0, 'Object availableStock is rejected');

  const valArray = validateProductCreatePayload({ ...basePayload, availableStock: [10] });
  assert(valArray.errors.length > 0, 'Array availableStock is rejected');

  // 1.6 Update payload validation
  const valUpPos = validateProductUpdatePayload({ availableStock: 5 });
  assert(valUpPos.errors.length === 0, 'Update payload accepts availableStock 5');
  assert(valUpPos.data?.availableStock === 5, 'Update payload parses availableStock 5');
  assert(valUpPos.data?.inStock === true, 'Update payload sets inStock true');

  const valUpZero = validateProductUpdatePayload({ availableStock: 0 });
  assert(valUpZero.errors.length === 0, 'Update payload accepts availableStock 0');
  assert(valUpZero.data?.availableStock === 0, 'Update payload parses availableStock 0');
  assert(valUpZero.data?.inStock === false, 'Update payload sets inStock false');

  const valUpNeg = validateProductUpdatePayload({ availableStock: -1 });
  assert(valUpNeg.errors.length > 0, 'Update payload rejects negative availableStock (-1)');

  const valUpFrac = validateProductUpdatePayload({ availableStock: 4.2 });
  assert(valUpFrac.errors.length > 0, 'Update payload rejects fractional availableStock (4.2)');

  // =========================================================================
  // 2. RESPONSE FORMATTING & FRONTEND NORMALIZATION TESTS
  // =========================================================================
  console.log('\n--- 2. Response Formatting & Normalization Tests ---');

  const formattedPos = formatProductResponse({
    id: 'prod-test-1',
    name: 'Gold Jhumka',
    slug: 'gold-jhumka',
    category: 'earrings',
    price: 999,
    originalPrice: 1999,
    discountPercent: 50,
    rating: 5,
    reviewCount: 10,
    image: 'img.jpg',
    hoverImage: 'img2.jpg',
    description: 'desc',
    finish: '24K Gold',
    baseMaterial: 'Brass',
    warranty: '6 Months',
    availableStock: 10,
    inStock: true,
  });
  assert(formattedPos.availableStock === 10, 'formatProductResponse includes availableStock: 10');
  assert(formattedPos.inStock === true, 'formatProductResponse sets inStock: true');

  const formattedZero = formatProductResponse({
    id: 'prod-test-2',
    name: 'Out of Stock Jhumka',
    slug: 'oos-jhumka',
    category: 'earrings',
    price: 999,
    originalPrice: 1999,
    discountPercent: 50,
    rating: 5,
    reviewCount: 10,
    image: 'img.jpg',
    hoverImage: 'img2.jpg',
    description: 'desc',
    finish: '24K Gold',
    baseMaterial: 'Brass',
    warranty: '6 Months',
    availableStock: 0,
    inStock: false,
  });
  assert(formattedZero.availableStock === 0, 'formatProductResponse includes availableStock: 0');
  assert(formattedZero.inStock === false, 'formatProductResponse sets inStock: false');

  // Frontend normalizer test
  const normalized10 = normalizeProduct(formattedPos);
  assert(normalized10.availableStock === 10, 'normalizeProduct preserves availableStock: 10');
  assert(normalized10.inStock === true, 'normalizeProduct derives inStock: true for stock 10');

  const normalized0 = normalizeProduct(formattedZero);
  assert(normalized0.availableStock === 0, 'normalizeProduct preserves availableStock: 0');
  assert(normalized0.inStock === false, 'normalizeProduct derives inStock: false for stock 0');

  // =========================================================================
  // 3. DATABASE & API CRUD / ADMIN TESTS
  // =========================================================================
  console.log('\n--- 3. Database & Admin Stock Management ---');

  const testProductSlug = 'test-inventory-jhumka-' + Date.now();
  let createdProductId = '';

  // 3.1 Create product directly with availableStock = 10
  const createDbProduct = await prisma.product.create({
    data: {
      name: 'Inventory Test Jhumka',
      slug: testProductSlug,
      category: 'earrings',
      price: 1499,
      originalPrice: 2999,
      discountPercent: 50,
      image: 'https://images.unsplash.com/test-jhumka.jpg',
      hoverImage: 'https://images.unsplash.com/test-jhumka-hover.jpg',
      description: 'Handcrafted test Jhumka for inventory verification.',
      finish: '24K Micron Gold Plated',
      baseMaterial: 'Brass Alloy',
      warranty: '6 Months Polish Guarantee',
      availableStock: 10,
      inStock: true,
    },
  });
  createdProductId = createDbProduct.id;
  assert(createdProductId !== '', 'Created test product in database');
  assert(createDbProduct.availableStock === 10, 'Persisted initial availableStock is 10');
  assert(createDbProduct.inStock === true, 'Persisted initial inStock is true');

  // 3.2 Fetch product via API GET /api/products?id=<id>
  const getReq = { method: 'GET', query: { id: createdProductId }, url: `/api/products?id=${createdProductId}` };
  const getRes = createMockRes();
  await productsHandler(getReq, getRes);

  assert(getRes.statusCode === 200, 'GET /api/products?id returns 200');
  assert(getRes.data?.product?.availableStock === 10, 'API response contains authoritative availableStock = 10');
  assert(getRes.data?.product?.inStock === true, 'API response derives inStock = true');

  // 3.3 Admin updates stock from 10 to 5
  await prisma.product.update({
    where: { id: createdProductId },
    data: { availableStock: 5, inStock: true },
  });
  await invalidateProducts();

  const getRes2 = createMockRes();
  await productsHandler(getReq, getRes2);
  assert(getRes2.data?.product?.availableStock === 5, 'Admin updated stock from 10 to 5');
  assert(getRes2.data?.product?.inStock === true, 'Product with stock 5 remains In Stock');

  // 3.4 Admin changes stock from 5 to 0 (Out of Stock)
  await prisma.product.update({
    where: { id: createdProductId },
    data: { availableStock: 0, inStock: false },
  });
  await invalidateProducts();

  const getRes3 = createMockRes();
  await productsHandler(getReq, getRes3);
  assert(getRes3.data?.product?.availableStock === 0, 'Admin updated stock to 0');
  assert(getRes3.data?.product?.inStock === false, 'Product with stock 0 is Out of Stock');

  // 3.5 Admin restocks from 0 to 7
  await prisma.product.update({
    where: { id: createdProductId },
    data: { availableStock: 7, inStock: true },
  });
  await invalidateProducts();

  const getRes4 = createMockRes();
  await productsHandler(getReq, getRes4);
  assert(getRes4.data?.product?.availableStock === 7, 'Admin restocked from 0 to 7');
  assert(getRes4.data?.product?.inStock === true, 'Product becomes In Stock again');

  // =========================================================================
  // 4. CART INDEPENDENCE / NON-RESERVATION TESTS
  // =========================================================================
  console.log('\n--- 4. Cart Independence & Non-Reservation Tests ---');

  // Create a test user with a cart in the database
  const testUser = await prisma.user.create({
    data: {
      clerkUserId: 'clerk_test_cart_' + Date.now(),
      email: 'testcart@alongkar.com',
    },
  });

  const testCart = await prisma.cart.create({
    data: {
      userId: testUser.id,
    },
  });

  // Verify initial stock before cart activity
  const stockBeforeCart = await prisma.product.findUnique({
    where: { id: createdProductId },
    select: { availableStock: true },
  });
  assert(stockBeforeCart?.availableStock === 7, 'Authoritative stock is 7 before cart operations');

  // Event 1: User adds 3 units of the product to Cart
  const cartItem1 = await prisma.cartItem.create({
    data: {
      cartId: testCart.id,
      productId: createdProductId,
      quantity: 3,
    },
  });
  assert(cartItem1.quantity === 3, 'User added 3 units to Cart');

  // Verify stock in database remains 7
  const stockAfterAdd = await prisma.product.findUnique({
    where: { id: createdProductId },
    select: { availableStock: true },
  });
  assert(stockAfterAdd?.availableStock === 7, 'Available stock remains 7 because Cart does not reserve inventory');

  // Event 2: User changes Cart quantity from 3 to 5
  await prisma.cartItem.update({
    where: { id: cartItem1.id },
    data: { quantity: 5 },
  });

  const stockAfterUpdate = await prisma.product.findUnique({
    where: { id: createdProductId },
    select: { availableStock: true },
  });
  assert(stockAfterUpdate?.availableStock === 7, 'Available stock remains 7 after increasing Cart quantity to 5');

  // Event 3: User removes product from Cart
  await prisma.cartItem.delete({
    where: { id: cartItem1.id },
  });

  const stockAfterDelete = await prisma.product.findUnique({
    where: { id: createdProductId },
    select: { availableStock: true },
  });
  assert(stockAfterDelete?.availableStock === 7, 'Available stock remains 7 after removing item from Cart');

  // =========================================================================
  // 5. CACHING & CACHE INVALIDATION TESTS
  // =========================================================================
  console.log('\n--- 5. Cache Consistency & Invalidation Tests ---');

  const cacheKey = CacheKey.productId(createdProductId);

  // Pre-seed cache with old stock
  await cacheSet(cacheKey, { id: createdProductId, availableStock: 7, inStock: true }, TTL.PRODUCT_ONE);
  const cachedBefore = await cacheGet<any>(cacheKey);
  assert(cachedBefore.hit === true && cachedBefore.data?.availableStock === 7, 'Cache hit returns stock 7');

  // Admin restocks to 15 and invalidates
  await prisma.product.update({
    where: { id: createdProductId },
    data: { availableStock: 15, inStock: true },
  });
  await invalidateProducts();

  // Verify cache is cleared / subsequent GET fetches fresh stock from DB
  const cachedAfter = await cacheGet<any>(cacheKey);
  assert(cachedAfter.hit === false, 'Cache invalidation successfully clears stale cached product');

  const freshRes = createMockRes();
  await productsHandler(getReq, freshRes);
  assert(freshRes.data?.product?.availableStock === 15, 'Subsequent request retrieves updated stock 15 from DB');

  // =========================================================================
  // 6. CLEANUP TEST ENTITIES
  // =========================================================================
  console.log('\n--- 6. Cleaning Up Test Entities ---');
  try {
    await prisma.cart.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.product.deleteMany({ where: { id: createdProductId } });
    await invalidateProducts();
    console.log('Cleanup completed successfully.');
  } catch (err) {
    console.error('Cleanup warning:', err);
  }

  console.log('\n===============================================================');
  console.log(`PHASE 1 INVENTORY TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runInventoryTests()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
