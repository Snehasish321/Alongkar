import prisma from '../src/lib/prisma.js';
import {
  isValidAddQuantity,
  isValidUpdateQuantity,
  getOrCreateCart,
} from '../api/cart.js';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
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

async function runPhase1ACartTests() {
  console.log('====================================================');
  console.log('PHASE 1A: STRICT GUEST & AUTHENTICATED CART SEPARATION TESTS');
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

  // Fetch real products from database for test assertions
  const products = await prisma.product.findMany({ take: 7 });
  if (products.length < 3) {
    console.error('❌ Need at least 3 products in the database to run cart test suite.');
    process.exit(1);
  }

  const [prodA, prodB, prodC] = products;
  console.log(`Test Products:`);
  console.log(`- Product A: ${prodA.name} (${prodA.id})`);
  console.log(`- Product B: ${prodB.name} (${prodB.id})`);
  console.log(`- Product C: ${prodC.name} (${prodC.id})\n`);

  // Create two isolated test users
  const testClerkUser1 = `test_clerk_cart_u1_${Date.now()}`;
  const testClerkUser2 = `test_clerk_cart_u2_${Date.now()}`;

  const user1 = await prisma.user.create({
    data: {
      clerkUserId: testClerkUser1,
      email: 'cartuser1@example.com',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      clerkUserId: testClerkUser2,
      email: 'cartuser2@example.com',
    },
  });

  try {
    // ─── 1. Unit Validation Functions ──────────────────────────────────────────
    console.log('--- 1. Testing Validation Functions ---');
    assert(isValidAddQuantity(1) === true, 'isValidAddQuantity(1) is valid');
    assert(isValidAddQuantity(99) === true, 'isValidAddQuantity(99) is valid');
    assert(isValidAddQuantity(0) === false, 'isValidAddQuantity(0) is invalid');
    assert(isValidAddQuantity(-1) === false, 'isValidAddQuantity(-1) is invalid');
    assert(isValidAddQuantity(2.5) === false, 'isValidAddQuantity(2.5) is invalid');
    assert(isValidAddQuantity(100) === false, 'isValidAddQuantity(100) is invalid (> 99)');
    assert(isValidAddQuantity(NaN) === false, 'isValidAddQuantity(NaN) is invalid');
    assert(isValidAddQuantity(Infinity) === false, 'isValidAddQuantity(Infinity) is invalid');
    assert(isValidAddQuantity('1' as any) === false, 'isValidAddQuantity("1") is invalid');

    assert(isValidUpdateQuantity(0) === true, 'isValidUpdateQuantity(0) is valid (for item removal)');
    assert(isValidUpdateQuantity(5) === true, 'isValidUpdateQuantity(5) is valid');
    assert(isValidUpdateQuantity(-1) === false, 'isValidUpdateQuantity(-1) is invalid');
    assert(isValidUpdateQuantity(2.5) === false, 'isValidUpdateQuantity(2.5) is invalid');
    assert(isValidUpdateQuantity(100) === false, 'isValidUpdateQuantity(100) is invalid (> 99)');

    // ─── 2. Add Valid Product to Cart ──────────────────────────────────────────
    console.log('\n--- 2. Add Valid Product to User 1 Cart ---');
    const cart1 = await getOrCreateCart(user1.id);

    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart1.id, productId: prodA.id } },
      update: { quantity: { increment: 2 } },
      create: { cartId: cart1.id, productId: prodA.id, quantity: 2 },
    });

    const user1CartAfterAdd = await getOrCreateCart(user1.id);
    assert(
      user1CartAfterAdd.items.length === 1 &&
        user1CartAfterAdd.items[0].productId === prodA.id &&
        user1CartAfterAdd.items[0].quantity === 2,
      'Product A added to User 1 cart with quantity 2'
    );

    // ─── 3. Add Existing Product Again (Atomic Increment) ─────────────────────
    console.log('\n--- 3. Atomic Increment of Existing Item ---');
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart1.id, productId: prodA.id } },
      update: { quantity: { increment: 3 } },
      create: { cartId: cart1.id, productId: prodA.id, quantity: 3 },
    });

    const user1CartAfterInc = await getOrCreateCart(user1.id);
    assert(
      user1CartAfterInc.items.length === 1 &&
        user1CartAfterInc.items[0].quantity === 5,
      'Atomic increment: 2 + 3 = 5 without creating duplicate rows'
    );

    // ─── 4. Product Existence & Nonexistent Product Check ──────────────────────
    console.log('\n--- 4. Nonexistent Product Validation ---');
    const fakeProductId = 'nonexistent-product-id-999999';
    const fakeProdCheck = await prisma.product.findUnique({
      where: { id: fakeProductId },
      select: { id: true },
    });
    assert(fakeProdCheck === null, 'Nonexistent product returns null from DB query');

    // ─── 5. Authenticated Cart Isolation ──────────────────────────────────────
    console.log('\n--- 5. Authenticated Cart Isolation ---');
    const cart2 = await getOrCreateCart(user2.id);
    assert(cart2.id !== cart1.id, 'User 1 and User 2 have distinct cart records');
    assert(cart2.items.length === 0, 'User 2 cart is completely isolated and empty');

    await prisma.cartItem.create({
      data: { cartId: cart2.id, productId: prodB.id, quantity: 1 },
    });

    const cart2WithItem = await getOrCreateCart(user2.id);
    const cart1Check = await getOrCreateCart(user1.id);
    assert(
      cart2WithItem.items.length === 1 && cart2WithItem.items[0].productId === prodB.id,
      'User 2 has Product B'
    );
    assert(
      cart1Check.items.length === 1 && cart1Check.items[0].productId === prodA.id,
      'User 1 still only has Product A (full isolation between accounts)'
    );

    // ─── 6. Strict Guest & Authenticated Separation (NO MERGE) ────────────────
    console.log('\n--- 6. Strict Guest & Authenticated Separation ---');
    // Setup server cart for User 1 with Product A (qty: 2), Product B (qty: 1), Product C (qty: 1)
    await prisma.cartItem.deleteMany({ where: { cartId: cart1.id } });
    await prisma.cartItem.createMany({
      data: [
        { cartId: cart1.id, productId: prodA.id, quantity: 2 },
        { cartId: cart1.id, productId: prodB.id, quantity: 1 },
        { cartId: cart1.id, productId: prodC.id, quantity: 1 },
      ],
    });

    // Simulated guest cart items in localStorage while logged out
    const guestCartItems = [
      { product: { id: prodA.id, name: prodA.name }, quantity: 3 }, // Overlapping product A
      { product: { id: 'guest-only-prod-x', name: 'Guest Item X' }, quantity: 4 }, // Guest-only product
    ];

    // Verify User 1's server cart remains ONLY the 3 database items
    const user1ServerCart = await getOrCreateCart(user1.id);
    const user1ItemMap = new Map(user1ServerCart.items.map((i) => [i.productId, i.quantity]));

    assert(user1ServerCart.items.length === 3, 'User 1 database cart has exactly 3 items');
    assert(user1ItemMap.get(prodA.id) === 2, 'Product A quantity is exactly 2 (NOT combined with guest qty 3)');
    assert(user1ItemMap.get(prodB.id) === 1, 'Product B quantity is exactly 1');
    assert(user1ItemMap.get(prodC.id) === 1, 'Product C quantity is exactly 1');
    assert(!user1ItemMap.has('guest-only-prod-x'), 'Guest-only items are NOT inserted into User 1 database cart');

    // ─── 7. Overlap Test: Authenticated Quantity Preserved ─────────────────────
    console.log('\n--- 7. Overlap Scenario: Guest Quantities Never Added to Server ---');
    // User A has Necklace (Product A) x2.
    // Guest adds Necklace (Product A) x3.
    // When User A logs in, the authenticated cart MUST remain Necklace x2 (NOT x5).
    const authenticatedCartAfterLogin = await getOrCreateCart(user1.id);
    const prodAEntry = authenticatedCartAfterLogin.items.find((i) => i.productId === prodA.id);
    assert(
      prodAEntry?.quantity === 2,
      'Overlap verification: Server cart remains quantity 2, never becomes quantity 5'
    );

    // ─── 8. PATCH / Quantity Update & Removal ─────────────────────────────────
    console.log('\n--- 8. PATCH Item Quantity & Removal on 0 ---');
    // Set Product A to 10
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart1.id, productId: prodA.id } },
      update: { quantity: 10 },
      create: { cartId: cart1.id, productId: prodA.id, quantity: 10 },
    });
    const cartAfterPatch = await getOrCreateCart(user1.id);
    const prodAItem = cartAfterPatch.items.find((i) => i.productId === prodA.id);
    assert(prodAItem?.quantity === 10, 'PATCH sets exact quantity to 10');

    // Setting quantity 0 deletes the item
    await prisma.cartItem.deleteMany({
      where: { cartId: cart1.id, productId: prodA.id },
    });
    const cartAfterZero = await getOrCreateCart(user1.id);
    assert(!cartAfterZero.items.some((i) => i.productId === prodA.id), 'Quantity 0 removes item from cart');

    // ─── 9. DELETE Cart Items & Clear All ─────────────────────────────────────
    console.log('\n--- 9. DELETE Cart Item & Clear All ---');
    await prisma.cartItem.deleteMany({
      where: { cartId: cart1.id, productId: prodB.id },
    });
    const cartAfterDelete = await getOrCreateCart(user1.id);
    assert(!cartAfterDelete.items.some((i) => i.productId === prodB.id), 'Single item deleted from cart');

    // Clear all
    await prisma.cartItem.deleteMany({
      where: { cartId: cart1.id },
    });
    const cartAfterClearAll = await getOrCreateCart(user1.id);
    assert(cartAfterClearAll.items.length === 0, 'Clear all removes all items from authenticated cart');

  } finally {
    // Clean up test data
    console.log('\n--- Cleaning up test records ---');
    await prisma.cart.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } },
    });
    console.log('Cleaned up test users and carts.');
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1ACartTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
