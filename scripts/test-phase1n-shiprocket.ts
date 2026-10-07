import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import adminOrdersHandler from '../api/admin/orders.js';
import {
  getShiprocketToken,
  invalidateShiprocketTokenCache,
  mapOrderToShiprocketPayload,
  createShiprocketOrder,
  splitCustomerName,
  formatShiprocketOrderDate,
  SHIPROCKET_AUTH_ENDPOINT,
  SHIPROCKET_CREATE_ORDER_ENDPOINT,
} from '../api/_utils/shiprocket.js';

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

async function runPhase1NShiprocketTests() {
  process.env.NODE_ENV = 'test';
  console.log('====================================================================');
  console.log('PHASE 1N: SHIPROCKET INTEGRATION FOUNDATION TESTS');
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

  // Set up test credentials in env for testing
  process.env.SHIPROCKET_EMAIL = 'api-test@alongkar.com';
  process.env.SHIPROCKET_PASSWORD = 'MockShiprocketPassword123!';
  process.env.SHIPROCKET_PICKUP_LOCATION = 'Alongkar_Kolkata_Hub';

  // Set up DB entities
  const customerA = await prisma.user.upsert({
    where: { clerkUserId: 'user_sr_customer_a' },
    update: {},
    create: {
      clerkUserId: 'user_sr_customer_a',
      email: 'customer.a@example.com',
    },
  });

  const customerB = await prisma.user.upsert({
    where: { clerkUserId: 'user_sr_customer_b' },
    update: {},
    create: {
      clerkUserId: 'user_sr_customer_b',
      email: 'customer.b@example.com',
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: 'shiprocket-test-necklace' },
    update: { price: 4999, originalPrice: 6999, inStock: true },
    create: {
      id: 'prod_sr_necklace_1',
      name: 'Bridal Kundan Necklace Set',
      slug: 'shiprocket-test-necklace',
      price: 4999,
      originalPrice: 6999,
      image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
      hoverImage: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
      category: 'Necklaces',
      description: 'Handcrafted bridal Kundan necklace with earrings',
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

  console.log('--- 1. AUTHENTICATION & TOKEN MANAGEMENT TESTS ---');

  // Test 1: Missing credentials error
  invalidateShiprocketTokenCache();
  const savedEmail = process.env.SHIPROCKET_EMAIL;
  delete process.env.SHIPROCKET_EMAIL;
  try {
    await getShiprocketToken();
    assert(false, 'Missing credentials throws error');
  } catch (err: any) {
    assert(err.message.includes('missing SHIPROCKET_EMAIL'), 'Missing credentials safely throws configuration error');
  }
  process.env.SHIPROCKET_EMAIL = savedEmail;

  // Test 2: Successful authentication mock
  let authCallCount = 0;
  const mockAuthFetch: typeof fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr === SHIPROCKET_AUTH_ENDPOINT) {
      authCallCount++;
      return new Response(
        JSON.stringify({
          token: 'mock_shiprocket_jwt_token_xyz987',
          id: 10001,
          first_name: 'Alongkar',
          email: 'api-test@alongkar.com',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  invalidateShiprocketTokenCache();
  const token1 = await getShiprocketToken({ customFetch: mockAuthFetch });
  assert(token1 === 'mock_shiprocket_jwt_token_xyz987', 'Successful authentication returns access token');
  assert(authCallCount === 1, 'Authentication endpoint called once');

  // Test 3: Token reuse from cache
  const token2 = await getShiprocketToken({ customFetch: mockAuthFetch });
  assert(token2 === 'mock_shiprocket_jwt_token_xyz987', 'Cached token returned on subsequent call');
  assert(authCallCount === 1, 'Cached token did NOT trigger another auth network request');

  // Test 4: Force refresh triggers re-authentication
  const token3 = await getShiprocketToken({ forceRefresh: true, customFetch: mockAuthFetch });
  assert(token3 === 'mock_shiprocket_jwt_token_xyz987' && authCallCount === 2, 'Force refresh triggers re-authentication');

  console.log('\n--- 2. PAYLOAD MAPPING & HELPER TESTS ---');

  // Test 5: Customer name splitting
  const name1 = splitCustomerName('Siddhartha Mukherjee');
  assert(name1.firstName === 'Siddhartha' && name1.lastName === 'Mukherjee', 'Full name split correctly into first and last');
  const name2 = splitCustomerName('Snehasish');
  assert(name2.firstName === 'Snehasish' && name2.lastName === '', 'Single name handled gracefully');

  // Test 6: Date formatting
  const dateStr = formatShiprocketOrderDate('2026-10-07T12:30:00Z');
  assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dateStr), 'Order date matches YYYY-MM-DD HH:mm format');

  // Test 7: Normalized order payload mapping
  const sampleOrder: any = {
    id: 'ord_sr_sample_123',
    orderNumber: 'ORD-20261007-TEST1',
    createdAt: new Date('2026-10-07T14:15:00Z'),
    customerName: 'Ananya Sen',
    customerEmail: 'ananya@example.com',
    customerPhone: '9830012345',
    shippingAddressLine1: 'Flat 3B, Lake View Appt',
    shippingAddressLine2: 'Near South City',
    shippingCity: 'Kolkata',
    shippingState: 'West Bengal',
    shippingPincode: '700068',
    shippingCountry: 'India',
    paymentProvider: 'RAZORPAY',
    subtotal: 4999,
    discountTotal: 250,
    shippingFee: 0,
    grandTotal: 4749,
    customerNotes: 'Please deliver between 2-6 PM',
    items: [
      {
        id: 'item_1',
        productName: 'Bridal Kundan Necklace Set',
        productSku: 'AL-NECK-001',
        quantity: 1,
        unitPrice: 4999,
      },
    ],
  };
  const mapped = mapOrderToShiprocketPayload(sampleOrder);
  assert(mapped.order_id === 'ORD-20261007-TEST1', 'Mapped payload uses Alongkar orderNumber/ID as merchant order_id');
  assert(mapped.billing_customer_name === 'Ananya' && mapped.billing_last_name === 'Sen', 'Mapped customer name correctly');
  assert(mapped.payment_method === 'Prepaid', 'Razorpay order mapped as Prepaid');
  assert(mapped.sub_total === 4749, 'Authoritative persisted grandTotal used as sub_total');
  assert(mapped.order_items[0].sku === 'AL-NECK-001' && mapped.order_items[0].units === 1, 'Order item snapshot mapped cleanly');
  assert(mapped.length === 10 && mapped.breadth === 10 && mapped.weight === 0.5, 'Documented package dimensions applied');

  // Test 8: COD order payload mapping
  const codSampleOrder = { ...sampleOrder, paymentProvider: 'COD' };
  const codMapped = mapOrderToShiprocketPayload(codSampleOrder);
  assert(codMapped.payment_method === 'COD', 'COD order mapped as COD payment_method');

  console.log('\n--- 3. FULFILLMENT BOUNDARY & SHIPROCKET CREATION SERVICE TESTS ---');

  // Persist real test orders in PostgreSQL
  const dbPaidOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-SR-DB-PAID-01',
      userId: customerA.id,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      shippingStatus: 'READY',
      paymentProvider: 'RAZORPAY',
      subtotal: 4999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 149.97,
      grandTotal: 5148.97,
      customerName: 'Pooja Roy',
      customerEmail: 'pooja.roy@example.com',
      customerPhone: '9830099887',
      shippingAddressLine1: '12 Camac Street',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700017',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            productSku: 'SR-NECK-1',
            unitPrice: 4999,
            originalPrice: 6999,
            quantity: 1,
            lineTotal: 4999,
          },
        ],
      },
    },
    include: { items: true },
  });

  const dbPendingRzpOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-SR-DB-PENDING-02',
      userId: customerA.id,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      shippingStatus: 'NOT_READY',
      paymentProvider: 'RAZORPAY',
      subtotal: 4999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 149.97,
      grandTotal: 5148.97,
      customerName: 'Pooja Roy',
      customerEmail: 'pooja.roy@example.com',
      customerPhone: '9830099887',
      shippingAddressLine1: '12 Camac Street',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700017',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            productSku: 'SR-NECK-1',
            unitPrice: 4999,
            originalPrice: 6999,
            quantity: 1,
            lineTotal: 4999,
          },
        ],
      },
    },
    include: { items: true },
  });

  const dbCodConfirmedOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-SR-DB-COD-03',
      userId: customerA.id,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      shippingStatus: 'NOT_READY',
      paymentProvider: 'COD',
      subtotal: 4999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 149.97,
      grandTotal: 5148.97,
      customerName: 'Sourav Ganguly',
      customerEmail: 'sourav@example.com',
      customerPhone: '9830011223',
      shippingAddressLine1: '2/1 Biren Roy Road',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700008',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            productSku: 'SR-NECK-1',
            unitPrice: 4999,
            originalPrice: 6999,
            quantity: 1,
            lineTotal: 4999,
          },
        ],
      },
    },
    include: { items: true },
  });

  const dbCancelledOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-SR-DB-CANCELLED-04',
      userId: customerA.id,
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
      shippingStatus: 'CANCELLED',
      paymentProvider: 'COD',
      subtotal: 4999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 149.97,
      grandTotal: 5148.97,
      customerName: 'Sourav Ganguly',
      customerEmail: 'sourav@example.com',
      customerPhone: '9830011223',
      shippingAddressLine1: '2/1 Biren Roy Road',
      shippingCity: 'Kolkata',
      shippingState: 'West Bengal',
      shippingPincode: '700008',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            productSku: 'SR-NECK-1',
            unitPrice: 4999,
            originalPrice: 6999,
            quantity: 1,
            lineTotal: 4999,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Mock Shiprocket API handler
  let shiprocketCreateCallCount = 0;
  const mockShiprocketFetch: typeof fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr === SHIPROCKET_AUTH_ENDPOINT) {
      return new Response(
        JSON.stringify({ token: 'valid_mock_token_12345' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr === SHIPROCKET_CREATE_ORDER_ENDPOINT) {
      shiprocketCreateCallCount++;
      const body = JSON.parse(String(init?.body || '{}'));
      return new Response(
        JSON.stringify({
          order_id: 88776655,
          shipment_id: 99887766,
          status: 'NEW',
          status_code: 1,
          onboarding_completed_now: 0,
          awb_code: '',
          courier_company_id: null,
          courier_name: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  // Test 9: Non-admin authorization rejection
  const nonAdminRes = await createShiprocketOrder(dbPaidOrder.id, { isAdmin: false, id: customerA.id });
  assert(!nonAdminRes.success && nonAdminRes.status === 403, 'Non-admin request rejected with 403 Forbidden');

  // Test 10: PENDING_PAYMENT order -> Shiprocket NOT called (rejected at fulfillment boundary)
  const initialSrCallCount = shiprocketCreateCallCount;
  const pendingRes = await createShiprocketOrder(
    dbPendingRzpOrder.id,
    { isAdmin: true },
    { customFetch: mockShiprocketFetch }
  );
  assert(!pendingRes.success && pendingRes.status === 400, 'PENDING_PAYMENT order rejected with 400');
  assert(
    pendingRes.reasons?.includes('RAZORPAY_PAYMENT_PENDING') === true,
    'Rejection explicitly notes RAZORPAY_PAYMENT_PENDING'
  );
  assert(shiprocketCreateCallCount === initialSrCallCount, 'Shiprocket API was NOT called for PENDING_PAYMENT order');

  // Test 11: CANCELLED order -> Shiprocket NOT called
  const cancelledRes = await createShiprocketOrder(
    dbCancelledOrder.id,
    { isAdmin: true },
    { customFetch: mockShiprocketFetch }
  );
  assert(!cancelledRes.success && cancelledRes.reasons?.includes('ORDER_CANCELLED') === true, 'CANCELLED order rejected');
  assert(shiprocketCreateCallCount === initialSrCallCount, 'Shiprocket API was NOT called for CANCELLED order');

  // Test 12: Eligible Razorpay PAID order -> Successful Shiprocket Order Creation
  const paidSrRes = await createShiprocketOrder(
    dbPaidOrder.id,
    { isAdmin: true },
    { customFetch: mockShiprocketFetch }
  );
  assert(paidSrRes.success === true && paidSrRes.status === 201, 'Eligible paid order successfully creates Shiprocket order (201)');
  assert(paidSrRes.provider === 'SHIPROCKET', 'Provider is identified as SHIPROCKET');
  assert(paidSrRes.providerOrderId === '88776655', 'Provider Order ID captured correctly (88776655)');
  assert(paidSrRes.providerShipmentId === '99887766', 'Provider Shipment ID captured correctly (99887766)');

  // Verify database state after Shiprocket creation
  const updatedDbPaidOrder = await prisma.order.findUnique({ where: { id: dbPaidOrder.id } });
  assert(updatedDbPaidOrder?.shipmentProvider === 'SHIPROCKET', 'DB order shipmentProvider updated to SHIPROCKET');
  assert(updatedDbPaidOrder?.shipmentOrderId === '88776655', 'DB order shipmentOrderId updated to 88776655');
  assert(updatedDbPaidOrder?.shippingStatus === 'PROCESSING', 'DB order shippingStatus transitioned to PROCESSING');
  assert(updatedDbPaidOrder?.paymentStatus === 'PAID', 'DB order paymentStatus remains PAID');

  // Test 13: Idempotency: Duplicate creation request returns existing provider order ID without calling Shiprocket API again
  const countBeforeDup = shiprocketCreateCallCount;
  const duplicateRes = await createShiprocketOrder(
    dbPaidOrder.id,
    { isAdmin: true },
    { customFetch: mockShiprocketFetch }
  );
  assert(duplicateRes.success === true && duplicateRes.isExisting === true, 'Duplicate creation returns existing order without error');
  assert(duplicateRes.providerOrderId === '88776655', 'Duplicate returns identical providerOrderId');
  assert(shiprocketCreateCallCount === countBeforeDup, 'Shiprocket API was NOT called again for duplicate order');

  // Test 14: Eligible COD order -> Successful Shiprocket Order Creation
  const codSrRes = await createShiprocketOrder(
    dbCodConfirmedOrder.id,
    { isAdmin: true },
    { customFetch: mockShiprocketFetch }
  );
  assert(codSrRes.success === true && codSrRes.status === 201, 'Confirmed COD order successfully creates Shiprocket order');

  console.log('\n--- 4. SHIPROCKET PROVIDER ERROR HANDLING TESTS ---');

  // Test 15: Shiprocket 422 Unprocessable Entity error handling
  const mock422Fetch: typeof fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr === SHIPROCKET_AUTH_ENDPOINT) {
      return new Response(JSON.stringify({ token: 'valid_mock_token' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        message: 'Invalid pincode serviceability for destination address',
        status_code: 422,
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const dbFreshPaidOrder = await prisma.order.create({
    data: {
      orderNumber: 'ORD-SR-DB-FRESH-05',
      userId: customerA.id,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      shippingStatus: 'READY',
      paymentProvider: 'RAZORPAY',
      subtotal: 4999,
      discountTotal: 0,
      shippingFee: 0,
      taxTotal: 149.97,
      grandTotal: 5148.97,
      customerName: 'Tanmoy Bose',
      customerEmail: 'tanmoy@example.com',
      customerPhone: '9830055443',
      shippingAddressLine1: 'Remote Village Road',
      shippingCity: 'Siliguri',
      shippingState: 'West Bengal',
      shippingPincode: '734001',
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            productSlug: product.slug,
            productImage: product.image,
            unitPrice: 4999,
            quantity: 1,
            lineTotal: 4999,
          },
        ],
      },
    },
  });

  const res422 = await createShiprocketOrder(
    dbFreshPaidOrder.id,
    { isAdmin: true },
    { customFetch: mock422Fetch }
  );
  assert(!res422.success && res422.status === 422, 'Shiprocket 422 handled safely with 422 status');
  assert(res422.error === 'VALIDATION_ERROR', 'Mapped error code is VALIDATION_ERROR');

  // Verify that a failed Shiprocket call did not change order payment status or mark shipped
  const orderAfterFail = await prisma.order.findUnique({ where: { id: dbFreshPaidOrder.id } });
  assert(orderAfterFail?.paymentStatus === 'PAID', 'Payment status remains PAID after Shiprocket failure');
  assert(orderAfterFail?.shippingStatus === 'READY', 'Shipping status remains READY after Shiprocket failure');

  // Test 16: Shiprocket 429 Rate Limit error handling
  const mock429Fetch: typeof fetch = async (url) => {
    if (String(url) === SHIPROCKET_AUTH_ENDPOINT) {
      return new Response(JSON.stringify({ token: 'valid_mock_token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), { status: 429 });
  };
  const res429 = await createShiprocketOrder(
    dbFreshPaidOrder.id,
    { isAdmin: true },
    { customFetch: mock429Fetch }
  );
  assert(!res429.success && res429.status === 429 && res429.error === 'RATE_LIMITED', 'Shiprocket 429 handled as RATE_LIMITED');

  // Test 17: Shiprocket 500 Provider error handling
  const mock500Fetch: typeof fetch = async (url) => {
    if (String(url) === SHIPROCKET_AUTH_ENDPOINT) {
      return new Response(JSON.stringify({ token: 'valid_mock_token' }), { status: 200 });
    }
    return new Response('Internal Server Error', { status: 500 });
  };
  const res500 = await createShiprocketOrder(
    dbFreshPaidOrder.id,
    { isAdmin: true },
    { customFetch: mock500Fetch }
  );
  assert(!res500.success && res500.status === 502, 'Shiprocket 500 handled safely with 502 Bad Gateway');

  // Test 18: Shiprocket 401 with Automatic Token Recovery
  let mockTokenCalls = 0;
  let mockCreateAttempts = 0;
  const mock401RecoveryFetch: typeof fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr === SHIPROCKET_AUTH_ENDPOINT) {
      mockTokenCalls++;
      return new Response(JSON.stringify({ token: `token_v${mockTokenCalls}` }), { status: 200 });
    }
    if (urlStr === SHIPROCKET_CREATE_ORDER_ENDPOINT) {
      mockCreateAttempts++;
      const authHeader = (init?.headers as any)?.Authorization || '';
      if (authHeader === 'Bearer token_v1') {
        // Expired token simulation
        return new Response(JSON.stringify({ message: 'Unauthenticated' }), { status: 401 });
      }
      // Fresh token success
      return new Response(
        JSON.stringify({ order_id: 11223344, shipment_id: 55667788, status: 'NEW' }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  invalidateShiprocketTokenCache();
  const resRecovery = await createShiprocketOrder(
    dbFreshPaidOrder.id,
    { isAdmin: true },
    { customFetch: mock401RecoveryFetch }
  );
  assert(resRecovery.success === true && resRecovery.status === 201, 'Automatic 401 recovery succeeded');
  assert(mockCreateAttempts === 2, 'Create order retried once after refreshing token');

  console.log('\n--- 5. ADMIN API POST INTEGRATION TESTS ---');

  // Test 19: Admin API POST action 'create_shiprocket_order' on eligible order
  const adminPostReq: any = {
    method: 'POST',
    _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_clerk_shiprocket' },
    body: {
      action: 'create_shiprocket_order',
      orderId: dbFreshPaidOrder.id,
    },
  };
  const adminMockRes = createMockRes();
  await adminOrdersHandler(adminPostReq, adminMockRes);
  assert(adminMockRes.statusCode === 200, 'Admin API POST create_shiprocket_order returns 200 (existing)');
  assert(adminMockRes.data?.provider === 'SHIPROCKET', 'Admin API response indicates SHIPROCKET provider');

  // Test 20: Non-admin calling Admin API create_shiprocket_order -> Rejected
  const unauthPostReq: any = {
    method: 'POST',
    _testAdmin: { authorized: false, status: 403, error: 'Forbidden: Admin access required.' },
    body: {
      action: 'create_shiprocket_order',
      orderId: dbFreshPaidOrder.id,
    },
  };
  const unauthMockRes = createMockRes();
  await adminOrdersHandler(unauthPostReq, unauthMockRes);
  assert(unauthMockRes.statusCode === 403, 'Non-admin request rejected by Admin API route');

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
  console.log(`PHASE 1N TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('====================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase1NShiprocketTests()
  .catch((err) => {
    console.error('Fatal error in Phase 1N tests:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
