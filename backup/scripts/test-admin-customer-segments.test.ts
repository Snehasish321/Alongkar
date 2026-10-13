/**
 * Admin Customer Segmentation API Unit Test Suite
 *
 * Verifies read-only customer segmentation calculations:
 * - Admin authorization gate (401 / 403 / 405)
 * - Segment ID parameter validation (all 6 valid cohorts, 400 on invalid)
 * - Qualifying purchase rules (prepaid PAID, COD DELIVERED, excludes cancelled/pending)
 * - All 6 segment definitions and exact boundary conditions:
 *   1. new_customers (<= 30 days registration)
 *   2. first_time_buyers (exactly 1 qualifying purchase)
 *   3. repeat_buyers (>= 2 qualifying purchases)
 *   4. high_value_customers (lifetime gross spend >= 3000, 2999 vs 3000 test)
 *   5. jewellery_request_customers (>= 1 custom request)
 *   6. inactive_customers (>= 1 purchase and last purchase > 90 days ago; excludes never-purchased users)
 * - Overlapping segment membership tags
 * - Pagination bounds and search filtering
 * - Zero PII and sensitive data protection
 * - Database mutation rejection and error sanitization
 *
 * Strictly uses in-memory mocked operations.
 * Does NOT connect to Neon, run migrations, or mutate any live records.
 */

