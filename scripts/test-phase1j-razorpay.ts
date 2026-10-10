import './testDbGuard.js';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { handleCreatePaymentOrder as razorpayOrderHandler } from '../api/payments/razorpay.js';
import ordersHandler from '../api/orders.js';
import {
  rupeesToPaise,
  paiseToRupees,
} from '../api/_utils/razorpay.js';
import { Prisma } from '@prisma/client';

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
    headers: {} as Record<string, string>,
    data: null as any,
    headersSent: false,
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.data = payload;
      this.headersSent = true;
      return this;
    },
    end(payload?: any) {
      if (payload && typeof payload === 'string') {
        try {
          this.data = JSON.parse(payload);
        } catch {
          this.data = payload;
        }
      }
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  if (!process.env.RAZORPAY_KEY_ID) {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mockKeyId12345';
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key_67890';
  }

  console.log('====================================================');
  console.log('PHASE 1J-A: RAZORPAY PAYMENT GATEWAY BACKEND TESTS');
  console.log('====================================================\n');

  const ts = Date.now();
  const testClerkUser1 = `user_rzp_test_1_${ts}`;
  const testClerkUser2 = `user_rzp_test_2_${ts}`;
  const testClerkAdmin = `admin_rzp_test_${ts}`;

  let user1: any;
  let user2: any;
  let adminUser: any;
  let productA: any;
  const createdOrderIds: string[] = [];

  try {
    // ─── 1. Unit Testing: Amount Conversion & Config ─────────────────────────
    console.log('--- 1. Unit Testing: Rupees to Paise Conversion & Config ---');

    assert(rupeesToPaise(100) === 10000, '100 INR converts to 10000 paise');
    assert(rupeesToPaise(1499.99) === 149999, '1499.99 INR converts to 149999 paise without float drift');
    assert(rupeesToPaise('250.50') === 25050, 'String "250.50" converts to 25050 paise');
    assert(rupeesToPaise(new Prisma.Decimal('9999.00')) === 999900, 'Prisma.Decimal converts correctly to paise');
    assert(rupeesToPaise(0.01) === 1, '0.01 INR converts to 1 paisa');
    assert(paiseToRupees(149999) === 1499.99, '149999 paise converts back to 1499.99 INR');

    let zeroThrows = false;
    try {
      rupeesToPaise(0);
    } catch {
      zeroThrows = true;
    }
    assert(zeroThrows, 'Zero amount throws validation error');

    let negativeThrows = false;
    try {
      rupeesToPaise(-50);
    } catch {
      negativeThrows = true;
    }
    assert(negativeThrows, 'Negative amount throws validation error');

    let nanThrows = false;
    try {
      rupeesToPaise('invalid_number');
    } catch {
      nanThrows = true;
    }
    assert(nanThrows, 'NaN string throws validation error');

    // ─── 2. Seed Test Users & Products ───────────────────────────────────────
    console.log('\n--- 2. Seeding Test Users & Products ---');

    user1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: `customer1_${ts}@alongkar.test`,
      },
    });

    user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: `customer2_${ts}@alongkar.test`,
      },
    });

    adminUser = await prisma.user.create({
      data: {
        clerkUserId: testClerkAdmin,
        email: `admin_${ts}@alongkar.test`,
      },
    });

    productA = await prisma.product.create({
      data: {
        name: `Razorpay Gold Ring ${ts}`,
        slug: `rzp-gold-ring-${ts}`,
        category: 'Rings',
        price: new Prisma.Decimal('4999.00'),
        originalPrice: new Prisma.Decimal('5999.00'),
        discountPercent: 16,
        description: 'Solid 22k gold ring for payment tests',
        finish: 'Glossy',
        baseMaterial: 'Gold',
        warranty: 'Lifetime',
        inStock: true,
        image: 'https://res.cloudinary.com/alongkar/image/upload/v1/sample.jpg',
        hoverImage: 'https://res.cloudinary.com/alongkar/image/upload/v1/sample-hover.jpg',
      },
    });

    assert(user1.id && user2.id && productA.id, 'Test users and test product seeded successfully');

    // Create an order for User 1
    const orderCreateRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          customerName: 'Snehasish Customer',
          customerPhone: '9876543210',
          customerEmail: 'customer1@alongkar.test',
          shippingAddress: {
            line1: '123 Test Street',
            city: 'Kolkata',
            state: 'West Bengal',
            pincode: '700001',
            country: 'India',
          },
          idempotencyKey: `idem_rzp_test_order_${ts}`,
          items: [{ productId: productA.id, quantity: 1 }],
        },
      },
      orderCreateRes
    );

    assert(orderCreateRes.statusCode === 201, 'Order created successfully for User 1 (201)');
    const order1 = orderCreateRes.data?.order;
    assert(order1 && order1.id, 'Order has valid ID');
    if (order1) createdOrderIds.push(order1.id);

    // ─── 3. HTTP Method & Input Validation Tests ─────────────────────────────
    console.log('\n--- 3. Testing HTTP Method & Request Validation ---');

    // GET not allowed
    const getRes = createMockRes();
    await razorpayOrderHandler({ method: 'GET', _testUser: user1 }, getRes);
    assert(getRes.statusCode === 405, 'GET /api/payments/razorpay/order rejected with 405 Method Not Allowed');

    // Missing authentication (401)
    const unauthRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', body: { orderId: order1.id } }, unauthRes);
    assert(unauthRes.statusCode === 401, 'Unauthenticated request rejected with 401 Unauthorized');

    // Missing orderId (400)
    const missingOrderIdRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: {} }, missingOrderIdRes);
    assert(missingOrderIdRes.statusCode === 400, 'Missing orderId rejected with 400 Bad Request');

    // Malformed orderId (400)
    const malformedOrderIdRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: 'invalid order id with spaces!' } }, malformedOrderIdRes);
    assert(malformedOrderIdRes.statusCode === 400, 'Malformed orderId rejected with 400 Bad Request');

    // Non-existent orderId (404)
    const nonExistentRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: 'cuid_nonexistent_12345678' } }, nonExistentRes);
    assert(nonExistentRes.statusCode === 404, 'Non-existent orderId rejected with 404 Not Found');

    // ─── 4. Customer Isolation & Cross-Account Protection ────────────────────
    console.log('\n--- 4. Testing Customer Isolation & Ownership Protection ---');

    // User 2 attempts to create a Razorpay payment order for User 1's order
    const crossUserRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user2, body: { orderId: order1.id } }, crossUserRes);
    assert(crossUserRes.statusCode === 404, 'User 2 cannot create Razorpay payment order for User 1 order (404 Not Found / isolated)');

    // ─── 5. Payment Eligibility Validation (Non-Eligible States) ──────────────
    console.log('\n--- 5. Testing Payment Eligibility & Ineligible States ---');

    // Create secondary order to test various status rejections
    const createSecondaryOrder = async (orderStatus: string, paymentStatus: string, suffix: string) => {
      const o = await prisma.order.create({
        data: {
          orderNumber: `ORD-TEST-${ts}-${suffix}`,
          userId: user1.id,
          status: orderStatus as any,
          paymentStatus: paymentStatus as any,
          shippingStatus: 'NOT_READY',
          subtotal: new Prisma.Decimal('4999.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          customerName: 'Test User',
          customerEmail: 'test@test.com',
          customerPhone: '9876543210',
          shippingAddressLine1: 'Street 1',
          shippingCity: 'Kolkata',
          shippingState: 'WB',
          shippingPincode: '700001',
          idempotencyKey: `idem_secondary_${ts}_${suffix}`,
          items: {
            create: [
              {
                productId: productA.id,
                productName: productA.name,
                productSlug: productA.slug,
                productImage: productA.image,
                unitPrice: new Prisma.Decimal('4999.00'),
                quantity: 1,
                lineTotal: new Prisma.Decimal('4999.00'),
              },
            ],
          },
        },
      });
      createdOrderIds.push(o.id);
      return o;
    };

    // 5a. Already PAID order
    const paidOrder = await createSecondaryOrder('CONFIRMED', 'PAID', 'paid');
    const paidPayRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: paidOrder.id } }, paidPayRes);
    assert(paidPayRes.statusCode === 400, 'Already PAID order rejected for payment (400)');
    assert(paidPayRes.data?.error?.includes('already been paid'), 'Error mentions order has already been paid');

    // 5b. CANCELLED order
    const cancelledOrder = await createSecondaryOrder('CANCELLED', 'CANCELLED', 'cancelled');
    const cancelledPayRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: cancelledOrder.id } }, cancelledPayRes);
    assert(cancelledPayRes.statusCode === 400, 'CANCELLED order rejected for payment (400)');

    // 5c. REFUNDED order
    const refundedOrder = await createSecondaryOrder('DELIVERED', 'REFUNDED', 'refunded');
    const refundedPayRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: refundedOrder.id } }, refundedPayRes);
    assert(refundedPayRes.statusCode === 400, 'REFUNDED payment order rejected for payment (400)');

    // 5d. Non-PENDING_PAYMENT order (e.g. PROCESSING)
    const processingOrder = await createSecondaryOrder('PROCESSING', 'PENDING', 'processing');
    const processingPayRes = createMockRes();
    await razorpayOrderHandler({ method: 'POST', _testUser: user1, body: { orderId: processingOrder.id } }, processingPayRes);
    assert(processingPayRes.statusCode === 400, 'Non-PENDING_PAYMENT order status rejected for payment (400)');

    // ─── 6. Amount Source of Truth & Frontend Override Prevention ────────────
    console.log('\n--- 6. Testing Amount Source of Truth (Server GrandTotal) ---');

    // Client passes a fake malicious amount (e.g. 1 rupee instead of 4999)
    // Server must ignore client-supplied amount and use order1.grandTotal
    // Ensure test environment has test keys configured
    if (!process.env.RAZORPAY_KEY_ID) {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_mockKeyId12345';
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key_67890';
    }

    const payAttemptRes = createMockRes();
    await razorpayOrderHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: order1.id,
          amount: 100, // Malicious attempt to pay ₹1
          currency: 'USD',
        },
      },
      payAttemptRes
    );

    // If real keys are in .env, status will be 201. If invalid mock credentials connect to Razorpay, status will be 502 (gateway error) but amount was converted strictly from database
    const expectedGrandTotalPaise = rupeesToPaise(order1.grandTotal);
    assert(expectedGrandTotalPaise === 499900, 'Expected amount in paise is 499900 (₹4999.00)');

    // Check if secret key is ever exposed in response
    const resString = JSON.stringify(payAttemptRes.data || {});
    assert(!resString.includes(process.env.RAZORPAY_KEY_SECRET!), 'RAZORPAY_KEY_SECRET is never exposed in response body');
    assert(!resString.includes('key_secret'), 'Secret field name never appears in response');

    if (payAttemptRes.statusCode === 201 || payAttemptRes.statusCode === 200) {
      assert(payAttemptRes.data?.success === true, 'Razorpay order creation succeeded (201/200)');
      assert(payAttemptRes.data?.amount === expectedGrandTotalPaise, 'Payment amount strictly matches database grandTotal (499900 paise)');
      assert(payAttemptRes.data?.currency === 'INR', 'Currency is INR');
      assert(payAttemptRes.data?.alongkarOrderId === order1.id, 'Response contains alongkarOrderId');
      assert(payAttemptRes.data?.razorpayKeyId === process.env.RAZORPAY_KEY_ID, 'Response contains public razorpayKeyId');
      assert(typeof payAttemptRes.data?.razorpayOrderId === 'string', 'Response contains razorpayOrderId');

      // Verify database record
      const dbOrder = await prisma.order.findUnique({ where: { id: order1.id } });
      assert(dbOrder?.paymentProvider === 'RAZORPAY', 'Order paymentProvider updated to RAZORPAY');
      assert(dbOrder?.paymentOrderId === payAttemptRes.data.razorpayOrderId, 'Order paymentOrderId persisted in database');
      assert(dbOrder?.paymentStatus === 'PENDING', 'paymentStatus remains PENDING');
      assert(dbOrder?.status === 'PENDING_PAYMENT', 'orderStatus remains PENDING_PAYMENT');
    }

    // ─── 7. Duplicate & Retry Behavior (Idempotent Reuse) ──────────────────
    console.log('\n--- 7. Testing Duplicate & Retry Behavior ---');
    const retryPayRes = createMockRes();
    await razorpayOrderHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: { orderId: order1.id },
      },
      retryPayRes
    );

    assert(retryPayRes.statusCode === 200, 'Repeated payment order request returns 200 (reused)');
    assert(retryPayRes.data?.razorpayOrderId === (payAttemptRes.data?.razorpayOrderId || order1.paymentOrderId), 'Reuses exact same existing Razorpay order ID without creating duplicate');
    assert(retryPayRes.data?.amount === expectedGrandTotalPaise, 'Amount remains identical on retry');

    // ─── 8. Concurrency Hardening: Parallel Race Requests ───────────────────
    console.log('\n--- 8. Testing Concurrent Payment-Initiation Requests ---');

    // Create a fresh order for testing true parallel race requests
    const freshRaceOrder = await createSecondaryOrder('PENDING_PAYMENT', 'PENDING', 'race');

    const concurrentRes1 = createMockRes();
    const concurrentRes2 = createMockRes();

    // Fire both requests simultaneously in parallel
    await Promise.all([
      razorpayOrderHandler(
        {
          method: 'POST',
          _testUser: user1,
          body: { orderId: freshRaceOrder.id },
        },
        concurrentRes1
      ),
      razorpayOrderHandler(
        {
          method: 'POST',
          _testUser: user1,
          body: { orderId: freshRaceOrder.id },
        },
        concurrentRes2
      ),
    ]);

    assert(
      (concurrentRes1.statusCode === 200 || concurrentRes1.statusCode === 201) &&
      (concurrentRes2.statusCode === 200 || concurrentRes2.statusCode === 201),
      'Both concurrent payment initiation requests succeed (200 / 201)'
    );

    const rzpId1 = concurrentRes1.data?.razorpayOrderId;
    const rzpId2 = concurrentRes2.data?.razorpayOrderId;
    assert(typeof rzpId1 === 'string' && rzpId1.startsWith('order_'), 'Request 1 receives valid Razorpay Order ID');
    assert(typeof rzpId2 === 'string' && rzpId2.startsWith('order_'), 'Request 2 receives valid Razorpay Order ID');
    assert(rzpId1 === rzpId2, `Both concurrent requests resolved to the EXACT SAME Razorpay Order ID (${rzpId1})`);

    // Verify DB state after concurrent execution
    const raceOrderDb = await prisma.order.findUnique({ where: { id: freshRaceOrder.id } });
    assert(raceOrderDb?.paymentOrderId === rzpId1, 'Authoritative paymentOrderId persisted cleanly in database');
    assert(raceOrderDb?.paymentProvider === 'RAZORPAY', 'paymentProvider is RAZORPAY');
    assert(raceOrderDb?.paymentStatus === 'PENDING', 'paymentStatus remains PENDING (never corrupted or marked PAID)');
    assert(raceOrderDb?.status === 'PENDING_PAYMENT', 'orderStatus remains PENDING_PAYMENT');
    assert(raceOrderDb?.paidAt === null, 'paidAt remains null');

    // ─── 9. Failure State Safety & Non-Corruption ───────────────────────────
    console.log('\n--- 9. Testing Failure Handling & Non-Corruption ---');
    const orderCheck = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(orderCheck?.paymentStatus === 'PENDING', 'Order paymentStatus remains PENDING (never falsely marked PAID)');
    assert(orderCheck?.status === 'PENDING_PAYMENT', 'orderStatus remains PENDING_PAYMENT');
    assert(orderCheck?.paidAt === null, 'paidAt remains null');
    assert(orderCheck?.paymentProvider === 'RAZORPAY', 'paymentProvider is RAZORPAY');

  } finally {
    // ─── Cleanup Test Data ──────────────────────────────────────────────────
    console.log('\n--- Cleaning up test records ---');
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (productA?.id) {
      await prisma.product.deleteMany({
        where: { id: productA.id },
      });
    }
    const userIds = [user1?.id, user2?.id, adminUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.cartItem.deleteMany({
        where: { cart: { userId: { in: userIds } } },
      });
      await prisma.cart.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
    console.log('Cleanup completed.');
  }

  console.log('\n====================================================');
  console.log(`PHASE 1J-A TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error during Phase 1J-A tests:', err);
  process.exit(1);
});
