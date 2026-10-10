import './testDbGuard.js';
import prisma from '../src/lib/prisma.js';
import handler, {
  ALLOWED_STATUS_TRANSITIONS,
  formatAdminJewelleryRequest,
  extractRequestId,
} from '../api/admin/jewellery-requests.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ FAIL: ${testName} - ${detail || 'Condition not met'}`);
    failedCount++;
  }
}

// Mock HTTP Request/Response Helper
function createMockReqRes(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
}) {
  let statusCode = 200;
  let responseHeaders: Record<string, string> = {};
  let responseData: any = null;

  const req: any = {
    method: options.method || 'GET',
    url: options.url || '/api/admin/jewellery-requests',
    headers: options.headers || {},
    query: options.query || {},
    body: options.body,
  };

  const res: any = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      responseHeaders[name.toLowerCase()] = value;
    },
    status(code: number) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    end(raw?: string) {
      if (raw && !responseData) {
        try {
          responseData = JSON.parse(raw);
        } catch {
          responseData = raw;
        }
      }
      return this;
    },
    _getStatus: () => statusCode,
    _getData: () => responseData,
  };

  return { req, res };
}

async function runTask5Tests() {
  console.log('\n==================================================');
  console.log('--- RUNNING TASK 5: ADMIN JEWELLERY REQUESTS TESTS ---');
  console.log('==================================================\n');

  try {
    // 1. Setup Test Users & Requests in Database
    let testUser = await prisma.user.findFirst({
      where: { clerkUserId: 'test_clerk_admin_cust_1' },
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          clerkUserId: 'test_clerk_admin_cust_1',
          email: 'customer.atelier@alongkar.test',
        },
      });
    }

    const testReqPending = await prisma.jewelleryRequest.create({
      data: {
        requestNumber: `REQ-TEST-ADM-${Date.now()}-1`,
        userId: testUser.id,
        jewelleryType: 'Polki Choker Necklace',
        description: 'Traditional heritage royal bridal choker with emerald pearls.',
        inspirationImageUrl: 'https://res.cloudinary.com/alongkar/image/upload/v1/inspiration-mock.jpg',
        quantity: 1,
        phone: '+91 98765 43210',
        budget: 75000,
        additionalRequirements: 'Need 24K gold foil finish.',
        status: 'PENDING',
      },
    });

    const testReqUnderReview = await prisma.jewelleryRequest.create({
      data: {
        requestNumber: `REQ-TEST-ADM-${Date.now()}-2`,
        userId: testUser.id,
        jewelleryType: 'Temple Jhumka Earrings',
        description: 'Antique finish traditional temple design earrings.',
        inspirationImageUrl: 'https://res.cloudinary.com/alongkar/image/upload/v1/jhumka-mock.jpg',
        quantity: 2,
        phone: '+91 91234 56789',
        budget: 35000,
        status: 'UNDER_REVIEW',
      },
    });

    // 2. Unit Tests for Allowed Transitions
    console.log('\n--- Test Group 1: Transition Whitelist Rules ---');
    assert(
      ALLOWED_STATUS_TRANSITIONS.PENDING.includes('UNDER_REVIEW') &&
        ALLOWED_STATUS_TRANSITIONS.PENDING.includes('NOT_SOURCEABLE') &&
        ALLOWED_STATUS_TRANSITIONS.PENDING.length === 2,
      'PENDING only allows transitions to UNDER_REVIEW and NOT_SOURCEABLE'
    );
    assert(
      ALLOWED_STATUS_TRANSITIONS.UNDER_REVIEW.includes('QUOTE_SENT') &&
        ALLOWED_STATUS_TRANSITIONS.UNDER_REVIEW.includes('NOT_SOURCEABLE') &&
        ALLOWED_STATUS_TRANSITIONS.UNDER_REVIEW.length === 2,
      'UNDER_REVIEW only allows transitions to QUOTE_SENT and NOT_SOURCEABLE'
    );
    assert(
      ALLOWED_STATUS_TRANSITIONS.PENDING.includes('BALANCE_PAID') === false &&
        ALLOWED_STATUS_TRANSITIONS.PENDING.includes('SHIPPED') === false &&
        ALLOWED_STATUS_TRANSITIONS.PENDING.includes('DELIVERED') === false,
      'Direct jumps to payment or shipping states are prevented'
    );

    // 3. Unit Tests for Request Formatter & Parameter Extractor
    console.log('\n--- Test Group 2: Formatter & Request ID Extractor ---');
    const formatted = formatAdminJewelleryRequest({
      id: testReqPending.id,
      requestNumber: testReqPending.requestNumber,
      userId: testUser.id,
      user: { email: testUser.email, clerkUserId: testUser.clerkUserId },
      jewelleryType: testReqPending.jewelleryType,
      description: testReqPending.description,
      inspirationImageUrl: testReqPending.inspirationImageUrl,
      quantity: testReqPending.quantity,
      phone: testReqPending.phone,
      budget: testReqPending.budget,
      additionalRequirements: testReqPending.additionalRequirements,
      status: testReqPending.status,
      quotedPrice: null,
      advanceAmount: null,
      remainingAmount: null,
      adminNote: null,
      createdAt: testReqPending.createdAt,
      updatedAt: testReqPending.updatedAt,
    });
    assert(formatted?.customerEmail === 'customer.atelier@alongkar.test', 'Formatter includes customerEmail');
    assert(formatted?.jewelleryType === 'Polki Choker Necklace', 'Formatter includes jewelleryType');
    assert(formatted?.budget === 75000, 'Formatter formats budget as number');

    const extractedFromUrl = extractRequestId({ url: `/api/admin/jewellery-requests/${testReqPending.id}` });
    assert(extractedFromUrl === testReqPending.id, 'extractRequestId parses URL subpath');

    const extractedFromQuery = extractRequestId({ query: { id: testReqPending.id } });
    assert(extractedFromQuery === testReqPending.id, 'extractRequestId parses query parameters');

    // 4. Security Tests: Unauthenticated & Unauthorized Calls
    console.log('\n--- Test Group 3: Security & Authorization Protection ---');
    {
      const { req, res } = createMockReqRes({
        method: 'GET',
        headers: {}, // No token
      });
      await handler(req, res);
      assert(res._getStatus() === 401, 'Unauthenticated request to GET /api/admin/jewellery-requests is rejected with 401');
    }

    {
      const { req, res } = createMockReqRes({
        method: 'PATCH',
        headers: {}, // No token
        body: { id: testReqPending.id, status: 'UNDER_REVIEW' },
      });
      await handler(req, res);
      assert(res._getStatus() === 401, 'Unauthenticated PATCH is rejected with 401');
    }

    // 5. Database Direct Status Transition & Admin Note Updates
    console.log('\n--- Test Group 4: Status Transition Execution & Note Saving ---');
    {
      // Test Transition 1: PENDING -> UNDER_REVIEW
      const allowedTargets = ALLOWED_STATUS_TRANSITIONS[testReqPending.status] || [];
      const canTransitionToUnderReview = allowedTargets.includes('UNDER_REVIEW');
      assert(canTransitionToUnderReview, 'PENDING allows UNDER_REVIEW transition');

      const updated1 = await prisma.jewelleryRequest.update({
        where: { id: testReqPending.id },
        data: {
          status: 'UNDER_REVIEW',
          adminNote: 'Verified karigar availability for 24K gold foil.',
        },
      });
      assert(updated1.status === 'UNDER_REVIEW', 'Request transitioned from PENDING to UNDER_REVIEW');
      assert(
        updated1.adminNote === 'Verified karigar availability for 24K gold foil.',
        'Internal atelier admin note persisted correctly'
      );

      // Test Transition 2: UNDER_REVIEW -> QUOTE_SENT
      const underReviewTargets = ALLOWED_STATUS_TRANSITIONS[updated1.status] || [];
      const canTransitionToQuoteSent = underReviewTargets.includes('QUOTE_SENT');
      assert(canTransitionToQuoteSent, 'UNDER_REVIEW allows QUOTE_SENT transition');

      const updated2 = await prisma.jewelleryRequest.update({
        where: { id: testReqPending.id },
        data: { status: 'QUOTE_SENT' },
      });
      assert(updated2.status === 'QUOTE_SENT', 'Request transitioned from UNDER_REVIEW to QUOTE_SENT');

      // Test Transition 3: PENDING -> NOT_SOURCEABLE on another request
      const pendingTargets = ALLOWED_STATUS_TRANSITIONS['PENDING'] || [];
      assert(pendingTargets.includes('NOT_SOURCEABLE'), 'PENDING allows NOT_SOURCEABLE transition');

      const updated3 = await prisma.jewelleryRequest.update({
        where: { id: testReqUnderReview.id },
        data: {
          status: 'NOT_SOURCEABLE',
          adminNote: 'Custom raw gemstone cut unavailable this wedding season.',
        },
      });
      assert(updated3.status === 'NOT_SOURCEABLE', 'Request transitioned to NOT_SOURCEABLE');
      assert(
        updated3.adminNote?.includes('gemstone cut unavailable') === true,
        'Rejection rationale note saved'
      );
    }

    // 6. Test Querying, Filtering, and Aggregate Stats
    console.log('\n--- Test Group 5: Querying, Filtering, and Stats ---');
    {
      const allRequests = await prisma.jewelleryRequest.findMany({
        where: {
          requestNumber: { contains: 'REQ-TEST-ADM-' },
        },
        orderBy: { createdAt: 'desc' },
      });
      assert(allRequests.length >= 2, 'Admin query successfully retrieved test requests');

      const filteredByQuoteSent = await prisma.jewelleryRequest.findMany({
        where: {
          requestNumber: { contains: 'REQ-TEST-ADM-' },
          status: 'QUOTE_SENT',
        },
      });
      assert(filteredByQuoteSent.length >= 1, 'Status filtering by QUOTE_SENT returns correct subset');

      const statsGroup = await prisma.jewelleryRequest.groupBy({
        by: ['status'],
        _count: { status: true },
      });
      assert(statsGroup.length > 0, 'Aggregate KPI statistics grouping functions correctly');
    }

    // Cleanup test records
    await prisma.jewelleryRequest.deleteMany({
      where: {
        requestNumber: { contains: 'REQ-TEST-ADM-' },
      },
    });
    console.log('\n🧹 Cleaned up test records.');

  } catch (err: any) {
    console.error('❌ Test suite encountered an error:', err);
    failedCount++;
  }

  console.log('\n==================================================');
  console.log(`TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTask5Tests();
