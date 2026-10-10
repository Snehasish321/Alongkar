import './testDbGuard.js';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import adminOrdersHandler from '../api/admin/orders.js';
import customerOrdersHandler from '../api/orders.js';

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

async function runAdminOrderTests() {
  process.env.NODE_ENV = 'test';

  console.log('===============================================================');
  console.log('ADMIN ORDERS MANAGEMENT TEST SUITE');
  console.log('===============================================================\n');

  const ts = Date.now();
  const adminClerkId = `user_admin_${ts}`;
  const customer1ClerkId = `user_cust1_${ts}`;
  const customer2ClerkId = `user_cust2_${ts}`;

  let adminUser: any;
  let customerUser1: any;
  let customerUser2: any;
  let testProductA: any;
  let testProductB: any;

  const createdOrderIds: string[] = [];

  const mockAdminAuth = {
    authorized: true,
    status: 200,
    clerkUserId: adminClerkId,
    email: `admin_${ts}@alongkar.test`,
  };

  const mockNonAdminAuth = {
    authorized: false,
    status: 403,
    error: 'Access denied. Administrator privileges required.',
    clerkUserId: customer1ClerkId,
  };

  const mockUnauth = {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Valid authenticated session required',
  };

  try {
    // ─── Setup Users & Products ──────────────────────────────────────────────
    adminUser = await prisma.user.create({
      data: {
        clerkUserId: adminClerkId,
        email: `admin_${ts}@alongkar.test`,
      },
    });

    customerUser1 = await prisma.user.create({
      data: {
        clerkUserId: customer1ClerkId,
        email: `ananya_${ts}@alongkar.test`,
      },
    });

    customerUser2 = await prisma.user.create({
      data: {
        clerkUserId: customer2ClerkId,
        email: `rohit_${ts}@alongkar.test`,
      },
    });

    testProductA = await prisma.product.create({
      data: {
        name: `Kundan Royal Necklace ${ts}`,
        slug: `kundan-royal-necklace-${ts}`,
        category: 'necklaces',
        price: 3499.0,
        originalPrice: 4499.0,
        discountPercent: 22,
        rating: 4.9,
        reviewCount: 12,
        image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        hoverImage: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        description: 'Authentic handcrafted Kundan necklace.',
        finish: '22K Gold Plated',
        baseMaterial: 'Brass',
        warranty: '1 Year Atelier Warranty',
        inStock: true,
        availableStock: 100,
      },
    });

    testProductB = await prisma.product.create({
      data: {
        name: `Meenakari Jhumka Earrings ${ts}`,
        slug: `meenakari-jhumka-earrings-${ts}`,
        category: 'earrings',
        price: 1299.0,
        originalPrice: 1799.0,
        discountPercent: 28,
        rating: 4.8,
        reviewCount: 9,
        image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908',
        hoverImage: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908',
        description: 'Traditional handcrafted Meenakari Jhumkas.',
        finish: 'Antique Gold',
        baseMaterial: 'Copper',
        warranty: '1 Year Atelier Warranty',
        inStock: true,
        availableStock: 100,
      },
    });

    // Seed 4 distinct orders across both customers with different statuses and payment methods
    // Order 1: Customer 1, Razorpay, PAID, CONFIRMED
    const order1 = await prisma.order.create({
      data: {
        orderNumber: `ORD-ADMIN-1-${ts}`,
        userId: customerUser1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 3499.0,
        discountTotal: 175.0, // 5% prepaid incentive
        shippingFee: 0.0,
        taxTotal: 0.0,
        grandTotal: 3324.0,
        currency: 'INR',
        customerName: 'Ananya Roy',
        customerEmail: `ananya_${ts}@alongkar.test`,
        customerPhone: '9876543210',
        shippingAddressLine1: '12 Park Street',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700016',
        shippingCountry: 'India',
        paymentProvider: 'RAZORPAY',
        paymentOrderId: `order_rzp_1_${ts}`,
        paymentTransactionId: `pay_rzp_1_${ts}`,
        paidAt: new Date(),
        adminNotes: 'Applied Prepaid Incentive (PREPAID5): ₹175',
        items: {
          create: [
            {
              productId: testProductA.id,
              productName: testProductA.name,
              productSlug: testProductA.slug,
              productImage: testProductA.image,
              productSku: 'AL-NECK-001',
              unitPrice: 3499.0,
              originalPrice: 4499.0,
              discountPercent: 22,
              quantity: 1,
              lineTotal: 3499.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order1.id);

    // Order 2: Customer 1, COD, PENDING, CONFIRMED
    const order2 = await prisma.order.create({
      data: {
        orderNumber: `ORD-ADMIN-2-${ts}`,
        userId: customerUser1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        shippingStatus: 'READY',
        subtotal: 1299.0,
        discountTotal: 0.0,
        shippingFee: 0.0,
        taxTotal: 0.0,
        grandTotal: 1299.0,
        currency: 'INR',
        customerName: 'Ananya Roy',
        customerEmail: `ananya_${ts}@alongkar.test`,
        customerPhone: '9876543210',
        shippingAddressLine1: '12 Park Street',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700016',
        shippingCountry: 'India',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProductB.id,
              productName: testProductB.name,
              productSlug: testProductB.slug,
              productImage: testProductB.image,
              productSku: 'AL-JHUM-002',
              unitPrice: 1299.0,
              originalPrice: 1799.0,
              discountPercent: 28,
              quantity: 1,
              lineTotal: 1299.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order2.id);

    // Order 3: Customer 2, Razorpay, PENDING, PENDING_PAYMENT
    const order3 = await prisma.order.create({
      data: {
        orderNumber: `ORD-ADMIN-3-${ts}`,
        userId: customerUser2.id,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        shippingStatus: 'NOT_READY',
        subtotal: 4798.0,
        discountTotal: 240.0,
        shippingFee: 0.0,
        taxTotal: 0.0,
        grandTotal: 4558.0,
        currency: 'INR',
        customerName: 'Rohit Sen',
        customerEmail: `rohit_${ts}@alongkar.test`,
        customerPhone: '9876543211',
        shippingAddressLine1: '45 Ballygunge Circular Rd',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700019',
        shippingCountry: 'India',
        paymentProvider: 'RAZORPAY',
        paymentOrderId: `order_rzp_3_${ts}`,
        items: {
          create: [
            {
              productId: testProductA.id,
              productName: testProductA.name,
              productSlug: testProductA.slug,
              productImage: testProductA.image,
              productSku: 'AL-NECK-001',
              unitPrice: 3499.0,
              originalPrice: 4499.0,
              discountPercent: 22,
              quantity: 1,
              lineTotal: 3499.0,
            },
            {
              productId: testProductB.id,
              productName: testProductB.name,
              productSlug: testProductB.slug,
              productImage: testProductB.image,
              productSku: 'AL-JHUM-002',
              unitPrice: 1299.0,
              originalPrice: 1799.0,
              discountPercent: 28,
              quantity: 1,
              lineTotal: 1299.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order3.id);

    // Order 4: Customer 2, Razorpay, PAID, DELIVERED
    const order4 = await prisma.order.create({
      data: {
        orderNumber: `ORD-ADMIN-4-${ts}`,
        userId: customerUser2.id,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        shippingStatus: 'DELIVERED',
        subtotal: 3499.0,
        discountTotal: 175.0,
        shippingFee: 0.0,
        taxTotal: 0.0,
        grandTotal: 3324.0,
        currency: 'INR',
        customerName: 'Rohit Sen',
        customerEmail: `rohit_${ts}@alongkar.test`,
        customerPhone: '9876543211',
        shippingAddressLine1: '45 Ballygunge Circular Rd',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700019',
        shippingCountry: 'India',
        paymentProvider: 'RAZORPAY',
        paymentOrderId: `order_rzp_4_${ts}`,
        paymentTransactionId: `pay_rzp_4_${ts}`,
        paidAt: new Date(Date.now() - 86400000),
        shipmentProvider: 'Shiprocket',
        shipmentTrackingNumber: 'SR123456789IN',
        shipmentAwbCode: 'AWB987654321',
        shippedAt: new Date(Date.now() - 43200000),
        deliveredAt: new Date(),
        items: {
          create: [
            {
              productId: testProductA.id,
              productName: testProductA.name,
              productSlug: testProductA.slug,
              productImage: testProductA.image,
              productSku: 'AL-NECK-001',
              unitPrice: 3499.0,
              originalPrice: 4499.0,
              discountPercent: 22,
              quantity: 1,
              lineTotal: 3499.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order4.id);

    // ─── 1. Security & Admin Authorization ────────────────────────────────────
    console.log('--- 1. Security & Admin Authorization ---');

    // 1.1 Unauthenticated Request
    const unauthReq: any = {
      method: 'GET',
      url: '/api/admin/orders',
      _testAdmin: mockUnauth,
    };
    const unauthRes = createMockRes();
    await adminOrdersHandler(unauthReq, unauthRes);
    assert(unauthRes.statusCode === 401, 'Unauthenticated user is rejected with 401 Unauthorized');

    // 1.2 Non-Admin Authenticated Customer Request
    const nonAdminReq: any = {
      method: 'GET',
      url: '/api/admin/orders',
      _testAdmin: mockNonAdminAuth,
    };
    const nonAdminRes = createMockRes();
    await adminOrdersHandler(nonAdminReq, nonAdminRes);
    assert(nonAdminRes.statusCode === 403, 'Authenticated non-admin customer is rejected with 403 Forbidden');

    // 1.3 Authorized Admin Request
    const adminReq: any = {
      method: 'GET',
      url: '/api/admin/orders',
      _testAdmin: mockAdminAuth,
    };
    const adminRes = createMockRes();
    await adminOrdersHandler(adminReq, adminRes);
    assert(adminRes.statusCode === 200, 'Authenticated admin successfully receives 200 OK');
    assert(Array.isArray(adminRes.data?.orders), 'Admin receives list of orders');
    assert(adminRes.data?.orders?.length >= 4, 'Admin receives orders across multiple customers');

    // ─── 2. Pagination & Default Sorting ──────────────────────────────────────
    console.log('\n--- 2. Pagination & Default Sorting ---');

    const pagedReq: any = {
      method: 'GET',
      url: '/api/admin/orders?page=1&limit=2',
      query: { page: '1', limit: '2' },
      _testAdmin: mockAdminAuth,
    };
    const pagedRes = createMockRes();
    await adminOrdersHandler(pagedReq, pagedRes);

    assert(pagedRes.statusCode === 200, 'Paginated request returns 200 OK');
    assert(pagedRes.data?.orders?.length === 2, 'Limit 2 returns exactly 2 orders');
    assert(pagedRes.data?.pagination?.page === 1, 'Pagination metadata page is 1');
    assert(pagedRes.data?.pagination?.limit === 2, 'Pagination metadata limit is 2');
    assert(pagedRes.data?.pagination?.total >= 4, 'Pagination total reflects total count');
    assert(pagedRes.data?.pagination?.totalPages >= 2, 'Pagination totalPages is calculated');

    // Check default sorting: newest first (order4 created last, order1 created first)
    const firstOrderNumber = pagedRes.data?.orders?.[0]?.orderNumber;
    assert(
      firstOrderNumber === `ORD-ADMIN-4-${ts}`,
      'Default sorting places newest created order first'
    );

    // ─── 3. Search Functionality ──────────────────────────────────────────────
    console.log('\n--- 3. Search Functionality ---');

    // 3.1 Search by Order Number
    const searchOrderReq: any = {
      method: 'GET',
      url: `/api/admin/orders?search=ORD-ADMIN-1-${ts}`,
      query: { search: `ORD-ADMIN-1-${ts}` },
      _testAdmin: mockAdminAuth,
    };
    const searchOrderRes = createMockRes();
    await adminOrdersHandler(searchOrderReq, searchOrderRes);

    assert(searchOrderRes.statusCode === 200, 'Search by Order Number responds 200 OK');
    assert(searchOrderRes.data?.orders?.length === 1, 'Search by exact order number returns 1 result');
    assert(
      searchOrderRes.data?.orders?.[0]?.orderNumber === `ORD-ADMIN-1-${ts}`,
      'Matching order number returned'
    );

    // 3.2 Search by Customer Email
    const searchEmailReq: any = {
      method: 'GET',
      url: `/api/admin/orders?search=ananya_${ts}`,
      query: { search: `ananya_${ts}` },
      _testAdmin: mockAdminAuth,
    };
    const searchEmailRes = createMockRes();
    await adminOrdersHandler(searchEmailReq, searchEmailRes);

    assert(searchEmailRes.statusCode === 200, 'Search by customer email responds 200 OK');
    assert(searchEmailRes.data?.orders?.length === 2, 'Search returns all orders for Customer 1 (2 orders)');

    // 3.3 Search No Results
    const searchEmptyReq: any = {
      method: 'GET',
      url: '/api/admin/orders?search=NON_EXISTENT_QUERY_99999',
      query: { search: 'NON_EXISTENT_QUERY_99999' },
      _testAdmin: mockAdminAuth,
    };
    const searchEmptyRes = createMockRes();
    await adminOrdersHandler(searchEmptyReq, searchEmptyRes);

    assert(searchEmptyRes.statusCode === 200, 'Empty search returns 200 OK');
    assert(searchEmptyRes.data?.orders?.length === 0, 'No matching orders returns empty array []');
    assert(searchEmptyRes.data?.pagination?.total === 0, 'Empty search total is 0');

    // ─── 4. Server-Side Filtering ─────────────────────────────────────────────
    console.log('\n--- 4. Server-Side Filtering ---');

    // 4.1 Filter by Order Status: CONFIRMED
    const filterStatusReq: any = {
      method: 'GET',
      url: `/api/admin/orders?status=CONFIRMED&search=${ts}`,
      query: { status: 'CONFIRMED', search: String(ts) },
      _testAdmin: mockAdminAuth,
    };
    const filterStatusRes = createMockRes();
    await adminOrdersHandler(filterStatusReq, filterStatusRes);

    assert(filterStatusRes.statusCode === 200, 'Filter by status CONFIRMED responds 200 OK');
    assert(
      filterStatusRes.data?.orders?.every((o: any) => o.status === 'CONFIRMED'),
      'All returned orders strictly have status CONFIRMED'
    );
    assert(filterStatusRes.data?.orders?.length === 2, 'Exactly 2 test orders have status CONFIRMED');

    // 4.2 Filter by Payment Status: PAID
    const filterPaymentReq: any = {
      method: 'GET',
      url: `/api/admin/orders?paymentStatus=PAID&search=${ts}`,
      query: { paymentStatus: 'PAID', search: String(ts) },
      _testAdmin: mockAdminAuth,
    };
    const filterPaymentRes = createMockRes();
    await adminOrdersHandler(filterPaymentReq, filterPaymentRes);

    assert(filterPaymentRes.statusCode === 200, 'Filter by paymentStatus PAID responds 200 OK');
    assert(
      filterPaymentRes.data?.orders?.every((o: any) => o.paymentStatus === 'PAID'),
      'All returned orders strictly have paymentStatus PAID'
    );
    assert(filterPaymentRes.data?.orders?.length === 2, 'Exactly 2 test orders have paymentStatus PAID');

    // 4.3 Filter by Payment Method: COD
    const filterMethodReq: any = {
      method: 'GET',
      url: `/api/admin/orders?paymentMethod=COD&search=${ts}`,
      query: { paymentMethod: 'COD', search: String(ts) },
      _testAdmin: mockAdminAuth,
    };
    const filterMethodRes = createMockRes();
    await adminOrdersHandler(filterMethodReq, filterMethodRes);

    assert(filterMethodRes.statusCode === 200, 'Filter by paymentMethod COD responds 200 OK');
    assert(
      filterMethodRes.data?.orders?.every((o: any) => o.paymentProvider === 'COD'),
      'All returned orders strictly have paymentProvider COD'
    );
    assert(filterMethodRes.data?.orders?.length === 1, 'Exactly 1 test order has paymentProvider COD');

    // 4.4 Combined Filter: status=DELIVERED and paymentMethod=RAZORPAY
    const combinedFilterReq: any = {
      method: 'GET',
      url: `/api/admin/orders?status=DELIVERED&paymentMethod=RAZORPAY&search=${ts}`,
      query: { status: 'DELIVERED', paymentMethod: 'RAZORPAY', search: String(ts) },
      _testAdmin: mockAdminAuth,
    };
    const combinedFilterRes = createMockRes();
    await adminOrdersHandler(combinedFilterReq, combinedFilterRes);

    assert(combinedFilterRes.statusCode === 200, 'Combined filter responds 200 OK');
    assert(
      combinedFilterRes.data?.orders?.length === 1 &&
        combinedFilterRes.data?.orders?.[0]?.orderNumber === `ORD-ADMIN-4-${ts}`,
      'Combined filter matches exactly the target delivered Razorpay order'
    );

    // ─── 5. Summary KPI Stats Aggregation ─────────────────────────────────────
    console.log('\n--- 5. Summary KPI Stats Aggregation ---');

    assert(typeof adminRes.data?.stats === 'object', 'Admin response contains live stats object');
    assert(typeof adminRes.data?.stats?.total === 'number', 'Stats contains total count');
    assert(typeof adminRes.data?.stats?.pendingPayment === 'number', 'Stats contains pendingPayment count');
    assert(typeof adminRes.data?.stats?.confirmed === 'number', 'Stats contains confirmed count');
    assert(typeof adminRes.data?.stats?.delivered === 'number', 'Stats contains delivered count');

    // ─── 6. Immutable Historical Snapshot Verification ────────────────────────
    console.log('\n--- 6. Immutable Historical Snapshot Verification ---');

    // Mutate the product price in the catalog to ensure historical orders do not change
    await prisma.product.update({
      where: { id: testProductA.id },
      data: {
        price: 9999.0, // Changed from 3499.0
        name: 'MODIFIED PRODUCT NAME IN CATALOG',
      },
    });

    const snapshotLookupReq: any = {
      method: 'GET',
      url: `/api/admin/orders?orderNumber=ORD-ADMIN-1-${ts}`,
      query: { orderNumber: `ORD-ADMIN-1-${ts}` },
      _testAdmin: mockAdminAuth,
    };
    const snapshotLookupRes = createMockRes();
    await adminOrdersHandler(snapshotLookupReq, snapshotLookupRes);

    assert(snapshotLookupRes.statusCode === 200, 'Order snapshot lookup returns 200 OK');
    const fetchedOrder = snapshotLookupRes.data?.order;
    assert(fetchedOrder !== null && fetchedOrder !== undefined, 'Order record returned');
    assert(fetchedOrder.grandTotal === 3324.0, 'Historical grandTotal remains 3324 (unaffected by catalog price change)');
    assert(fetchedOrder.subtotal === 3499.0, 'Historical subtotal remains 3499 (unaffected by catalog price change)');
    assert(
      fetchedOrder.items?.[0]?.productName === `Kundan Royal Necklace ${ts}`,
      'Historical item product name preserved from snapshot (not overwritten by current catalog name)'
    );
    assert(
      fetchedOrder.items?.[0]?.unitPrice === 3499.0,
      'Historical item unitPrice preserved at 3499 (not updated to current 9999 catalog price)'
    );

    // ─── 7. Order Detail Inspection & Fulfillment Data ────────────────────────
    console.log('\n--- 7. Order Detail Inspection & Fulfillment Data ---');

    const detailReq: any = {
      method: 'GET',
      url: `/api/admin/orders?orderNumber=ORD-ADMIN-4-${ts}`,
      query: { orderNumber: `ORD-ADMIN-4-${ts}` },
      _testAdmin: mockAdminAuth,
    };
    const detailRes = createMockRes();
    await adminOrdersHandler(detailReq, detailRes);

    assert(detailRes.statusCode === 200, 'Delivered order detail lookup succeeds');
    const detailOrder = detailRes.data?.order;
    assert(detailOrder.shipmentProvider === 'Shiprocket', 'Fulfillment provider returned');
    assert(detailOrder.shipmentTrackingNumber === 'SR123456789IN', 'Tracking number returned');
    assert(detailOrder.shipmentAwbCode === 'AWB987654321', 'AWB Code returned');
    assert(typeof detailOrder.deliveredAt === 'string' || detailOrder.deliveredAt instanceof Date, 'DeliveredAt timestamp returned');
    assert(detailOrder.customerName === 'Rohit Sen', 'Customer name returned');
    assert(detailOrder.shippingAddress?.city === 'Kolkata', 'Shipping address city returned');

    // ─── 8. Security: No Secrets Leaked ───────────────────────────────────────
    console.log('\n--- 8. Security: No Secrets Leaked ---');

    const responseString = JSON.stringify(detailRes.data);
    assert(!responseString.includes(process.env.RAZORPAY_KEY_SECRET || 'MOCK_SECRET'), 'No Razorpay secret in admin response');
    assert(!responseString.includes(process.env.DATABASE_URL || 'postgres://'), 'No database credentials in admin response');
    assert(!responseString.includes(process.env.CLERK_SECRET_KEY || 'CLERK_SECRET'), 'No Clerk secret key in admin response');

    // ─── 9. Inventory Invariant: Viewing Orders Does Not Alter Stock ──────────
    console.log('\n--- 9. Inventory Invariant: Viewing Orders Does Not Alter Stock ---');

    const stockBefore = await prisma.product.findUnique({
      where: { id: testProductB.id },
      select: { availableStock: true, inStock: true },
    });

    // Execute multiple admin order queries
    await adminOrdersHandler(adminReq, createMockRes());
    await adminOrdersHandler(pagedReq, createMockRes());
    await adminOrdersHandler(detailReq, createMockRes());

    const stockAfter = await prisma.product.findUnique({
      where: { id: testProductB.id },
      select: { availableStock: true, inStock: true },
    });

    assert(
      stockBefore?.availableStock === stockAfter?.availableStock && stockAfter?.availableStock === 100,
      'Product availableStock strictly remains 100 after viewing admin orders'
    );
    assert(
      stockBefore?.inStock === stockAfter?.inStock && stockAfter?.inStock === true,
      'Product inStock flag strictly remains true'
    );

    // ─── 10. Customer Orders Route Isolation ──────────────────────────────────
    console.log('\n--- 10. Customer Orders Route Isolation ---');

    // Customer 1 fetching their own orders from customer endpoint
    const custReq: any = {
      method: 'GET',
      url: '/api/orders',
      _testUser: customerUser1,
      headers: { authorization: `Bearer ${customer1ClerkId}` },
    };
    const custRes = createMockRes();
    await customerOrdersHandler(custReq, custRes);

    assert(custRes.statusCode === 200, 'Customer endpoint responds 200 OK');
    assert(
      custRes.data?.orders?.every((o: any) => o.userId === customerUser1.id),
      'Customer endpoint only returns orders belonging to Customer 1 (no leakage of Customer 2 orders)'
    );
    assert(custRes.data?.orders?.length === 2, 'Customer 1 receives exactly their 2 orders');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    assert(false, `Unexpected error during test execution: ${err.message}`);
  } finally {
    // ─── Cleanup Test Records ────────────────────────────────────────────────
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }

    if (testProductA) {
      await prisma.product.delete({ where: { id: testProductA.id } }).catch(() => {});
    }
    if (testProductB) {
      await prisma.product.delete({ where: { id: testProductB.id } }).catch(() => {});
    }

    if (adminUser) {
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    }
    if (customerUser1) {
      await prisma.user.delete({ where: { id: customerUser1.id } }).catch(() => {});
    }
    if (customerUser2) {
      await prisma.user.delete({ where: { id: customerUser2.id } }).catch(() => {});
    }

    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log(`ADMIN ORDERS TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdminOrderTests();
