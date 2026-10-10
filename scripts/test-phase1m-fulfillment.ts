import './testDbGuard.js';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import adminOrdersHandler from '../api/admin/orders.js';
import ordersHandler from '../api/orders.js';
import {
  checkOrderFulfillmentEligibility,
  getOrderFulfillmentEligibility,
  buildNormalizedFulfillmentPayload,
} from '../api/_utils/fulfillment.js';

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

async function runPhase1MFulfillmentTests() {
  process.env.NODE_ENV = 'test';
  console.log('====================================================================');
  console.log('PHASE 1M: ORDER FULFILLMENT ARCHITECTURE TESTS');
  console.log('====================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, failureDetails?: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
      if (failureDetails) console.error(`         Details: ${failureDetails}`);
    }
  }

  // Set up test users & product in database
  const customerA = await prisma.user.upsert({
    where: { clerkUserId: 'user_fulfillment_customer_a' },
    update: {},
    create: {
      clerkUserId: 'user_fulfillment_customer_a',
      email: 'customer.a@example.com',
    },
  });

  const customerB = await prisma.user.upsert({
    where: { clerkUserId: 'user_fulfillment_customer_b' },
    update: {},
    create: {
      clerkUserId: 'user_fulfillment_customer_b',
      email: 'customer.b@example.com',
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: 'fulfillment-test-ring' },
    update: { price: 2999, originalPrice: 3999, inStock: true },
    create: {
      id: 'prod_fulfillment_ring_1',
      name: 'Royal Heritage Gold Ring',
      slug: 'fulfillment-test-ring',
      price: 2999,
      originalPrice: 3999,
      image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
      hoverImage: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
      category: 'Rings',
      description: 'Handcrafted gold plated ring',
      finish: 'Gold Plated',
      baseMaterial: 'Brass',
      warranty: '6 Months',
      inStock: true,
    },
  });

  // Clean up any existing test orders
  await prisma.orderItem.deleteMany({
    where: {
      order: {
        userId: { in: [customerA.id, customerB.id] },
      },
    },
  });
  await prisma.order.deleteMany({
    where: {
      userId: { in: [customerA.id, customerB.id] },
    },
  });

  console.log('--- 1. PURE ELIGIBILITY EVALUATOR TESTS ---');

  // Test 1: Razorpay PENDING_PAYMENT order -> NOT eligible
  const pendingRazorpayOrder: any = {
    id: 'test_ord_rzp_pending',
    orderNumber: 'ORD-TEST-RZP-PENDING',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    shippingStatus: 'NOT_READY',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res1 = checkOrderFulfillmentEligibility(pendingRazorpayOrder);
  assert(!res1.eligible, 'Razorpay PENDING_PAYMENT order is not fulfillment-eligible');
  assert(
    res1.reasons.includes('RAZORPAY_PAYMENT_PENDING') && res1.reasons.includes('RAZORPAY_PAYMENT_NOT_PAID'),
    'Razorpay PENDING_PAYMENT provides explicit ineligibility reasons'
  );

  // Test 2: Razorpay PAID + CONFIRMED order -> ELIGIBLE
  const paidRazorpayOrder: any = {
    id: 'test_ord_rzp_paid',
    orderNumber: 'ORD-TEST-RZP-PAID',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    shippingStatus: 'READY',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res2 = checkOrderFulfillmentEligibility(paidRazorpayOrder);
  assert(res2.eligible === true, 'Razorpay PAID + CONFIRMED order is fulfillment-eligible');
  assert(res2.readyForFulfillmentProvider === true, 'Razorpay PAID order is ready for provider layer');

  // Test 3: COD CONFIRMED order -> ELIGIBLE
  const codConfirmedOrder: any = {
    id: 'test_ord_cod_confirmed',
    orderNumber: 'ORD-TEST-COD-CONFIRMED',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    shippingStatus: 'NOT_READY',
    paymentProvider: 'COD',
    shippingAddressLine1: '456 MG Road',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700001',
    items: [{ id: 'item_2', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res3 = checkOrderFulfillmentEligibility(codConfirmedOrder);
  assert(res3.eligible === true, 'COD CONFIRMED order is fulfillment-eligible');

  // Test 4: Failed payment order -> NOT eligible
  const failedPaymentOrder: any = {
    id: 'test_ord_failed',
    orderNumber: 'ORD-TEST-FAILED',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'FAILED',
    shippingStatus: 'NOT_READY',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res4 = checkOrderFulfillmentEligibility(failedPaymentOrder);
  assert(!res4.eligible && res4.reasons.includes('PAYMENT_FAILED'), 'FAILED payment order is not eligible');

  // Test 5: Cancelled order -> NOT eligible
  const cancelledOrder: any = {
    id: 'test_ord_cancelled',
    orderNumber: 'ORD-TEST-CANCELLED',
    status: 'CANCELLED',
    paymentStatus: 'CANCELLED',
    shippingStatus: 'CANCELLED',
    paymentProvider: 'COD',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res5 = checkOrderFulfillmentEligibility(cancelledOrder);
  assert(!res5.eligible && res5.reasons.includes('ORDER_CANCELLED'), 'CANCELLED order is not eligible');

  // Test 6: Incomplete shipping address -> NOT eligible
  const missingAddressOrder: any = {
    id: 'test_ord_no_addr',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    shippingStatus: 'READY',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res6 = checkOrderFulfillmentEligibility(missingAddressOrder);
  assert(!res6.eligible && res6.reasons.includes('MISSING_SHIPPING_ADDRESS'), 'Order with missing address is not eligible');

  // Test 7: Empty items order -> NOT eligible
  const emptyItemsOrder: any = {
    id: 'test_ord_empty_items',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    shippingStatus: 'READY',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [],
  };
  const res7 = checkOrderFulfillmentEligibility(emptyItemsOrder);
  assert(!res7.eligible && res7.reasons.includes('EMPTY_ORDER_ITEMS'), 'Order with empty items is not eligible');

  // Test 8: Shipped / Delivered terminal status orders -> NOT eligible for initial fulfillment pipeline
  const alreadyShippedOrder: any = {
    id: 'test_ord_already_shipped',
    status: 'SHIPPED',
    paymentStatus: 'PAID',
    shippingStatus: 'SHIPPED',
    paymentProvider: 'RAZORPAY',
    shippingAddressLine1: '123 Park Street',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700016',
    items: [{ id: 'item_1', productId: product.id, quantity: 1, unitPrice: 2999 }],
  };
  const res8 = checkOrderFulfillmentEligibility(alreadyShippedOrder);
  assert(!res8.eligible && res8.reasons.includes('ALREADY_SHIPPED'), 'Already shipped order is not eligible to re-enter fulfillment');

  console.log('\n--- 2. SERVER SERVICE BOUNDARY & DATABASE PERSISTENCE TESTS ---');

  // Create real persisted orders in the database
  const dbOrderCustomerA = await prisma.order.create({
    data: {
      orderNumber: 'ORD-DB-TEST-CUST-A',
      userId: customerA.id,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      shippingStatus: 'READY',
      paymentProvider: 'RAZORPAY',
      subtotal: 2999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 89.97,
      grandTotal: 3088.97,
      customerName: 'Customer A',
      customerEmail: 'customer.a@example.com',
      customerPhone: '9876543210',
      shippingAddressLine1: 'Flat 4A, Green Valley',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700001',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            unitPrice: 2999,
            originalPrice: 3999,
            quantity: 1,
            lineTotal: 2999,
          },
        ],
      },
    },
    include: { items: true },
  });

  const dbPendingRzpOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-DB-TEST-RZP-PENDING',
      userId: customerA.id,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      shippingStatus: 'NOT_READY',
      paymentProvider: 'RAZORPAY',
      subtotal: 2999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 89.97,
      grandTotal: 3088.97,
      customerName: 'Customer A',
      customerEmail: 'customer.a@example.com',
      customerPhone: '9876543210',
      shippingAddressLine1: 'Flat 4A, Green Valley',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700001',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            unitPrice: 2999,
            originalPrice: 3999,
            quantity: 1,
            lineTotal: 2999,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Test 9: Unauthenticated request to getOrderFulfillmentEligibility -> rejected
  const unauthRes = await getOrderFulfillmentEligibility(dbOrderCustomerA.id, null);
  assert(!unauthRes.success && unauthRes.status === 401, 'Unauthenticated check is rejected with status 401');

  // Test 10: Unauthorized user (Customer B accessing Customer A\'s order) -> rejected
  const unauthorizedRes = await getOrderFulfillmentEligibility(dbOrderCustomerA.id, { id: customerB.id });
  assert(!unauthorizedRes.success && unauthorizedRes.status === 404, 'Unauthorized user cannot access another user order eligibility');

  // Test 11: Authorized owner (Customer A accessing their own order) -> Success & eligible
  const authOwnerRes = await getOrderFulfillmentEligibility(dbOrderCustomerA.id, { id: customerA.id });
  assert(authOwnerRes.success === true && authOwnerRes.eligible === true, 'Authorized owner receives eligible status');
  assert(
    authOwnerRes.fulfillmentPayload !== undefined && authOwnerRes.fulfillmentPayload.grandTotal === 3088.97,
    'Service builds correct normalized fulfillment payload'
  );

  // Test 12: Admin accessing Customer A\'s order -> Success
  const adminRes = await getOrderFulfillmentEligibility(dbOrderCustomerA.id, { isAdmin: true });
  assert(adminRes.success === true && adminRes.eligible === true, 'Admin can inspect fulfillment eligibility');

  // Test 13: Admin inspecting PENDING_PAYMENT order -> Success response but eligible = false
  const adminPendingRes = await getOrderFulfillmentEligibility(dbPendingRzpOrder.id, { isAdmin: true });
  assert(
    adminPendingRes.success === true && adminPendingRes.eligible === false,
    'Admin inspecting PENDING_PAYMENT order sees eligible=false'
  );

  // Test 14: Idempotency & Safety: Multiple calls do not mutate database state
  const stateBefore = await prisma.order.findUnique({ where: { id: dbOrderCustomerA.id } });
  await getOrderFulfillmentEligibility(dbOrderCustomerA.id, { id: customerA.id });
  await getOrderFulfillmentEligibility(dbOrderCustomerA.id, { isAdmin: true });
  const stateAfter = await prisma.order.findUnique({ where: { id: dbOrderCustomerA.id } });
  assert(
    stateBefore?.updatedAt.getTime() === stateAfter?.updatedAt.getTime() &&
      stateBefore?.status === stateAfter?.status &&
      stateBefore?.paymentStatus === stateAfter?.paymentStatus,
    'Fulfillment eligibility check is strictly idempotent and causes no DB mutations'
  );

  // Test 15: Non-existent order -> safe 404 response
  const notFoundRes = await getOrderFulfillmentEligibility('non_existent_ord_id_99999', { isAdmin: true });
  assert(!notFoundRes.success && notFoundRes.status === 404, 'Non-existent order returns safe not-found error');

  console.log('\n--- 3. ADMIN API POST INTEGRATION TESTS ---');

  // Test 16: Admin API POST action 'check_fulfillment_eligibility'
  const adminReq: any = {
    method: 'POST',
    _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_clerk_1' },
    body: {
      action: 'check_fulfillment_eligibility',
      orderId: dbOrderCustomerA.id,
    },
  };
  const adminMockRes = createMockRes();
  await adminOrdersHandler(adminReq, adminMockRes);
  assert(adminMockRes.statusCode === 200, 'Admin API POST check_fulfillment_eligibility responds with 200');
  assert(adminMockRes.data?.eligible === true, 'Admin API returns eligible=true for paid order');

  // Test 17: Admin API formatAdminOrder includes fulfillmentEligibility
  const getAdminOrderReq: any = {
    method: 'GET',
    _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_clerk_1' },
    query: { id: dbOrderCustomerA.id },
  };
  const getAdminMockRes = createMockRes();
  await adminOrdersHandler(getAdminOrderReq, getAdminMockRes);
  assert(
    getAdminMockRes.data?.order?.fulfillmentEligibility?.eligible === true,
    'Admin single order GET payload embeds server-authoritative fulfillmentEligibility'
  );

  // Clean up test records
  await prisma.orderItem.deleteMany({
    where: {
      order: {
        userId: { in: [customerA.id, customerB.id] },
      },
    },
  });
  await prisma.order.deleteMany({
    where: {
      userId: { in: [customerA.id, customerB.id] },
    },
  });

  console.log('\n====================================================================');
  console.log(`PHASE 1M TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase1MFulfillmentTests()
  .catch((err) => {
    console.error('Fatal error in Phase 1M tests:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
