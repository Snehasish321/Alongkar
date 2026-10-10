import './testDbGuard.js';
import prisma from '../src/lib/prisma.js';
import jewelleryRequestHandler, {
  validateJewelleryRequestCreatePayload,
  isValidUrl,
  isValidPhone,
  generateRequestNumber,
  formatCustomerJewelleryRequest,
} from '../api/jewellery-requests.js';
import { Prisma } from '@prisma/client';

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

async function runTask2Tests() {
  console.log('====================================================');
  console.log('TASK 2: JEWELLERY REQUEST BACKEND API & VALIDATION TESTS');
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

  // ==============================================================
  // Test Suite 1: Utility & Validation Functions
  // ==============================================================
  console.log('--- Test Suite 1: Validation Rules & Helpers ---');

  // URL Validation
  assert(isValidUrl('https://example.com/image.jpg') === true, 'Valid HTTPS URL is accepted');
  assert(isValidUrl('http://example.com/pic.png') === true, 'Valid HTTP URL is accepted');
  assert(isValidUrl('ftp://example.com/file') === false, 'Non-HTTP(S) protocol (ftp) is rejected');
  assert(isValidUrl('not-a-url') === false, 'Arbitrary string is rejected as invalid URL');
  assert(isValidUrl('') === false, 'Empty string is rejected as URL');

  // Phone Validation (Indian phone numbers)
  assert(isValidPhone('9876543210') === true, 'Valid 10-digit Indian mobile is accepted');
  assert(isValidPhone('+919876543210') === true, 'Mobile with +91 prefix is accepted');
  assert(isValidPhone('+91 98765 43210') === true, 'Mobile with +91 and spaces is accepted');
  assert(isValidPhone('09876543210') === true, 'Mobile with 0 prefix is accepted');
  assert(isValidPhone('98765-43210') === true, 'Mobile with hyphen is accepted');
  assert(isValidPhone('1234567890') === false, 'Mobile starting with invalid digit (1) is rejected');
  assert(isValidPhone('98765') === false, 'Short phone number is rejected');
  assert(isValidPhone('abcdefghij') === false, 'Non-numeric string is rejected');

  // Request Number Generation
  const reqNum1 = generateRequestNumber();
  const reqNum2 = generateRequestNumber();
  assert(reqNum1.startsWith('REQ-'), 'Request number starts with REQ- prefix');
  assert(reqNum1 !== reqNum2, 'Consecutive generated request numbers are unique');
  assert(/^REQ-\d{8}-[A-Z0-9]{5}$/.test(reqNum1), 'Request number follows REQ-YYYYMMDD-XXXXX format');

  // Payload Validation - Required Fields
  const validPayload = {
    jewelleryType: 'Jhumka',
    description: 'Traditional temple design jhumkas with pearl drops.',
    inspirationImageUrl: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908',
    quantity: 2,
    phone: '9876543210',
    budget: 2500,
    additionalRequirements: 'Lightweight polish',
  };

  const validResult = validateJewelleryRequestCreatePayload(validPayload);
  assert(validResult.errors.length === 0, 'Valid payload passes validation');
  assert(validResult.data?.jewelleryType === 'Jhumka', 'jewelleryType is correctly parsed');
  assert(validResult.data?.quantity === 2, 'quantity is correctly parsed');
  assert(validResult.data?.budget === 2500, 'budget is correctly parsed');

  // Missing jewelleryType
  const missingType = validateJewelleryRequestCreatePayload({ ...validPayload, jewelleryType: '' });
  assert(missingType.errors.some((e) => e.field === 'jewelleryType'), 'Missing jewelleryType is rejected');

  // Whitespace only description
  const blankDesc = validateJewelleryRequestCreatePayload({ ...validPayload, description: '   ' });
  assert(blankDesc.errors.some((e) => e.field === 'description'), 'Whitespace-only description is rejected');

  // Missing inspirationImageUrl
  const missingImg = validateJewelleryRequestCreatePayload({ ...validPayload, inspirationImageUrl: '' });
  assert(missingImg.errors.some((e) => e.field === 'inspirationImageUrl'), 'Missing inspirationImageUrl is rejected');

  // Invalid image URL
  const badImgUrl = validateJewelleryRequestCreatePayload({ ...validPayload, inspirationImageUrl: 'invalid-url' });
  assert(badImgUrl.errors.some((e) => e.field === 'inspirationImageUrl'), 'Invalid image URL is rejected');

  // Invalid quantity (0, negative, float)
  const zeroQty = validateJewelleryRequestCreatePayload({ ...validPayload, quantity: 0 });
  assert(zeroQty.errors.some((e) => e.field === 'quantity'), 'Zero quantity is rejected');

  const negQty = validateJewelleryRequestCreatePayload({ ...validPayload, quantity: -2 });
  assert(negQty.errors.some((e) => e.field === 'quantity'), 'Negative quantity is rejected');

  const floatQty = validateJewelleryRequestCreatePayload({ ...validPayload, quantity: 1.5 });
  assert(floatQty.errors.some((e) => e.field === 'quantity'), 'Float quantity is rejected');

  // Default quantity when omitted
  const { quantity: _, ...payloadWithoutQty } = validPayload;
  const noQtyResult = validateJewelleryRequestCreatePayload(payloadWithoutQty);
  assert(noQtyResult.data?.quantity === 1, 'Quantity defaults to 1 when omitted');

  // Budget validation: number, string, range, omitted
  const rangeBudgetResult = validateJewelleryRequestCreatePayload({ ...validPayload, budget: '1000-2500' });
  assert(rangeBudgetResult.data?.budget === 2500, 'Range string budget (1000-2500) parsed properly');

  const omittedBudgetResult = validateJewelleryRequestCreatePayload({ ...payloadWithoutQty, budget: undefined });
  assert(omittedBudgetResult.data?.budget === null, 'Omitted budget defaults to null without error');

  const negBudgetResult = validateJewelleryRequestCreatePayload({ ...validPayload, budget: -500 });
  assert(negBudgetResult.errors.some((e) => e.field === 'budget'), 'Negative budget is rejected');

  // ==============================================================
  // Test Suite 2: API Handler Unauthenticated Access Control
  // ==============================================================
  console.log('\n--- Test Suite 2: Unauthenticated Endpoint Access ---');

  // Unauthenticated POST
  const unauthPostReq = {
    method: 'POST',
    headers: {},
    body: validPayload,
  };
  const unauthPostRes = createMockRes();
  await jewelleryRequestHandler(unauthPostReq, unauthPostRes);
  assert(unauthPostRes.statusCode === 401, 'Unauthenticated POST request is rejected with HTTP 401');
  assert(unauthPostRes.data?.success === false, 'Unauthenticated POST response has success: false');

  // Unauthenticated GET
  const unauthGetReq = {
    method: 'GET',
    headers: {},
  };
  const unauthGetRes = createMockRes();
  await jewelleryRequestHandler(unauthGetReq, unauthGetRes);
  assert(unauthGetRes.statusCode === 401, 'Unauthenticated GET request is rejected with HTTP 401');
  assert(unauthGetRes.data?.success === false, 'Unauthenticated GET response has success: false');

  // Method Not Allowed (PUT / DELETE)
  const unauthPutReq = { method: 'PUT', headers: {} };
  const unauthPutRes = createMockRes();
  await jewelleryRequestHandler(unauthPutReq, unauthPutRes);
  assert(unauthPutRes.statusCode === 401, 'Unauthenticated PUT rejected with 401 before method check');

  // ==============================================================
  // Test Suite 3: Database & Isolation Tests
  // ==============================================================
  console.log('\n--- Test Suite 3: Database Storage & User Isolation ---');

  const testClerkUser1 = `test_clerk_user_req_${Date.now()}_1`;
  const testClerkUser2 = `test_clerk_user_req_${Date.now()}_2`;

  let user1: any = null;
  let user2: any = null;
  const createdRequestIds: string[] = [];

  try {
    // Create test user 1
    user1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: 'user1_test@alongkar.in',
      },
    });

    // Create test user 2
    user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: 'user2_test@alongkar.in',
      },
    });

    assert(Boolean(user1 && user1.id), 'Test User 1 created in PostgreSQL');
    assert(Boolean(user2 && user2.id), 'Test User 2 created in PostgreSQL');

    // Create a request for User 1 directly in Prisma to test model fields & default status
    const reqNumber1 = generateRequestNumber();
    const createdReq1 = await prisma.jewelleryRequest.create({
      data: {
        requestNumber: reqNumber1,
        userId: user1.id,
        jewelleryType: 'Necklace',
        description: 'Antique finish choker necklace with ruby accents',
        inspirationImageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        budget: new Prisma.Decimal(4500),
        quantity: 1,
        phone: '9876543210',
        additionalRequirements: 'Delivery before Diwali',
        status: 'PENDING',
        adminNote: 'INTERNAL: Source from Kolkata craftsman',
        quotedPrice: new Prisma.Decimal(5000),
        advanceAmount: new Prisma.Decimal(1500),
        remainingAmount: new Prisma.Decimal(3500),
      },
    });
    createdRequestIds.push(createdReq1.id);

    assert(Boolean(createdReq1.id), 'JewelleryRequest record created in database');
    assert(createdReq1.userId === user1.id, 'Request is linked to User 1 ID');
    assert(createdReq1.status === 'PENDING', 'Initial status is PENDING');
    assert(createdReq1.requestNumber === reqNumber1, 'Request number stored correctly');

    // Create a request for User 2
    const reqNumber2 = generateRequestNumber();
    const createdReq2 = await prisma.jewelleryRequest.create({
      data: {
        requestNumber: reqNumber2,
        userId: user2.id,
        jewelleryType: 'Bangle',
        description: 'Pair of Lakshmi engraved temple kadas',
        inspirationImageUrl: 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed',
        budget: new Prisma.Decimal(3000),
        quantity: 2,
        phone: '9123456780',
        status: 'PENDING',
      },
    });
    createdRequestIds.push(createdReq2.id);

    // Test Customer Response Formatter Excludes Admin-Only Fields
    const formattedReq1 = formatCustomerJewelleryRequest(createdReq1);
    assert(formattedReq1 !== null, 'Customer formatter returns object');
    assert(formattedReq1?.id === createdReq1.id, 'Formatted object contains request ID');
    assert(formattedReq1?.requestNumber === reqNumber1, 'Formatted object contains requestNumber');
    assert((formattedReq1 as any).adminNote === undefined, 'Admin note is strictly excluded from customer response');
    assert((formattedReq1 as any).quotedPrice === undefined, 'Quoted price is strictly excluded from customer response');
    assert((formattedReq1 as any).advanceAmount === undefined, 'Advance amount is strictly excluded from customer response');
    assert((formattedReq1 as any).remainingAmount === undefined, 'Remaining amount is strictly excluded from customer response');
    assert(formattedReq1?.budget === 4500, 'Budget decimal is formatted as number');

    // Test User Isolation Querying
    const user1Requests = await prisma.jewelleryRequest.findMany({
      where: { userId: user1.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(user1Requests.length === 1, 'User 1 queries return only 1 request');
    assert(user1Requests[0].id === createdReq1.id, "User 1 query returns User 1's request");

    const user2Requests = await prisma.jewelleryRequest.findMany({
      where: { userId: user2.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(user2Requests.length === 1, 'User 2 queries return only 1 request');
    assert(user2Requests[0].id === createdReq2.id, "User 2 query returns User 2's request");
    assert(user2Requests[0].id !== createdReq1.id, "User 2 cannot see User 1's request");
  } finally {
    // Cleanup created test records
    if (createdRequestIds.length > 0) {
      await prisma.jewelleryRequest.deleteMany({
        where: { id: { in: createdRequestIds } },
      });
    }
    if (user1) {
      await prisma.user.delete({ where: { id: user1.id } }).catch(() => {});
    }
    if (user2) {
      await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
    }
    console.log('🧹 Cleaned up test database records.');
  }

  // ==============================================================
  // Summary
  // ==============================================================
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask2Tests()
  .catch((err) => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
