import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import ordersHandler from '../api/orders.js';
import paymentOrderHandler from '../api/payments/razorpay/order.js';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getShippingStatusBadgeInfo,
} from '../src/lib/order-status.js';

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

async function runOrdersPageIntegrationTests() {
  process.env.NODE_ENV = 'test';
  if (!process.env.RAZORPAY_KEY_ID) {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_alongkarMockKey123';
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key_alongkar_test';
  }

  console.log('===============================================================');
  console.log('PHASE 1J-B: MY ORDERS PAGE & CUSTOMER ORDER HISTORY INTEGRATION');
  console.log('===============================================================\n');

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

  // Fetch real products
  const products = await prisma.product.findMany({ take: 3 });
  if (products.length < 2) {
    console.error('❌ Need at least 2 products in the database to run tests.');
    process.exit(1);
  }

  const [prod1, prod2] = products;
  const ts = Date.now();
  const testClerkUser1 = `clerk_cust_orders_1_${ts}`;
  const testClerkUser2 = `clerk_cust_orders_2_${ts}`;

  let user1DbId = '';
  let user2DbId = '';
  let order1Id = '';
  let order2Id = '';
  let order1Number = '';
  let order2Number = '';

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // 1. Status Badge Helper Unit Tests
    // ───────────────────────────────────────────────────────────────────────────
    console.log('--- 1. Order Status Badge Helper Tests ---');

    const pendingOrderBadge = getOrderStatusBadgeInfo('PENDING_PAYMENT');
    assert(pendingOrderBadge.label === 'Pending Payment', 'PENDING_PAYMENT badge returns "Pending Payment"');
    assert(pendingOrderBadge.bgClass.includes('amber'), 'PENDING_PAYMENT badge uses amber theme');

    const confirmedOrderBadge = getOrderStatusBadgeInfo('CONFIRMED');
    assert(confirmedOrderBadge.label === 'Confirmed', 'CONFIRMED badge returns "Confirmed"');

    const pendingPaymentBadge = getPaymentStatusBadgeInfo('PENDING');
    assert(pendingPaymentBadge.label === 'Pending', 'PENDING payment badge returns "Pending"');

    const paidPaymentBadge = getPaymentStatusBadgeInfo('PAID');
    assert(paidPaymentBadge.label === 'Paid', 'PAID payment badge returns "Paid"');

    const notReadyShippingBadge = getShippingStatusBadgeInfo('NOT_READY');
    assert(notReadyShippingBadge.label === 'Not Ready', 'NOT_READY shipping badge returns "Not Ready"');

    const deliveredShippingBadge = getShippingStatusBadgeInfo('DELIVERED');
    assert(deliveredShippingBadge.label === 'Delivered', 'DELIVERED shipping badge returns "Delivered"');

    // ───────────────────────────────────────────────────────────────────────────
    // 2. Setup Test Users & DB Records
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Setting Up Test Customers in Database ---');

    const u1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: `cust1_${ts}@alongkar-test.com`,
      },
    });
    user1DbId = u1.id;

    const u2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: `cust2_${ts}@alongkar-test.com`,
      },
    });
    user2DbId = u2.id;

    assert(Boolean(user1DbId && user2DbId), 'Test users created successfully in PostgreSQL');

    // ───────────────────────────────────────────────────────────────────────────
    // 3. User 1: Empty State Verification (0 Orders)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. User 1: Empty Orders State ---');

    const emptyReq: any = {
      method: 'GET',
      headers: { authorization: `Bearer mock_token` },
      query: { page: '1', limit: '10' },
      _testUser: u1,
    };
    const emptyRes = createMockRes();
    await ordersHandler(emptyReq, emptyRes);

    assert(emptyRes.statusCode === 200, 'GET /api/orders returns 200 for user with 0 orders');
    assert(Array.isArray(emptyRes.data?.orders) && emptyRes.data.orders.length === 0, 'Orders array is empty []');
    assert(emptyRes.data?.pagination?.total === 0, 'Pagination total is 0');
    assert(emptyRes.data?.pagination?.page === 1, 'Pagination page is 1');

    // ───────────────────────────────────────────────────────────────────────────
    // 4. Create PENDING_PAYMENT Order for User 1
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Creating PENDING_PAYMENT Order for User 1 ---');

    // Create cart items for User 1
    const cart1 = await prisma.cart.create({
      data: { userId: user1DbId },
    });
    await prisma.cartItem.create({
      data: {
        cartId: cart1.id,
        productId: prod1.id,
        quantity: 1,
      },
    });
    await prisma.cartItem.create({
      data: {
        cartId: cart1.id,
        productId: prod2.id,
        quantity: 2,
      },
    });

    const createReq1: any = {
      method: 'POST',
      headers: { authorization: `Bearer mock_token` },
      body: {
        customerName: 'Shreya Roy',
        customerPhone: '9876543210',
        customerEmail: 'shreya@alongkar-test.com',
        shippingAddress: {
          line1: '12 Alipore Road',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700027',
          country: 'India',
        },
        idempotencyKey: `idem_u1_ord1_${ts}`,
      },
      _testUser: u1,
    };
    const createRes1 = createMockRes();
    await ordersHandler(createReq1, createRes1);

    assert(createRes1.statusCode === 201, 'Order 1 created with status 201');
    const createdOrd1 = createRes1.data?.order;
    order1Id = createdOrd1?.id;
    order1Number = createdOrd1?.orderNumber;

    assert(Boolean(order1Id && order1Number), 'Valid order ID and order number generated');
    assert(createdOrd1.status === 'PENDING_PAYMENT', 'Order status is PENDING_PAYMENT');
    assert(createdOrd1.paymentStatus === 'PENDING', 'Payment status is PENDING');
    assert(createdOrd1.shippingStatus === 'NOT_READY', 'Shipping status is NOT_READY');
    assert(createdOrd1.items.length === 2, 'Order contains exactly 2 ordered items');

    // ───────────────────────────────────────────────────────────────────────────
    // 5. Create Second Order for User 1 (Order History Ordering)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Creating Second Order for User 1 ---');

    const cart1b = await prisma.cart.findUnique({ where: { userId: user1DbId } });
    await prisma.cartItem.create({
      data: {
        cartId: cart1b!.id,
        productId: prod1.id,
        quantity: 1,
      },
    });

    const createReq2: any = {
      method: 'POST',
      headers: { authorization: `Bearer mock_token` },
      body: {
        customerName: 'Shreya Roy',
        customerPhone: '9876543210',
        customerEmail: 'shreya@alongkar-test.com',
        shippingAddress: {
          line1: '12 Alipore Road',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700027',
          country: 'India',
        },
        idempotencyKey: `idem_u1_ord2_${ts}`,
      },
      _testUser: u1,
    };
    const createRes2 = createMockRes();
    await ordersHandler(createReq2, createRes2);

    assert(createRes2.statusCode === 201, 'Order 2 created with status 201');
    const createdOrd2 = createRes2.data?.order;
    order2Id = createdOrd2?.id;
    order2Number = createdOrd2?.orderNumber;

    // ───────────────────────────────────────────────────────────────────────────
    // 6. User 1: Fetch Order History via GET /api/orders
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Fetching User 1 Order History (Descending Order) ---');

    const listReq: any = {
      method: 'GET',
      headers: { authorization: `Bearer mock_token` },
      query: { page: '1', limit: '10' },
      _testUser: u1,
    };
    const listRes = createMockRes();
    await ordersHandler(listReq, listRes);

    assert(listRes.statusCode === 200, 'GET /api/orders returns 200');
    assert(listRes.data?.orders?.length === 2, 'Returns both orders for User 1');
    assert(listRes.data?.pagination?.total === 2, 'Pagination total is 2');
    assert(listRes.data?.orders[0]?.id === order2Id, 'Most recent order (Order 2) appears first');
    assert(listRes.data?.orders[1]?.id === order1Id, 'Previous order (Order 1) appears second');

    // Verify order 1 details
    const listedOrd1 = listRes.data?.orders[1];
    assert(listedOrd1.orderNumber === order1Number, 'Order 1 number matches');
    assert(typeof listedOrd1.grandTotal === 'number' && listedOrd1.grandTotal > 0, 'Grand total is a valid number');
    assert(listedOrd1.customerName === 'Shreya Roy', 'Customer name snapshot is preserved');
    assert(listedOrd1.shippingAddress?.city === 'Kolkata', 'Shipping address snapshot is preserved');
    assert(listedOrd1.items?.length === 2, 'Item array is included');

    // ───────────────────────────────────────────────────────────────────────────
    // 7. Security: User Isolation (User 2 Cannot See User 1 Orders)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Security & User Isolation ---');

    const u2ListReq: any = {
      method: 'GET',
      headers: { authorization: `Bearer mock_token` },
      query: { page: '1', limit: '10' },
      _testUser: u2,
    };
    const u2ListRes = createMockRes();
    await ordersHandler(u2ListReq, u2ListRes);

    assert(u2ListRes.statusCode === 200, 'GET /api/orders for User 2 returns 200');
    assert(u2ListRes.data?.orders?.length === 0, 'User 2 sees 0 orders (User 1 orders are completely hidden)');
    assert(u2ListRes.data?.pagination?.total === 0, 'User 2 total is 0');

    // Attempt direct lookup of User 1's order by User 2
    const u2SingleReq: any = {
      method: 'GET',
      headers: { authorization: `Bearer mock_token` },
      query: { orderNumber: order1Number },
      _testUser: u2,
    };
    const u2SingleRes = createMockRes();
    await ordersHandler(u2SingleReq, u2SingleRes);

    assert(u2SingleRes.statusCode === 404, 'User 2 accessing User 1 order by orderNumber returns 404 Not Found');

    // ───────────────────────────────────────────────────────────────────────────
    // 8. Payment Retry Flow for Pending Order
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- 8. Payment Initiation / Retry for Pending Order ---');

    const payReq: any = {
      method: 'POST',
      headers: { authorization: `Bearer mock_token` },
      body: { orderId: order1Id },
      _testUser: u1,
    };
    const payRes = createMockRes();
    await paymentOrderHandler(payReq, payRes);

    assert(
      payRes.statusCode === 201 || payRes.statusCode === 200,
      'Payment initiation for pending order returns 201 or 200'
    );
    assert(payRes.data?.success === true, 'Payment order success flag is true');
    assert(Boolean(payRes.data?.razorpayOrderId), 'Razorpay Order ID returned');
    assert(payRes.data?.alongkarOrderId === order1Id, 'Alongkar Order ID preserved');

    // Test retry reuses the existing payment order returning 200
    const retryPayReq: any = {
      method: 'POST',
      headers: { authorization: `Bearer mock_token` },
      body: { orderId: order1Id },
      _testUser: u1,
    };
    const retryPayRes = createMockRes();
    await paymentOrderHandler(retryPayReq, retryPayRes);

    assert(retryPayRes.statusCode === 200, 'Payment retry returns 200 OK');
    assert(
      retryPayRes.data?.razorpayOrderId === payRes.data?.razorpayOrderId,
      'Payment retry reuses the existing Razorpay Order ID'
    );

    // Verify order in database still has status PENDING_PAYMENT
    const dbOrderAfterPay = await prisma.order.findUnique({ where: { id: order1Id } });
    assert(dbOrderAfterPay?.status === 'PENDING_PAYMENT', 'Order status remains PENDING_PAYMENT (Phase 1J-C verification will confirm)');
    assert(dbOrderAfterPay?.paymentStatus === 'PENDING', 'Payment status remains PENDING');
    assert(dbOrderAfterPay?.paymentOrderId === payRes.data?.razorpayOrderId, 'paymentOrderId recorded in PostgreSQL');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    // Teardown
    console.log('\n--- Teardown: Cleaning Test Data ---');
    try {
      if (order1Id || order2Id) {
        await prisma.orderItem.deleteMany({
          where: { orderId: { in: [order1Id, order2Id].filter(Boolean) } },
        });
        await prisma.order.deleteMany({
          where: { id: { in: [order1Id, order2Id].filter(Boolean) } },
        });
      }
      if (user1DbId) {
        await prisma.cartItem.deleteMany({
          where: { cart: { userId: user1DbId } },
        });
        await prisma.cart.deleteMany({
          where: { userId: user1DbId },
        });
        await prisma.user.delete({
          where: { id: user1DbId },
        });
      }
      if (user2DbId) {
        await prisma.cartItem.deleteMany({
          where: { cart: { userId: user2DbId } },
        });
        await prisma.cart.deleteMany({
          where: { userId: user2DbId },
        });
        await prisma.user.delete({
          where: { id: user2DbId },
        });
      }
      console.log('Teardown complete.');
    } catch (cleanupErr: any) {
      console.error('Cleanup error:', cleanupErr);
    }
  }

  console.log('\n===============================================================');
  console.log(`MY ORDERS INTEGRATION TEST SUMMARY: ${passed}/${passed + failed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrdersPageIntegrationTests();
