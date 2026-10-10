import './testDbGuard.js';
import prisma from '../src/lib/prisma.js';
import ordersHandler, {
  generateOrderNumber,
  validateCreateOrderPayload,
  formatOrderResponse,
} from '../api/orders.js';
import adminOrdersHandler, {
  formatAdminOrder,
  ALLOWED_ORDER_STATUS_TRANSITIONS,
  ALLOWED_PAYMENT_STATUS_TRANSITIONS,
  ALLOWED_SHIPPING_STATUS_TRANSITIONS,
} from '../api/admin/orders.js';

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

async function runPhase1IOrderTests() {
  console.log('====================================================');
  console.log('PHASE 1I-R1: ORDER ARCHITECTURE HARDENING & TRANSITION GUARDS');
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

  // Fetch real in-stock products from database for test assertions
  const products = await prisma.product.findMany({ where: { inStock: true }, take: 5 });
  if (products.length < 3) {
    console.error('❌ Need at least 3 in-stock products in the database to run order test suite.');
    process.exit(1);
  }

  const [prodA, prodB, prodC] = products;
  console.log(`Test Products:`);
  console.log(`- Product A: ${prodA.name} (₹${prodA.price}, stock: ${prodA.inStock}) [${prodA.id}]`);
  console.log(`- Product B: ${prodB.name} (₹${prodB.price}, stock: ${prodB.inStock}) [${prodB.id}]`);
  console.log(`- Product C: ${prodC.name} (₹${prodC.price}, stock: ${prodC.inStock}) [${prodC.id}]\n`);

  // Create two isolated test users and one admin user
  const ts = Date.now();
  const testClerkUser1 = `test_clerk_order_u1_${ts}`;
  const testClerkUser2 = `test_clerk_order_u2_${ts}`;
  const testClerkAdmin = `test_clerk_order_admin_${ts}`;

  const user1 = await prisma.user.create({
    data: {
      clerkUserId: testClerkUser1,
      email: 'customer1@alongkar.com',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      clerkUserId: testClerkUser2,
      email: 'customer2@alongkar.com',
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      clerkUserId: testClerkAdmin,
      email: 'admin@alongkar.com',
    },
  });

  // Track created records for cleanup
  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];

  try {
    process.env.NODE_ENV = 'test';

    // ─── 1. Unit Validation Functions & Mandatory Idempotency Key ──────────────
    console.log('--- 1. Testing Validation Functions & Mandatory Idempotency Key ---');
    const ordNum = generateOrderNumber();
    assert(ordNum.startsWith('ORD-'), 'generateOrderNumber generates prefix ORD-');
    assert(ordNum.length >= 15, `generateOrderNumber has valid length (${ordNum})`);

    const validPayload = {
      customerName: 'Snehasish Banerjee',
      customerPhone: '+919876543210',
      customerEmail: 'snehasish@example.com',
      idempotencyKey: `idem_val_${ts}_abc123`,
      shippingAddress: {
        line1: '123 Salt Lake Sector 5',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700091',
        country: 'India',
      },
    };

    const validCheck = validateCreateOrderPayload(validPayload);
    assert(validCheck.errors.length === 0, 'validateCreateOrderPayload passes with valid fields');
    assert(validCheck.data?.shippingAddress.pincode === '700091', 'Pincode is extracted correctly');
    assert(validCheck.data?.idempotencyKey === `idem_val_${ts}_abc123`, 'Idempotency key is extracted correctly');

    // Missing idempotency key rejected
    const missingIdemPayload = { ...validPayload };
    delete (missingIdemPayload as any).idempotencyKey;
    const missingIdemCheck = validateCreateOrderPayload(missingIdemPayload);
    assert(missingIdemCheck.errors.some(e => e.field === 'idempotencyKey'), 'Missing idempotency key is rejected');

    // Invalid idempotency key (too short < 8 chars)
    const shortIdemCheck = validateCreateOrderPayload({ ...validPayload, idempotencyKey: 'short' });
    assert(shortIdemCheck.errors.some(e => e.field === 'idempotencyKey'), 'Too short idempotency key (<8 chars) is rejected');

    // Invalid idempotency key (special/unsafe chars)
    const unsafeIdemCheck = validateCreateOrderPayload({ ...validPayload, idempotencyKey: 'key with spaces and @#$%' });
    assert(unsafeIdemCheck.errors.some(e => e.field === 'idempotencyKey'), 'Unsafe characters in idempotency key are rejected');

    // Invalid phone & pincode checks
    const invalidPhoneCheck = validateCreateOrderPayload({ ...validPayload, customerPhone: '123' });
    assert(invalidPhoneCheck.errors.some(e => e.field === 'customerPhone'), 'Rejects invalid phone number');

    const invalidPincodeCheck = validateCreateOrderPayload({
      ...validPayload,
      shippingAddress: { ...validPayload.shippingAddress, pincode: '123' },
    });
    assert(invalidPincodeCheck.errors.some(e => e.field === 'shippingAddress.pincode'), 'Rejects invalid pincode');

    // ─── 2. Auth & Security Enforcement ───────────────────────────────────────
    console.log('\n--- 2. Testing Authentication & Authorization Controls ---');

    // Test 2a: Unauthenticated customer cannot create order
    const unauthRes = createMockRes();
    await ordersHandler({ method: 'POST', body: validPayload, _testUser: null }, unauthRes);
    assert(unauthRes.statusCode === 401, 'Unauthenticated customer cannot create an order (401)');

    // Missing idempotency key via API endpoint returns HTTP 400
    const missingKeyRes = createMockRes();
    await ordersHandler({ method: 'POST', _testUser: user1, body: missingIdemPayload }, missingKeyRes);
    assert(missingKeyRes.statusCode === 400, 'POST /api/orders rejects missing idempotencyKey with HTTP 400');
    assert(missingKeyRes.data?.details?.some((d: any) => d.field === 'idempotencyKey'), 'Error response details mention idempotencyKey');

    // ─── 3. Cart-to-Order Transactional Creation ──────────────────────────────
    console.log('\n--- 3. Testing Cart-to-Order Creation & Atomicity ---');

    // Populate user1 cart with prodA (qty 2) and prodB (qty 1)
    const cart1 = await prisma.cart.upsert({
      where: { userId: user1.id },
      update: {},
      create: { userId: user1.id },
    });

    await prisma.cartItem.createMany({
      data: [
        { cartId: cart1.id, productId: prodA.id, quantity: 2 },
        { cartId: cart1.id, productId: prodB.id, quantity: 1 },
      ],
    });

    const expectedSubtotal = (prodA.price * 2) + (prodB.price * 1);

    const orderRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: `idem_key_1_${ts}`,
          customerNotes: 'Please deliver after 5 PM',
        },
      },
      orderRes
    );

    assert(orderRes.statusCode === 201, `Authenticated customer creates order successfully (201, got ${orderRes.statusCode})`);
    const createdOrder = orderRes.data?.order;
    assert(createdOrder && createdOrder.id, 'Order object returned in response');
    if (createdOrder) createdOrderIds.push(createdOrder.id);

    assert(createdOrder?.userId === user1.id, 'Order ownership strictly belongs to authenticated user1');
    assert(createdOrder?.status === 'PENDING_PAYMENT', 'Order status starts as PENDING_PAYMENT');
    assert(createdOrder?.paymentStatus === 'PENDING', 'Payment status starts as PENDING');
    assert(createdOrder?.shippingStatus === 'NOT_READY', 'Shipping status starts as NOT_READY');
    assert(createdOrder?.subtotal === expectedSubtotal, `Subtotal ₹${createdOrder?.subtotal} matches expected ₹${expectedSubtotal}`);
    assert(createdOrder?.grandTotal === expectedSubtotal, `Grand total ₹${createdOrder?.grandTotal} matches expected ₹${expectedSubtotal}`);
    assert(createdOrder?.items.length === 2, 'All 2 order items created');

    // Verify cart was atomically cleared
    const remainingCartItems = await prisma.cartItem.count({ where: { cartId: cart1.id } });
    assert(remainingCartItems === 0, 'Cart items atomically cleared upon order creation');

    // ─── 4. Payment Retry Source of Truth & Cart Independence ─────────────────
    console.log('\n--- 4. Testing Payment Retry & Cart Independence ---');

    // The cart is now 0 items, but the existing PENDING_PAYMENT order can be fetched for payment retry
    const retryLookupRes = createMockRes();
    await ordersHandler(
      {
        method: 'GET',
        _testUser: user1,
        query: { id: createdOrder.id },
      },
      retryLookupRes
    );

    assert(retryLookupRes.statusCode === 200, 'Existing PENDING_PAYMENT order is retrievable after cart cleared');
    const retryOrder = retryLookupRes.data?.order;
    assert(retryOrder?.id === createdOrder.id, 'Retry target matches existing order ID');
    assert(retryOrder?.grandTotal === expectedSubtotal, 'Retry payment amount is preserved from order snapshot (not empty cart)');
    assert(retryOrder?.items?.length === 2, 'Order items snapshot remains preserved for future payment sessions');

    // ─── 5. Price & Snapshot Immutability ─────────────────────────────────────
    console.log('\n--- 5. Testing Price & Product Snapshot Immutability ---');

    // Verify item snapshots in DB
    const firstItem = createdOrder?.items.find((i: any) => i.productId === prodA.id);
    assert(firstItem?.productName === prodA.name, 'Snapshot preserved authoritative product name');
    assert(firstItem?.unitPrice === prodA.price, 'Snapshot preserved authoritative unit price');
    assert(firstItem?.lineTotal === prodA.price * 2, `Snapshot lineTotal ₹${firstItem?.lineTotal} = unitPrice * 2`);

    // Test: Frontend-supplied price & name tampering cannot alter authoritative snapshot
    const tamperedPayload = {
      ...validPayload,
      idempotencyKey: `idem_tamper_${ts}`,
      items: [
        {
          productId: prodA.id,
          quantity: 1,
          price: 1, // Malicious ₹1 price attempt
          productName: 'Hacked Diamond Necklace',
        },
      ],
      subtotal: 1,
      grandTotal: 1,
      status: 'DELIVERED', // Malicious status attempt
      paymentStatus: 'PAID', // Malicious payment bypass attempt
    };

    const tamperRes = createMockRes();
    await ordersHandler({ method: 'POST', _testUser: user1, body: tamperedPayload }, tamperRes);
    assert(tamperRes.statusCode === 201, 'Order created with authoritative recalculation');
    const tamperedOrder = tamperRes.data?.order;
    if (tamperedOrder) createdOrderIds.push(tamperedOrder.id);

    assert(tamperedOrder?.status === 'PENDING_PAYMENT', 'Malicious status ignored, set to PENDING_PAYMENT');
    assert(tamperedOrder?.paymentStatus === 'PENDING', 'Malicious paymentStatus ignored, set to PENDING');
    assert(tamperedOrder?.grandTotal === prodA.price, `Malicious grandTotal ignored, recalculated to ₹${prodA.price}`);
    const tamperedItem = tamperedOrder?.items[0];
    assert(tamperedItem?.productName === prodA.name, 'Malicious productName ignored, stored DB product name');

    // Test: Changing product catalog price later does NOT change historical order
    const temporaryProduct = await prisma.product.create({
      data: {
        name: `Immutable Test Product ${ts}`,
        slug: `immutable-test-product-${ts}`,
        category: 'earrings',
        price: 5000,
        originalPrice: 6000,
        discountPercent: 16,
        image: 'https://res.cloudinary.com/test/image.jpg',
        hoverImage: 'https://res.cloudinary.com/test/hover.jpg',
        description: 'Test product for snapshot verification',
        finish: 'Glossy',
        baseMaterial: 'Brass',
        warranty: '6 Months',
        inStock: true,
      },
    });
    createdProductIds.push(temporaryProduct.id);

    const snapshotOrderRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: `idem_snap_${ts}`,
          items: [{ productId: temporaryProduct.id, quantity: 2 }],
        },
      },
      snapshotOrderRes
    );
    const snapOrder = snapshotOrderRes.data?.order;
    if (snapOrder) createdOrderIds.push(snapOrder.id);

    assert(snapOrder?.grandTotal === 10000, 'Original order grand total is ₹10,000 (2 * ₹5,000)');

    // Now modify the catalog product price in PostgreSQL
    await prisma.product.update({
      where: { id: temporaryProduct.id },
      data: { price: 99999, name: 'Renamed Catalog Product' },
    });

    // Query historical order again
    const historicalOrderInDb = await prisma.order.findUnique({
      where: { id: snapOrder.id },
      include: { items: true },
    });
    const formattedHist = formatOrderResponse(historicalOrderInDb);

    assert(formattedHist?.grandTotal === 10000, 'Historical order grandTotal remains ₹10,000 despite catalog price update');
    assert(formattedHist?.items[0].unitPrice === 5000, 'Historical order item unitPrice remains ₹5,000');
    assert(formattedHist?.items[0].productName === `Immutable Test Product ${ts}`, 'Historical order item productName remains preserved');

    // ─── 6. Product Deletion Safety ───────────────────────────────────────────
    console.log('\n--- 6. Testing Product Deletion / Cascade Safety ---');

    // Delete the product from catalog
    await prisma.product.delete({
      where: { id: temporaryProduct.id },
    });
    const pIdx = createdProductIds.indexOf(temporaryProduct.id);
    if (pIdx > -1) createdProductIds.splice(pIdx, 1);

    // Verify historical order item still exists and has preserved all details
    const orderAfterProductDeletion = await prisma.order.findUnique({
      where: { id: snapOrder.id },
      include: { items: true },
    });
    assert(orderAfterProductDeletion !== null, 'Order still exists after product deletion');
    assert(orderAfterProductDeletion?.items.length === 1, 'OrderItem still exists after product deletion');
    assert(orderAfterProductDeletion?.items[0].productId === null, 'OrderItem.productId safely set to null via SetNull');
    assert(orderAfterProductDeletion?.items[0].productName === `Immutable Test Product ${ts}`, 'Historical product name intact');
    assert(Number(orderAfterProductDeletion?.items[0].lineTotal) === 10000, 'Historical line total intact');

    // ─── 7. Idempotency & Duplicate Prevention ─────────────────────────────────
    console.log('\n--- 7. Testing Idempotency & Duplicate Checkout Prevention ---');

    const idemKey = `idem_duplicate_test_${ts}`;
    const firstAttemptRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: idemKey,
          items: [{ productId: prodA.id, quantity: 1 }],
        },
      },
      firstAttemptRes
    );
    assert(firstAttemptRes.statusCode === 201, 'First attempt creates order (201)');
    const firstOrderId = firstAttemptRes.data?.order?.id;
    if (firstOrderId) createdOrderIds.push(firstOrderId);

    // Second duplicate attempt with same idempotency key
    const secondAttemptRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: idemKey,
          items: [{ productId: prodA.id, quantity: 1 }],
        },
      },
      secondAttemptRes
    );

    assert(secondAttemptRes.statusCode === 200, 'Duplicate request with same idempotencyKey returns 200 replay');
    assert(secondAttemptRes.data?.idempotentReplay === true, 'Response marks idempotentReplay: true');
    assert(secondAttemptRes.data?.order?.id === firstOrderId, 'Returns exact same existing order ID without creating duplicate');

    // Different idempotency key creates separate legitimate order
    const differentIdemKey = `idem_different_key_${ts}`;
    const diffRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: differentIdemKey,
          items: [{ productId: prodA.id, quantity: 1 }],
        },
      },
      diffRes
    );
    assert(diffRes.statusCode === 201, 'Different idempotency key creates a separate legitimate order (201)');
    const diffOrderId = diffRes.data?.order?.id;
    if (diffOrderId) createdOrderIds.push(diffOrderId);
    assert(diffOrderId !== firstOrderId, 'New order has unique order ID');

    // ─── 8. Customer Isolation & Retrieval ────────────────────────────────────
    console.log('\n--- 8. Testing Customer Isolation & Order Retrieval ---');

    // User 1 requests their order by ID
    const user1GetRes = createMockRes();
    await ordersHandler(
      {
        method: 'GET',
        _testUser: user1,
        query: { id: firstOrderId },
      },
      user1GetRes
    );
    assert(user1GetRes.statusCode === 200, 'User 1 can retrieve their own order (200)');
    assert(user1GetRes.data?.order?.id === firstOrderId, 'Retrieved matching order ID');

    // User 2 attempts to retrieve User 1's order by ID (cross-customer discovery)
    const user2GetRes = createMockRes();
    await ordersHandler(
      {
        method: 'GET',
        _testUser: user2,
        query: { id: firstOrderId },
      },
      user2GetRes
    );
    assert(user2GetRes.statusCode === 404, 'User 2 receives 404 Not Found when requesting User 1 order (strictly isolated)');

    // User 2 attempts to supply user1.id in checkout body to hijack ownership
    const hijackRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user2,
        body: {
          ...validPayload,
          idempotencyKey: `idem_hijack_${ts}`,
          userId: user1.id,
          items: [{ productId: prodA.id, quantity: 1 }],
        },
      },
      hijackRes
    );
    assert(hijackRes.statusCode === 201, 'Order created');
    const hijackedOrder = hijackRes.data?.order;
    if (hijackedOrder) createdOrderIds.push(hijackedOrder.id);
    assert(hijackedOrder?.userId === user2.id, 'Order assigned to authenticated user2, ignoring client-supplied userId');

    // ─── 9. Admin Authorization & State Transition Guards ─────────────────────
    console.log('\n--- 9. Testing Admin Authorization & State Transition Guards ---');

    // Non-admin attempt on admin endpoint
    const nonAdminRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'GET',
        _testAdmin: {
          authorized: false,
          status: 403,
          error: 'Forbidden: Administrator privileges required',
        },
      },
      nonAdminRes
    );
    assert(nonAdminRes.statusCode === 403, 'Non-admin blocked from admin orders endpoint (403)');

    // Admin authenticated
    const adminAuthData = {
      authorized: true,
      status: 200,
      user: adminUser,
      clerkUserId: testClerkAdmin,
    };

    // Admin lists orders
    const adminListRes = createMockRes();
    await adminOrdersHandler({ method: 'GET', _testAdmin: adminAuthData, query: { limit: 10 } }, adminListRes);
    assert(adminListRes.statusCode === 200, 'Admin can list all orders (200)');
    assert(Array.isArray(adminListRes.data?.orders), 'Admin receives order array');

    // 9a. Test Invalid Order Status Transition: PENDING_PAYMENT -> DELIVERED (impossible jump)
    const invalidOrderJumpRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          status: 'DELIVERED',
        },
      },
      invalidOrderJumpRes
    );
    assert(invalidOrderJumpRes.statusCode === 400, 'Invalid jump from PENDING_PAYMENT to DELIVERED rejected (400)');
    assert(invalidOrderJumpRes.data?.error?.includes('Invalid order status transition'), 'Error message specifies invalid order status transition');

    // 9b. Test Invalid Shipping Transition: NOT_READY -> SHIPPED without PAID
    const invalidShippingWithoutPaidRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          shippingStatus: 'SHIPPED',
        },
      },
      invalidShippingWithoutPaidRes
    );
    assert(invalidShippingWithoutPaidRes.statusCode === 400, 'Advancing shipping without PAID rejected (400)');

    // 9c. Test Valid Sequential Transitions
    // Step 1: Pay order
    const payRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          paymentStatus: 'PAID',
          status: 'CONFIRMED',
          adminNotes: 'Payment verified',
        },
      },
      payRes
    );
    assert(payRes.statusCode === 200, 'Order paid & confirmed successfully (200)');
    assert(payRes.data?.order?.paidAt !== null, 'paidAt timestamp automatically set');

    // Step 2: Test Invalid Payment Transition: PAID -> PENDING (backward transition prohibited)
    const paidToPendingRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          paymentStatus: 'PENDING',
        },
      },
      paidToPendingRes
    );
    assert(paidToPendingRes.statusCode === 400, 'PAID -> PENDING backward transition rejected (400)');

    // Step 3: Advance order to PROCESSING and READY
    const processRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          status: 'PROCESSING',
          shippingStatus: 'READY',
        },
      },
      processRes
    );
    assert(processRes.statusCode === 200, 'Transition to PROCESSING & READY succeeded (200)');

    // Step 4: Advance to SHIPPED
    const shipRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          status: 'SHIPPED',
          shippingStatus: 'SHIPPED',
          shipmentTrackingNumber: 'TRACK123456789',
        },
      },
      shipRes
    );
    assert(shipRes.statusCode === 200, 'Transition to SHIPPED succeeded (200)');
    assert(shipRes.data?.order?.shippedAt !== null, 'shippedAt timestamp recorded');

    // Step 5: Advance to DELIVERED
    const deliverRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          status: 'DELIVERED',
          shippingStatus: 'DELIVERED',
        },
      },
      deliverRes
    );
    assert(deliverRes.statusCode === 200, 'Transition to DELIVERED succeeded (200)');
    assert(deliverRes.data?.order?.deliveredAt !== null, 'deliveredAt timestamp recorded');

    // Step 6: Test Terminal Order State: DELIVERED -> SHIPPED (backward transition prohibited)
    const deliveredToShippedRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          status: 'SHIPPED',
        },
      },
      deliveredToShippedRes
    );
    assert(deliveredToShippedRes.statusCode === 400, 'DELIVERED -> SHIPPED backward transition rejected (400)');

    // Step 7: Refund flow & verify terminal refund status
    const refundOrderRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          paymentStatus: 'REFUNDED',
          cancelReason: 'Customer return accepted',
        },
      },
      refundOrderRes
    );
    assert(refundOrderRes.statusCode === 200, 'PAID -> REFUNDED succeeded (200)');

    // Step 8: REFUNDED -> PAID prohibited
    const refundedToPaidRes = createMockRes();
    await adminOrdersHandler(
      {
        method: 'PATCH',
        _testAdmin: adminAuthData,
        body: {
          id: firstOrderId,
          paymentStatus: 'PAID',
        },
      },
      refundedToPaidRes
    );
    assert(refundedToPaidRes.statusCode === 400, 'REFUNDED -> PAID transition rejected (400)');

    // ─── 10. Stock & Validation Boundary Cases ────────────────────────────────
    console.log('\n--- 10. Testing Stock & Boundary Validation ---');

    // Out of stock product rejection
    const outOfStockProd = await prisma.product.create({
      data: {
        name: `Out of Stock Ring ${ts}`,
        slug: `out-of-stock-ring-${ts}`,
        category: 'rings',
        price: 1500,
        originalPrice: 1500,
        discountPercent: 0,
        image: 'https://res.cloudinary.com/test/ring.jpg',
        hoverImage: 'https://res.cloudinary.com/test/ring-h.jpg',
        description: 'Out of stock test item',
        finish: 'Silver',
        baseMaterial: 'Silver',
        warranty: '1 Year',
        inStock: false,
      },
    });
    createdProductIds.push(outOfStockProd.id);

    const oosRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: `idem_oos_${ts}`,
          items: [{ productId: outOfStockProd.id, quantity: 1 }],
        },
      },
      oosRes
    );
    assert(oosRes.statusCode === 400, 'Rejects checkout when product is out of stock (400)');
    assert(oosRes.data?.error?.includes('out of stock'), `Error message mentions out of stock (${oosRes.data?.error})`);

    // Invalid product ID
    const invalidProdRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          ...validPayload,
          idempotencyKey: `idem_inval_${ts}`,
          items: [{ productId: 'non_existent_id_99999', quantity: 1 }],
        },
      },
      invalidProdRes
    );
    assert(invalidProdRes.statusCode === 400, 'Rejects checkout for non-existent product ID (400)');
  } finally {
    // ─── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n--- Cleaning up test records ---');
    try {
      if (createdOrderIds.length > 0) {
        await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (createdProductIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
      await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: [user1.id, user2.id, adminUser.id] } } } });
      await prisma.cart.deleteMany({ where: { userId: { in: [user1.id, user2.id, adminUser.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id, adminUser.id] } } });
      console.log('Cleanup completed.');
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }
  }

  console.log('\n====================================================');
  console.log(`PHASE 1I-R1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1IOrderTests().catch((err) => {
  console.error('Unhandled error in Phase 1I order tests:', err);
  process.exit(1);
});