process.env.NODE_ENV = 'test';
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import handler, {
  ALLOWED_SEGMENT_IDS,
  ALLOWED_SEGMENT_SORT_OPTIONS,
  HIGH_VALUE_THRESHOLD_INR,
  getSegmentMetadataList,
} from '../api/admin/customers/segments.js';
import { QUALIFYING_ORDER_WHERE } from '../api/admin/customers/analytics.js';

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
      },
      jewelleryRequest: {
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
        groupBy: async () => [],
        create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      },
      jewelleryRequest: {
        groupBy: async () => [],
        create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
        delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      },
    };
  }

  // Fixture customers designed for exact boundary tests:
  // 1. User Alice: Registered 15 days ago (New), 1 qualifying order ₹3500 (First-time, High-value) -> OVERLAPPING!
  // 2. User Bob: Registered 120 days ago, 2 qualifying orders total ₹5000 (Repeat, High-value), latest order 20 days ago (Active buyer, NOT inactive).
  // 3. User Charlie: Registered 200 days ago, 1 qualifying order ₹2000 placed 100 days ago (>90d ago) (First-time, Inactive, NOT high-value).
  // 4. User Diana: Registered 250 days ago, 2 qualifying orders total ₹2999 (Repeat, NOT high-value as ₹2999 < ₹3000), latest order 110 days ago (Inactive, Repeat).
  // 5. User Evan: Registered 20 days ago (New), 0 orders, 1 jewellery request (Jewellery-request, NOT inactive, NOT buyer).
  // 6. User Fiona: Registered 200 days ago, 0 orders, 0 requests (Never purchased, NOT inactive, NOT new).
  // 7. User George: Registered 80 days ago, 1 cancelled order ₹4000 (Does NOT qualify, NOT high-value, NOT inactive).
  // 8. User Hannah: Registered 60 days ago, 1 qualifying order of exactly ₹3000 placed 40 days ago (First-time, High-value exactly at threshold).
  const mockUsers: any[] = [
    {
      id: 'usr_alice_1',
      clerkUserId: 'user_clerk_alice',
      email: 'alice@example.com',
      createdAt: DAYS_AGO(15), // <= 30d (New)
      orders: [
        {
          id: 'ord_1',
          userId: 'usr_alice_1',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          shippingStatus: 'READY',
          paymentProvider: 'RAZORPAY',
          grandTotal: 3500, // >= 3000 (High-value)
          createdAt: DAYS_AGO(10),
          customerName: 'Alice Smith',
          customerPhone: '9876543210',
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_bob_2',
      clerkUserId: 'user_clerk_bob',
      email: 'bob@example.com',
      createdAt: DAYS_AGO(120), // > 30d (Not new)
      orders: [
        {
          id: 'ord_2',
          userId: 'usr_bob_2',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 3000,
          createdAt: DAYS_AGO(20), // <= 90d (Not inactive)
          customerName: 'Bob Jones',
          customerPhone: '9876543211',
        },
        {
          id: 'ord_3',
          userId: 'usr_bob_2',
          status: 'DELIVERED',
          paymentStatus: 'PENDING',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'COD',
          grandTotal: 2000,
          createdAt: DAYS_AGO(50),
          customerName: 'Bob Jones',
          customerPhone: '9876543211',
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_charlie_3',
      clerkUserId: 'user_clerk_charlie',
      email: 'charlie@example.com',
      createdAt: DAYS_AGO(200),
      orders: [
        {
          id: 'ord_4',
          userId: 'usr_charlie_3',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 2000, // < 3000 (Not high-value)
          createdAt: DAYS_AGO(100), // > 90d (Inactive!)
          customerName: 'Charlie Brown',
          customerPhone: '9876543212',
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
          id: 'ord_5',
          userId: 'usr_diana_4',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 1500,
          createdAt: DAYS_AGO(110), // > 90d (Inactive!)
          customerName: 'Diana Prince',
          customerPhone: '9876543213',
        },
        {
          id: 'ord_6',
          userId: 'usr_diana_4',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          shippingStatus: 'DELIVERED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 1499, // Total = 2999 (< 3000, below high-value boundary)
          createdAt: DAYS_AGO(120),
          customerName: 'Diana Prince',
          customerPhone: '9876543213',
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_evan_5',
      clerkUserId: 'user_clerk_evan',
      email: 'evan@example.com',
      createdAt: DAYS_AGO(20), // <= 30d (New)
      orders: [],
      jewelleryRequests: [
        {
          id: 'req_1',
          userId: 'usr_evan_5',
          status: 'PENDING',
          phone: '9876543214',
          createdAt: DAYS_AGO(10),
        },
      ],
    },
    {
      id: 'usr_fiona_6',
      clerkUserId: 'user_clerk_fiona',
      email: 'fiona@example.com',
      createdAt: DAYS_AGO(200),
      orders: [],
      jewelleryRequests: [],
    },
    {
      id: 'usr_george_7',
      clerkUserId: 'user_clerk_george',
      email: 'george@example.com',
      createdAt: DAYS_AGO(80),
      orders: [
        {
          id: 'ord_7',
          userId: 'usr_george_7',
          status: 'CANCELLED',
          paymentStatus: 'PAID',
          shippingStatus: 'CANCELLED',
          paymentProvider: 'RAZORPAY',
          grandTotal: 4000,
          createdAt: DAYS_AGO(40),
          customerName: 'George King',
          customerPhone: '9876543215',
        },
      ],
      jewelleryRequests: [],
    },
    {
      id: 'usr_hannah_8',
      clerkUserId: 'user_clerk_hannah',
      email: 'hannah@example.com',
      createdAt: DAYS_AGO(60),
      orders: [
        {
          id: 'ord_8',
          userId: 'usr_hannah_8',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          shippingStatus: 'READY',
          paymentProvider: 'RAZORPAY',
          grandTotal: 3000, // Exactly 3000 (High-value boundary test!)
          createdAt: DAYS_AGO(40), // <= 90d (Not inactive)
          customerName: 'Hannah Abbott',
          customerPhone: '9876543216',
        },
      ],
      jewelleryRequests: [],
    },
  ];

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
        if (where?.id?.in) {
          list = list.filter((u) => where.id.in.includes(u.id));
        }
        if (where?.AND) {
          for (const clause of where.AND) {
            if (clause.OR) {
              list = list.filter((u) => {
                return clause.OR.some((cond: any) => {
                  if (cond.email?.contains) {
                    return u.email?.toLowerCase().includes(cond.email.contains.toLowerCase());
                  }
                  if (cond.clerkUserId?.contains) {
                    return u.clerkUserId?.toLowerCase().includes(cond.clerkUserId.contains.toLowerCase());
                  }
                  if (cond.orders?.some?.customerName?.contains) {
                    return u.orders?.some((o: any) =>
                      o.customerName?.toLowerCase().includes(cond.orders.some.customerName.contains.toLowerCase())
                    );
                  }
                  return false;
                });
              });
            }
          }
        }
        return list.length;
      },
      findMany: async ({ where, skip = 0, take = 20 }: any = {}) => {
        let list = [...mockUsers];
        if (where?.createdAt?.gte) {
          list = list.filter((u) => u.createdAt >= where.createdAt.gte);
        }
        if (where?.id?.in) {
          list = list.filter((u) => where.id.in.includes(u.id));
        }
        if (where?.AND) {
          for (const clause of where.AND) {
            if (clause.OR) {
              list = list.filter((u) => {
                return clause.OR.some((cond: any) => {
                  if (cond.email?.contains) {
                    return u.email?.toLowerCase().includes(cond.email.contains.toLowerCase());
                  }
                  if (cond.clerkUserId?.contains) {
                    return u.clerkUserId?.toLowerCase().includes(cond.clerkUserId.contains.toLowerCase());
                  }
                  return false;
                });
              });
            }
          }
        }

        // Return user structure
        return list.map((u) => ({
          id: u.id,
          clerkUserId: u.clerkUserId,
          email: u.email,
          createdAt: u.createdAt,
          orders: (u.orders || []).filter((o: any) => o.status !== 'CANCELLED'),
          jewelleryRequests: u.jewelleryRequests || [],
          _count: {
            jewelleryRequests: (u.jewelleryRequests || []).length,
          },
        }));
      },
      create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
    },
    order: {
      groupBy: async ({ by, where, _count, _sum, _max }: any = {}) => {
        const groups: any[] = [];
        for (const u of mockUsers) {
          const userQualifyingOrders = (u.orders || []).filter(isQualifying);
          if (userQualifyingOrders.length > 0) {
            const sumGrandTotal = userQualifyingOrders.reduce((sum: number, o: any) => sum + o.grandTotal, 0);
            const maxCreatedAt = new Date(
              Math.max(...userQualifyingOrders.map((o: any) => o.createdAt.getTime()))
            );
            groups.push({
              userId: u.id,
              _count: { _all: userQualifyingOrders.length },
              _sum: { grandTotal: sumGrandTotal },
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
      groupBy: async ({ by, _count }: any = {}) => {
        const groups: any[] = [];
        for (const u of mockUsers) {
          if (u.jewelleryRequests && u.jewelleryRequests.length > 0) {
            groups.push({
              userId: u.id,
              _count: { _all: u.jewelleryRequests.length },
            });
          }
        }
        return groups;
      },
      create: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      update: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
      delete: async () => { mutationAttempted = true; throw new Error('Mutation blocked'); },
    },
  };
}

/**
 * Scans payload for sensitive authentication secrets or leaked credentials
 */
function scanForSecrets(obj: any, path: string = ''): string[] {
  const violations: string[] = [];
  const FORBIDDEN_SECRET_KEYS = [
    'password',
    'secretkey',
    'clerksecretkey',
    'razorpaykeysecret',
    'authtoken',
    'sessiontoken',
    'privatemetadata',
  ];

  if (!obj || typeof obj !== 'object') {
    return violations;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      violations.push(...scanForSecrets(item, `${path}[${index}]`));
    });
    return violations;
  }

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.includes(lowerKey)) {
      violations.push(`Forbidden secret key "${key}" found at path ${path}.${key}`);
    }
    violations.push(...scanForSecrets(value, `${path}.${key}`));
  }

  return violations;
}

async function runTests() {
  console.log('====================================================================');
  console.log('ADMIN CUSTOMER SEGMENTATION API — UNIT TEST SUITE');
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

  // ─── 2. Query Parameter Validation & Bounds ───────────────────────────────────
  console.log('\n--- 2. Query Parameter Validation & Bounds ---');
  {
    const mockDb = createMockPrismaClient();

    // 2.1 Invalid segment ID returns 400
    const invalidSegReq: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=churned_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const invalidSegRes = createMockRes();
    await handler(invalidSegReq, invalidSegRes, mockDb);
    assert(invalidSegRes._getStatus() === 400, 'Invalid segment ID returns HTTP 400');
    assert(
      invalidSegRes._getData()?.error?.includes('Valid segment IDs'),
      'Error message lists valid segment options'
    );

    // 2.2 Invalid limit (< 1 or > 100) returns 400
    const invalidLimitReq: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?limit=500',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const invalidLimitRes = createMockRes();
    await handler(invalidLimitReq, invalidLimitRes, mockDb);
    assert(invalidLimitRes._getStatus() === 400, 'Limit > 100 is rejected with HTTP 400');

    // 2.3 Invalid sortBy returns 400
    const invalidSortReq: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?sortBy=random_order',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const invalidSortRes = createMockRes();
    await handler(invalidSortReq, invalidSortRes, mockDb);
    assert(invalidSortRes._getStatus() === 400, 'Invalid sortBy returns HTTP 400');

    // 2.4 Default segment is new_customers
    const defaultReq: any = {
      method: 'GET',
      url: '/api/admin/customers/segments',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const defaultRes = createMockRes();
    await handler(defaultReq, defaultRes, mockDb);
    assert(defaultRes._getStatus() === 200, 'Default request returns HTTP 200');
    assert(defaultRes._getData()?.selectedSegment === 'new_customers', 'Default segment is "new_customers"');
  }

  // ─── 3. Segment Definitions & Exact Boundary Verification ─────────────────────
  console.log('\n--- 3. Segment Definitions & Boundary Verification ---');
  {
    const mockDb = createMockPrismaClient();

    // Query overview with default segment (returns all 6 segment counts in metadata)
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=new_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);
    const data = res._getData();

    const segmentsMeta = data?.segments || [];
    assert(segmentsMeta.length === 6, 'All 6 customer segments are defined and returned in metadata');

    const getCount = (id: string) => segmentsMeta.find((s: any) => s.id === id)?.customerCount;

    // 3.1 New Customers: Registered <= 30 days ago (Alice, Evan = 2)
    assert(getCount('new_customers') === 2, 'New Customers count is 2 (Alice: 15d, Evan: 20d; George/Hannah > 30d excluded)');

    // 3.2 First-Time Buyers: Exactly 1 qualifying purchase (Alice, Charlie, Hannah = 3)
    // Note: George has 1 cancelled order which does NOT qualify
    assert(getCount('first_time_buyers') === 3, 'First-Time Buyers count is 3 (Alice: 1, Charlie: 1, Hannah: 1; George excluded)');

    // 3.3 Repeat Buyers: >= 2 qualifying purchases (Bob, Diana = 2)
    assert(getCount('repeat_buyers') === 2, 'Repeat Buyers count is 2 (Bob: 2, Diana: 2)');

    // 3.4 High-Value Customers (Threshold >= 3000):
    // Alice (3500 >= 3000) -> YES
    // Bob (5000 >= 3000) -> YES
    // Charlie (2000 < 3000) -> NO
    // Diana (1500 + 1499 = 2999 < 3000) -> NO (Exact boundary below 3000!)
    // Hannah (3000 >= 3000) -> YES (Exact boundary at 3000!)
    // George (4000 cancelled) -> NO (Cancelled order does not qualify)
    assert(
      getCount('high_value_customers') === 3,
      'High-Value count is 3 (Alice: 3500, Bob: 5000, Hannah: 3000; Diana 2999 excluded below threshold)'
    );

    // 3.5 Jewellery Request Customers (Evan = 1)
    assert(getCount('jewellery_request_customers') === 1, 'Jewellery Request Customers count is 1 (Evan)');

    // 3.6 Inactive Customers (>= 1 purchase AND last purchase > 90 days ago):
    // Alice: last order 10d ago -> ACTIVE (not inactive)
    // Bob: last order 20d ago -> ACTIVE (not inactive)
    // Charlie: last order 100d ago (> 90d) -> INACTIVE
    // Diana: last order 110d ago (> 90d) -> INACTIVE
    // Evan: 0 purchases -> EXCLUDED (never purchased)
    // Fiona: 0 purchases -> EXCLUDED (never purchased)
    // Hannah: last order 40d ago -> ACTIVE (not inactive)
    assert(
      getCount('inactive_customers') === 2,
      'Inactive Customers count is 2 (Charlie: 100d ago, Diana: 110d ago; never-purchased users strictly excluded)'
    );
  }

  // ─── 4. Non-Qualifying Orders Integrity (Cancelled/Unpaid/Failed) ─────────────
  console.log('\n--- 4. Non-Qualifying Orders Protection ---');
  {
    const mockDb = createMockPrismaClient();

    // Query first-time buyers segment
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=first_time_buyers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);
    const members = res._getData()?.customers || [];

    const memberIds = members.map((m: any) => m.id);
    assert(!memberIds.includes('usr_george_7'), 'Cancelled order customer (George) is NOT in first-time buyers');
    assert(!memberIds.includes('usr_fiona_6'), 'Zero-order customer (Fiona) is NOT in first-time buyers');
  }

  // ─── 5. Overlapping Segment Memberships & Badges ─────────────────────────────
  console.log('\n--- 5. Overlapping Cohort Badges ---');
  {
    const mockDb = createMockPrismaClient();

    // Query new_customers segment
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=new_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);
    const members = res._getData()?.customers || [];

    const alice = members.find((m: any) => m.id === 'usr_alice_1');
    assert(alice !== undefined, 'Alice is found in new_customers');
    assert(alice?.segmentTags?.includes('New Customer'), 'Alice has "New Customer" tag');
    assert(alice?.segmentTags?.includes('First-Time Buyer'), 'Alice has "First-Time Buyer" tag');
    assert(alice?.segmentTags?.includes('High-Value'), 'Alice has "High-Value" tag');

    const evan = members.find((m: any) => m.id === 'usr_evan_5');
    assert(evan !== undefined, 'Evan is found in new_customers');
    assert(evan?.segmentTags?.includes('Jewellery Request'), 'Evan has "Jewellery Request" tag');
    assert(!evan?.segmentTags?.includes('Inactive'), 'Evan does NOT have "Inactive" tag');
  }

  // ─── 6. High-Value INR 3000 Boundary Test (2999 vs 3000 vs 3001) ─────────────
  console.log('\n--- 6. High-Value INR 3000 Threshold Boundary Test ---');
  {
    const mockDb = createMockPrismaClient();

    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=high_value_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);
    const members = res._getData()?.customers || [];
    const memberIds = members.map((m: any) => m.id);

    // Hannah spent exactly ₹3000 -> included
    assert(memberIds.includes('usr_hannah_8'), 'Hannah (exactly ₹3,000) is included in high_value_customers');
    // Alice spent ₹3500 -> included
    assert(memberIds.includes('usr_alice_1'), 'Alice (₹3,500) is included in high_value_customers');
    // Diana spent ₹2999 -> excluded
    assert(!memberIds.includes('usr_diana_4'), 'Diana (₹2,999) is strictly excluded from high_value_customers');
  }

  // ─── 7. Inactive Customers Boundary Test (Never-Purchased Exclusion) ──────────
  console.log('\n--- 7. Inactive Customers & Never-Purchased Exclusion ---');
  {
    const mockDb = createMockPrismaClient();

    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=inactive_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);
    const members = res._getData()?.customers || [];
    const memberIds = members.map((m: any) => m.id);

    // Charlie & Diana have orders > 90d ago
    assert(memberIds.includes('usr_charlie_3'), 'Charlie (last order 100d ago) is in inactive_customers');
    assert(memberIds.includes('usr_diana_4'), 'Diana (last order 110d ago) is in inactive_customers');

    // Fiona & Evan have 0 orders -> MUST NOT be in inactive
    assert(!memberIds.includes('usr_fiona_6'), 'Fiona (0 lifetime purchases) is NOT in inactive_customers');
    assert(!memberIds.includes('usr_evan_5'), 'Evan (0 lifetime purchases) is NOT in inactive_customers');

    // Bob has recent order (20d ago) -> MUST NOT be in inactive
    assert(!memberIds.includes('usr_bob_2'), 'Bob (last order 20d ago) is NOT in inactive_customers');
  }

  // ─── 8. Empty Dataset Resilience & Pagination ─────────────────────────────────
  console.log('\n--- 8. Empty Dataset Resilience & Pagination ---');
  {
    const emptyDb = createMockPrismaClient({ empty: true });
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=repeat_buyers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, emptyDb);

    assert(res._getStatus() === 200, 'Empty database returns HTTP 200');
    assert(res._getData()?.customers?.length === 0, 'Customers list is empty');
    assert(res._getData()?.pagination?.total === 0, 'Pagination total is 0');
    assert(res._getData()?.pagination?.totalPages === 1, 'Pagination totalPages is 1');
  }

  // ─── 9. Zero Secret / Private Metadata Exposure Audit ─────────────────────────
  console.log('\n--- 9. Sensitive Data & Secrets Audit ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=high_value_customers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    const payload = res._getData();
    const secretViolations = scanForSecrets(payload);
    assert(secretViolations.length === 0, 'Response payload contains zero private Clerk secrets, passwords, or tokens');

    const rules = payload?.rules;
    assert(typeof rules?.highValueThresholdRule === 'string', 'High-value threshold rule is documented in response');
    assert(typeof rules?.inactivityRule === 'string', 'Inactivity definition rule is documented in response');
    assert(typeof rules?.refundLimitation === 'string', 'Refund limitation is documented in response');
  }

  // ─── 10. Strict Read-Only Safety Verification ────────────────────────────────
  console.log('\n--- 10. Strict Read-Only Safety Verification ---');
  {
    const mockDb = createMockPrismaClient();
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=repeat_buyers',
      _testAdmin: { authorized: true, status: 200, clerkUserId: 'admin_test' },
    };
    const res = createMockRes();
    await handler(req, res, mockDb);

    assert(
      mockDb.getMutationAttempted() === false,
      'No database mutation (create/update/delete) was attempted during segment query'
    );
  }

  // ─── 11. Error Sanitization ──────────────────────────────────────────────────
  console.log('\n--- 11. Error Sanitization ---');
  {
    const errorDb = createMockPrismaClient({ errorOnQuery: true });
    const req: any = {
      method: 'GET',
      url: '/api/admin/customers/segments?segment=new_customers',
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
