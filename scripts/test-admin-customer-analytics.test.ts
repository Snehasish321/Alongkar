/**
 * Admin Customer Analytics API Unit Test Suite
 *
 * Verifies read-only aggregated analytics calculations:
 * - Admin authorization gate (401 / 403 / 405)
 * - Time range parameter validation (30d, 90d, 1y, all)
 * - Qualifying purchase rules (prepaid PAID, COD DELIVERED, excludes cancelled/pending)
 * - Repeat buyer classification & repeat-purchase-rate denominator
 * - Lifetime order-frequency and purchase-recency distributions
 * - Period-specific Gross Order Value and Gross AOV
 * - Realized AOV null safety and documented refund caveats
 * - Zero PII leakage verification
 * - Empty dataset division-by-zero resilience
 * - Database mutation rejection and error sanitization
 *
 * Strictly uses in-memory mocked operations.
 * Does NOT connect to Neon, run migrations, or mutate any live records.
 */

process.env.NODE_ENV = 'test';
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import handler, {
  QUALIFYING_ORDER_WHERE,
  getTimeRangeBounds,
  ALLOWED_TIME_RANGES,
} from '../api/_utils/adminCustomerAnalytics.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

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
    end(str?: string) {
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

/**
 * Fixture dates relative to current execution time
 */
const DAYS_AGO = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Creates in-memory mock Prisma client populated with test customer fixtures
 */
function createMockPrismaClient(options: { empty?: boolean; errorOnQuery?: boolean } = {}) {
  let mutationAttempted = false;

  if (options.errorOnQuery) {
    return {
      getMutationAttempted: () => false,
      user: {
        count: async () => {
          throw new Error('Database connection failure: postgres://admin:super_secret_pw@neon.tech/prod');
        },
        findMany: async () => [],
      },
      order: {
        groupBy: async () => [],
        aggregate: async () => ({ _sum: { grandTotal: 0 }, _count: { _all: 0 } }),
      },
      jewelleryRequest: {
        count: async () => 0,
        groupBy: async () => [],
      },
    };
  }

  if (options.empty) {
    return {
      getMutationAttempted: () => mutationAttempted,
      user: {
        count: async () => 0,
        findMany: async () => [],
        create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { grandTotal: null }, _count: { _all: 0 } }),
        groupBy: async () => [],
        create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      },
      jewelleryRequest: {
        count: async () => 0,
        groupBy: async () => [],
        create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      },
    };
  }

  // 6 fixture users:
  // User 1 (Alice): 2 qualifying orders (Repeat buyer)
  // User 2 (Bob): 1 qualifying order + 1 cancelled + 1 pending COD (First-time buyer)
  // User 3 (Charlie): 1 failed prepaid + 1 cancelled COD (0 qualifying orders)
  // User 4 (Diana): 3 qualifying orders (Repeat buyer)
  // User 5 (Evan): 0 orders, 1 jewellery request (0 qualifying orders)
  // User 6 (Fiona): 0 orders, 0 requests (0 qualifying orders)
  const mockUsers: any[] = [
    {
      id: 'usr_alice_1',
      clerkUserId: 'user_clerk_alice',
      email: 'alice@example.com',
      createdAt: DAYS_AGO(40),
      orders: [
        {
          id: 'ord_1',
          userId: 'usr_alice_1',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          shippingStatus: 'READY',
          paymentProvider: 'RAZORPAY',
          grandTotal: 12000,
          createdAt: DAYS_AGO(10), // Within 30d
        },
        {
          id: 'ord_2',
          userId: 'usr_alice_1',
          status: 'DELIVERED',
          paymentStatus: 'PENDING',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'COD',
          grandTotal: 6000,
          createdAt: DAYS_AGO(45), // Within 90d
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_bob_2',
      clerkUserId: 'user_clerk_bob',
      email: 'bob@example.com',
      createdAt: DAYS_AGO(70),
      orders: [
        {
          id: 'ord_3',
          userId: 'usr_bob_2',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          shippingStatus: 'SHIPPED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 5000,
          createdAt: DAYS_AGO(60), // Within 90d
        },
        {
          id: 'ord_4',
          userId: 'usr_bob_2',
          status: 'CANCELLED',
          paymentStatus: 'PAID',
          shippingStatus: 'CANCELLED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 5000,
          createdAt: DAYS_AGO(65),
        },
        {
          id: 'ord_5',
          userId: 'usr_bob_2',
          status: 'SHIPPED',
          paymentStatus: 'PENDING',
          shippingStatus: 'IN_TRANSIT',
          paymentProvider: 'COD',
          grandTotal: 4000,
          createdAt: DAYS_AGO(20),
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_charlie_3',
      clerkUserId: 'user_clerk_charlie',
      email: 'charlie@example.com',
      createdAt: DAYS_AGO(100),
      orders: [
        {
          id: 'ord_6',
          userId: 'usr_charlie_3',
          status: 'PENDING',
          paymentStatus: 'FAILED',
          shippingStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          grandTotal: 8000,
          createdAt: DAYS_AGO(95),
        },
        {
          id: 'ord_7',
          userId: 'usr_charlie_3',
          status: 'CANCELLED',
          paymentStatus: 'PENDING',
          shippingStatus: 'CANCELLED',
          paymentProvider: 'COD',
          grandTotal: 3000,
          createdAt: DAYS_AGO(92),
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_diana_4',
      clerkUserId: 'user_clerk_diana',
      email: 'diana@example.com',
      createdAt: DAYS_AGO(250),
      orders: [
        {
          id: 'ord_8',
          userId: 'usr_diana_4',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'COD',
          grandTotal: 15000,
          createdAt: DAYS_AGO(120), // Within 1y
        },
        {
          id: 'ord_9',
          userId: 'usr_diana_4',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 25000,
          createdAt: DAYS_AGO(200), // > 180d
        },
        {
          id: 'ord_10',
          userId: 'usr_diana_4',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 10000,
          createdAt: DAYS_AGO(210), // > 180d
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_evan_5',
      clerkUserId: 'user_clerk_evan',
      email: 'evan@example.com',
      createdAt: DAYS_AGO(25),
      orders: [],
      jewelleryRequests: [
        { id: 'req_1', status: 'PENDING', createdAt: DAYS_AGO(5) },
      ],
    },
    {
      id: 'usr_fiona_6',
      clerkUserId: 'user_clerk_fiona',
      email: 'fiona@example.com',
      createdAt: DAYS_AGO(15),
      orders: [],
      jewelleryRequests: [],
    },
  ];

  // Helper to determine if an order qualifies
  const isQualifying = (o: any) => {
    if (o.status === 'CANCELLED') return false;
    if (o.paymentProvider !== 'COD' && o.paymentStatus === 'PAID') return true;
    if (o.paymentProvider === 'COD' && (o.status === 'DELIVERED' || o.shippingStatus === 'DELIVERED')) return true;
    return false;
  };

  return {
    getMutationAttempted: () => mutationAttempted,
    user: {
      count: async ({ where }: any = {}) => {
        let list = [...mockUsers];
        if (where?.createdAt?.gte) {
          list = list.filter((u) => u.createdAt >= where.createdAt.gte);
        }
        return list.length;
      },
      findMany: async ({ where, select }: any = {}) => {
        let list = [...mockUsers];
        if (where?.createdAt?.gte) {
          list = list.filter((u) => u.createdAt >= where.createdAt.gte);
        }
        return list.map((u) => ({
          createdAt: u.createdAt,
        }));
      },
      create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
    },
    order: {
      count: async ({ where }: any = {}) => {
        let allOrders: any[] = [];
        for (const u of mockUsers) {
          allOrders.push(...u.orders);
        }
        if (where?.status?.not) {
          allOrders = allOrders.filter((o) => o.status !== where.status.not);
        }
        if (where?.createdAt?.gte) {
          allOrders = allOrders.filter((o) => o.createdAt >= where.createdAt.gte);
        }
        allOrders = allOrders.filter(isQualifying);
        return allOrders.length;
      },
      aggregate: async ({ where, _sum, _count }: any = {}) => {
        let allOrders: any[] = [];
        for (const u of mockUsers) {
          allOrders.push(...u.orders);
        }
        if (where?.status?.not) {
          allOrders = allOrders.filter((o) => o.status !== where.status.not);
        }
        if (where?.createdAt?.gte) {
          allOrders = allOrders.filter((o) => o.createdAt >= where.createdAt.gte);
        }

        // Branching for specific aggregations
        if (where?.paymentProvider?.not === 'COD' && where?.paymentStatus === 'PAID') {
          allOrders = allOrders.filter((o) => o.paymentProvider !== 'COD' && o.paymentStatus === 'PAID');
        } else if (where?.paymentProvider === 'COD' && where?.OR) {
          allOrders = allOrders.filter((o) => o.paymentProvider === 'COD' && (o.status === 'DELIVERED' || o.shippingStatus === 'DELIVERED'));
        } else if (where?.paymentStatus?.in) {
          allOrders = allOrders.filter((o) => where.paymentStatus.in.includes(o.paymentStatus));
        } else {
          allOrders = allOrders.filter(isQualifying);
        }

        const sumGrandTotal = allOrders.reduce((acc, o) => acc + (o.grandTotal || 0), 0);
        return {
          _count: { _all: allOrders.length },
          _sum: { grandTotal: sumGrandTotal },
        };
      },
      groupBy: async ({ by, where, _count, _max }: any = {}) => {
        // Group qualifying orders by userId
        const groups: any[] = [];
        for (const u of mockUsers) {
          let userQualifyingOrders = (u.orders || []).filter(isQualifying);
          if (where?.status?.not) {
            userQualifyingOrders = userQualifyingOrders.filter((o: any) => o.status !== where.status.not);
          }
          if (userQualifyingOrders.length > 0) {
            const maxCreatedAt = new Date(
              Math.max(...userQualifyingOrders.map((o: any) => o.createdAt.getTime()))
            );
            groups.push({
              userId: u.id,
              _count: { _all: userQualifyingOrders.length },
              _max: { createdAt: maxCreatedAt },
            });
          }
        }
        return groups;
      },
      create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
    },
    jewelleryRequest: {
      count: async ({ where }: any = {}) => 1,
      groupBy: async () => [
        { status: 'PENDING', _count: { _all: 1 } },
      ],
      create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
    },
  };
}

/**
 * Recursively scans an object or array to ensure no PII fields or values exist.
 */
function scanForPii(obj: any, path: string = ''): string[] {
  const violations: string[] = [];
  const FORBIDDEN_KEYS = [
    'customername',
    'name',
    'customeremail',
    'email',
    'customerphone',
    'phone',
    'shippingaddressline1',
    'shippingaddressline2',
    'address',
    'clerkuserid',
    'userid',
  ];

  const FORBIDDEN_STRINGS = [
    'alice',
    'bob',
    'charlie',
    'diana',
    'evan',
    'fiona',
    '@example.com',
    'user_clerk_',
  ];

  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      const lower = obj.toLowerCase();
      for (const str of FORBIDDEN_STRINGS) {
        if (lower.includes(str)) {
          violations.push(`Forbidden PII string value "${str}" found at path ${path}: "${obj}"`);
        }
      }
    }
    return violations;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      violations.push(...scanForPii(item, `${path}[${index}]`));
    });
    return violations;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_KEYS.includes(lowerKey)) {
      violations.push(`Forbidden PII key "${key}" found at path ${path}.${key}`);
    }
    violations.push(...scanForPii(value, `${path}.${key}`));
  }

  return violations;
}

async function runTests() {
  console.log('====================================================================');
  console.log('ADMIN CUSTOMER ANALYTICS API — UNIT TEST SUITE');
  console.log('====================================================================\n');

  // ─── 1. Authentication & Authorization Gate ───────────────────────────────────
  console.log('--- 1. Authentication & Authorization Gate ---');
  {
    const mockDb = createMockPrismaClient();

    // 1.1 Unauthenticated access returns 401
    const unauthReq: any = {
      method: 'GET',
      headers: {},
      _testAdmin: { authorized: false, status: 401, error: 'Unauthorized: Session missing' },
    };
    const unauthRes = createMockRes();
    await handler(unauthReq, unauthRes, mockDb);
    assert(unauthRes._getStatus() === 401, 'Unauthenticated request is rejected with HTTP 401');

    // 1.2 Authenticated non-admin access returns 403
    const nonAdminReq: any = {
      method: 'GET',
      headers: {},
      _testAdmin: { authorized: false, status: 403, error: 'Forbidden: Admin privilege required' },
    };
    const nonAdminRes = createMockRes();
    await handler(nonAdminReq, nonAdminRes, mockDb);
    assert(nonAdminRes._getStatus() === 403, 'Non-admin request is rejected with HTTP 403');

    // 1.3 Non-GET method (POST) returns 405
    const postReq: any = {
      method: 'POST',
      headers: {},
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const postRes = createMockRes();
    await handler(postReq, postRes, mockDb);
    assert(postRes._getStatus() === 405, 'Non-GET method (POST) is rejected with HTTP 405');
  }

  // ─── 2. Query Parameter Validation & Defaults ─────────────────────────────────
  console.log('\n--- 2. Query Parameter Validation & Defaults ---');
  {
    const mockDb = createMockPrismaClient();

    // 2.1 Invalid time range returns 400
    const invalidReq: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=invalid_range',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const invalidRes = createMockRes();
    await handler(invalidReq, invalidRes, mockDb);
    assert(invalidRes._getStatus() === 400, 'Invalid timeRange parameter returns HTTP 400');
    assert(
      invalidRes._getData()?.error?.includes('Invalid timeRange'),
      'Error message lists valid options'
    );

    // 2.2 Default time range is 30d
    const defaultReq: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const defaultRes = createMockRes();
    await handler(defaultReq, defaultRes, mockDb);
    assert(defaultRes._getStatus() === 200, 'Valid request returns HTTP 200');
    assert(defaultRes._getData()?.timeRange === '30d', 'Default timeRange is "30d"');
  }

  // ─── 3. Qualifying-Purchase Definition Tests ─────────────────────────────────
  console.log('\n--- 3. Qualifying-Purchase Definition & Logic ---');
  {
    // Verify the static filter constant
    assert(
      QUALIFYING_ORDER_WHERE.status?.not === 'CANCELLED',
      'QUALIFYING_ORDER_WHERE excludes CANCELLED orders'
    );
    assert(
      Array.isArray(QUALIFYING_ORDER_WHERE.OR) && QUALIFYING_ORDER_WHERE.OR.length === 2,
      'QUALIFYING_ORDER_WHERE has prepaid and COD branches'
    );

    // Verify timeRangeBounds helper
    const nowRef = new Date();
    const b30 = getTimeRangeBounds('30d', nowRef);
    assert(b30.bucketType === 'day' && b30.startDate !== null, '30d bounds use daily buckets');
    const b90 = getTimeRangeBounds('90d', nowRef);
    assert(b90.bucketType === 'week' && b90.startDate !== null, '90d bounds use weekly buckets');
    const b1y = getTimeRangeBounds('1y', nowRef);
    assert(b1y.bucketType === 'month' && b1y.startDate !== null, '1y bounds use monthly buckets');
    const ball = getTimeRangeBounds('all', nowRef);
    assert(ball.bucketType === 'month' && ball.startDate === null, 'all-time bounds use monthly buckets with null startDate');
  }

  // ─── 4. Customer Aggregate Metrics Calculation ──────────────────────────────
  console.log('\n--- 4. Customer Metrics & Repeat-Purchase Denominators ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=all',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const payload = res._getData();
    assert(payload?.success === true, 'Response payload contains success: true');

    const summary = payload?.summary;
    assert(summary?.totalRegisteredCustomers === 6, 'Total registered customers is 6');
    assert(
      summary?.customersWithQualifyingPurchases === 3,
      'Customers with at least 1 qualifying purchase is 3 (Alice, Bob, Diana)'
    );
    assert(
      summary?.firstTimeBuyers === 1,
      'First-time buyers is exactly 1 (Bob with 1 qualifying purchase)'
    );
    assert(
      summary?.repeatBuyers === 2,
      'Repeat buyers is exactly 2 (Alice with 2, Diana with 3)'
    );

    // Repeat purchase rate: 2 / 3 = 0.6667 (66.67%)
    const expectedRate = Math.round((2 / 3) * 10000) / 100;
    assert(
      summary?.repeatPurchaseRate === expectedRate,
      `Repeat purchase rate is calculated as repeatBuyers / customersWithQualifyingPurchases (${expectedRate}%)`
    );

    // Cancelled and pending COD orders do NOT make Charlie or Bob repeat buyers
    assert(
      summary?.customersWithQualifyingPurchases !== summary?.totalRegisteredCustomers,
      'Denominator strictly excludes non-purchasing accounts'
    );
  }

  // ─── 5. Order Frequency Distribution ─────────────────────────────────────────
  console.log('\n--- 5. Order-Frequency Distribution ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=all',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const freq = res._getData()?.orderFrequencyDistribution;
    assert(Array.isArray(freq) && freq.length === 4, 'Order frequency distribution has 4 buckets');

    const zeroBucket = freq?.find((b: any) => b.key === 'zero_orders');
    const oneBucket = freq?.find((b: any) => b.key === 'one_order');
    const twoToFourBucket = freq?.find((b: any) => b.key === 'two_to_four');
    const fivePlusBucket = freq?.find((b: any) => b.key === 'five_plus');

    assert(zeroBucket?.count === 3, 'Zero qualifying orders bucket has 3 customers (Charlie, Evan, Fiona)');
    assert(oneBucket?.count === 1, 'One qualifying order bucket has 1 customer (Bob)');
    assert(twoToFourBucket?.count === 2, 'Two-to-four qualifying orders bucket has 2 customers (Alice, Diana)');
    assert(fivePlusBucket?.count === 0, 'Five+ qualifying orders bucket has 0 customers');

    const totalInFreq = freq?.reduce((sum: number, b: any) => sum + b.count, 0);
    assert(totalInFreq === 6, 'Sum of order-frequency bucket counts equals total registered customers (6)');
  }

  // ─── 6. Purchase Recency Distribution ────────────────────────────────────────
  console.log('\n--- 6. Purchase-Recency Distribution ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=all',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const recency = res._getData()?.purchaseRecencyDistribution;
    assert(Array.isArray(recency) && recency.length === 5, 'Purchase recency distribution has 5 cohorts');

    const under30Bucket = recency?.find((b: any) => b.key === 'under_30d');
    const between30And90Bucket = recency?.find((b: any) => b.key === '30_to_90d');
    const between90And180Bucket = recency?.find((b: any) => b.key === '90_to_180d');
    const over180Bucket = recency?.find((b: any) => b.key === 'over_180d');
    const neverBucket = recency?.find((b: any) => b.key === 'never_purchased');

    assert(under30Bucket?.count === 1, 'Under 30 days cohort has 1 customer (Alice, 10d ago)');
    assert(between30And90Bucket?.count === 1, '30-90 days cohort has 1 customer (Bob, 60d ago)');
    assert(between90And180Bucket?.count === 1, '90-180 days cohort has 1 customer (Diana, 120d ago)');
    assert(over180Bucket?.count === 0, 'Over 180 days cohort has 0 customers whose latest order is >180d');
    assert(neverBucket?.count === 3, 'Never purchased cohort has 3 customers (Charlie, Evan, Fiona)');

    const totalInRecency = recency?.reduce((sum: number, b: any) => sum + b.count, 0);
    assert(totalInRecency === 6, 'Sum of recency cohort counts equals total registered customers (6)');
  }

  // ─── 7. Financial Metrics & Realized AOV Caveats ──────────────────────────────
  console.log('\n--- 7. Financial Integrity & Honest Caveats ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=30d',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const payload = res._getData();
    const summary = payload?.summary;
    const limitations = payload?.limitations;

    assert(
      summary?.realizedAov === null,
      'Realized AOV is explicitly null because partial refunds cannot be tracked reliably in current schema'
    );
    assert(
      typeof limitations?.refundLimitation === 'string' && limitations.refundLimitation.length > 20,
      'Refund limitation is documented and clearly explained'
    );
    assert(
      typeof limitations?.requestAttributionLimitation === 'string' && limitations.requestAttributionLimitation.length > 20,
      'Jewellery request attribution caveat is documented'
    );
    assert(
      typeof limitations?.realizedAovLimitation === 'string' && limitations.realizedAovLimitation.length > 20,
      'Realized AOV omission reason is documented'
    );
    assert(
      summary?.grossOrderValue >= 0,
      'Gross order value is non-negative'
    );
  }

  // ─── 8. Empty Dataset Resilience (Division-by-Zero Protection) ───────────────
  console.log('\n--- 8. Empty Dataset Resilience ---');
  {
    const emptyDb = createMockPrismaClient({ empty: true });
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=30d',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, emptyDb);

    assert(res._getStatus() === 200, 'Empty database returns HTTP 200 without crashing');
    const summary = res._getData()?.summary;
    assert(summary?.totalRegisteredCustomers === 0, 'totalRegisteredCustomers is 0');
    assert(summary?.customersWithQualifyingPurchases === 0, 'customersWithQualifyingPurchases is 0');
    assert(summary?.firstTimeBuyers === 0, 'firstTimeBuyers is 0');
    assert(summary?.repeatBuyers === 0, 'repeatBuyers is 0');
    assert(summary?.repeatPurchaseRate === 0, 'repeatPurchaseRate is 0 (not NaN or Infinity)');
    assert(summary?.grossAov === null, 'grossAov is null when orders count is 0');
    assert(summary?.realizedAov === null, 'realizedAov remains null');

    const trends = res._getData()?.acquisitionTrend;
    assert(Array.isArray(trends) && trends.length > 0, 'Acquisition trend returns valid empty timeline points');
    assert(trends.every((t: any) => t.count === 0), 'All timeline points have count 0');
  }

  // ─── 9. Zero PII Exposure Audit ──────────────────────────────────────────────
  console.log('\n--- 9. Strict Zero-PII Response Audit ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=all',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const payload = res._getData();
    const violations = scanForPii(payload);
    if (violations.length > 0) {
      console.error('PII Violations found:', violations);
    }
    assert(violations.length === 0, 'Analytics response payload contains zero customer PII, emails, names, or Clerk IDs');
  }

  // ─── 10. Strict Read-Only Safety Verification ────────────────────────────────
  console.log('\n--- 10. Strict Read-Only Safety Verification ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=90d',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    assert(
      mockDb.getMutationAttempted() === false,
      'No database mutation (create/update/delete) was attempted during analytics execution'
    );
  }

  // ─── 11. Database Error Sanitization ─────────────────────────────────────────
  console.log('\n--- 11. Error Sanitization ---');
  {
    const errorDb = createMockPrismaClient({ errorOnQuery: true });
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/analytics?timeRange=30d',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, errorDb);

    assert(res._getStatus() === 500, 'Database failure returns HTTP 500');
    const bodyStr = JSON.stringify(res._getData());
    assert(!bodyStr.includes('super_secret_pw'), 'Error response does NOT leak database passwords');
    assert(!bodyStr.includes('neon.tech'), 'Error response does NOT leak connection hostnames');
  }

  // ─── Final Summary ───────────────────────────────────────────────────────────
  console.log('\n====================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
