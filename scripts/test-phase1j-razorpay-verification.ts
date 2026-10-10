import './testDbGuard.js';
import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/lib/prisma.js';
import {
  handleVerifyPayment as razorpayVerifyHandler,
  handleWebhook as razorpayWebhookHandler,
  handleCreatePaymentOrder as razorpayOrderHandler,
} from '../api/payments/razorpay.js';
import ordersHandler from '../api/orders.js';
import {
  validateRazorpayCheckoutSignature,
  validateRazorpayWebhookSignature,
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

function generateCheckoutSignature(orderId: string, paymentId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function generateWebhookSignature(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  const testKeyId = 'rzp_test_alongkar12345';
  const testKeySecret = 'secret_alongkar_test_key_123456';
  const testWebhookSecret = 'webhook_secret_alongkar_test_789012';

  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

  console.log('====================================================================');
  console.log('PHASE 1J-C: RAZORPAY PAYMENT VERIFICATION & WEBHOOK RECONCILIATION');
  console.log('====================================================================\n');

  const ts = Date.now();
  const testClerkUser1 = `user_vfy_test_1_${ts}`;
  const testClerkUser2 = `user_vfy_test_2_${ts}`;

  let user1: any;
  let user2: any;
  let productA: any;
  const createdOrderIds: string[] = [];

  try {
    // ─── 1. Unit Tests: Signature Generation & Constant-Time Validation ─────
    console.log('--- 1. Unit Testing: Signature Validators & Timing-Safe Checks ---');

    const sampleOrderId = 'order_DA1234567890';
    const samplePaymentId = 'pay_EA1234567890';
    const validSig = generateCheckoutSignature(sampleOrderId, samplePaymentId, testKeySecret);
    const invalidSig = generateCheckoutSignature(sampleOrderId, samplePaymentId, 'wrong_secret_12345');

    assert(
      validateRazorpayCheckoutSignature(sampleOrderId, samplePaymentId, validSig) === true,
      'Valid Checkout HMAC-SHA256 signature passes verification'
    );
    assert(
      validateRazorpayCheckoutSignature(sampleOrderId, samplePaymentId, invalidSig) === false,
      'Tampered/wrong-secret Checkout signature is rejected'
    );
    assert(
      validateRazorpayCheckoutSignature(sampleOrderId, 'pay_tampered_id', validSig) === false,
      'Checkout signature with altered payment ID is rejected'
    );
    assert(
      validateRazorpayCheckoutSignature('order_tampered_id', samplePaymentId, validSig) === false,
      'Checkout signature with altered order ID is rejected'
    );
    assert(
      validateRazorpayCheckoutSignature('', samplePaymentId, validSig) === false,
      'Empty order ID in signature validation safely returns false'
    );

    const sampleWebhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: samplePaymentId, order_id: sampleOrderId, amount: 499900 } } },
    });
    const validWebhookSig = generateWebhookSignature(sampleWebhookPayload, testWebhookSecret);
    const invalidWebhookSig = generateWebhookSignature(sampleWebhookPayload, 'wrong_webhook_secret');

    assert(
      validateRazorpayWebhookSignature(sampleWebhookPayload, validWebhookSig) === true,
      'Valid Webhook HMAC-SHA256 signature passes verification'
    );
    assert(
      validateRazorpayWebhookSignature(sampleWebhookPayload, invalidWebhookSig) === false,
      'Tampered Webhook signature is rejected'
    );
    assert(
      validateRazorpayWebhookSignature(sampleWebhookPayload + ' ', validWebhookSig) === false,
      'Webhook signature with modified payload bytes is rejected'
    );

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

    productA = await prisma.product.create({
      data: {
        name: `Verification Royal Bangle ${ts}`,
        slug: `vfy-royal-bangle-${ts}`,
        category: 'Bangles',
        price: 3499.0,
        originalPrice: 4199.0,
        discountPercent: 16,
        description: 'Solid 22k gold plated royal bangle for verification test',
        finish: 'Antique Gold',
        baseMaterial: 'Brass',
        warranty: 'Lifetime',
        inStock: true,
        availableStock: 50,
        image: 'https://res.cloudinary.com/alongkar/image/upload/v1/bangle.jpg',
        hoverImage: 'https://res.cloudinary.com/alongkar/image/upload/v1/bangle-hover.jpg',
      },
    });

    assert(user1.id && user2.id && productA.id, 'Test users and product seeded successfully');

    // Helper to create test orders
    const createTestOrder = async (
      targetUser: any,
      orderStatus: string = 'PENDING_PAYMENT',
      paymentStatus: string = 'PENDING',
      razorpayOrderId: string | null = null,
      suffix: string = 'test'
    ) => {
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-${ts}-${suffix}`,
          userId: targetUser.id,
          status: orderStatus as any,
          paymentStatus: paymentStatus as any,
          shippingStatus: 'NOT_READY',
          subtotal: new Prisma.Decimal('3499.00'),
          discountTotal: new Prisma.Decimal('700.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('3499.00'),
          currency: 'INR',
          customerName: 'Sita Devi',
          customerEmail: targetUser.email,
          customerPhone: '9876543210',
          shippingAddressLine1: '45 Lake Temple Road',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700029',
          idempotencyKey: `idem_vfy_${ts}_${suffix}`,
          paymentProvider: razorpayOrderId ? 'RAZORPAY' : null,
          paymentOrderId: razorpayOrderId,
          items: {
            create: [
              {
                productId: productA.id,
                productName: productA.name,
                productSlug: productA.slug,
                productImage: productA.image,
                unitPrice: new Prisma.Decimal('3499.00'),
                quantity: 1,
                lineTotal: new Prisma.Decimal('3499.00'),
              },
            ],
          },
        },
        include: { items: true },
      });
      createdOrderIds.push(order.id);
      return order;
    };

    // ─── 3. Verification Endpoint: Input Validation & Security ───────────────
    console.log('\n--- 3. Verification Endpoint Input Validation & Security ---');

    const testRzpOrderId = `order_rzp_${ts}`;
    const testRzpPaymentId = `pay_rzp_${ts}`;
    const validTestSignature = generateCheckoutSignature(testRzpOrderId, testRzpPaymentId, testKeySecret);

    const order1 = await createTestOrder(user1, 'PENDING_PAYMENT', 'PENDING', testRzpOrderId, 'ord1');

    // 3.1 GET not allowed (405)
    const getRes = createMockRes();
    await razorpayVerifyHandler({ method: 'GET', _testUser: user1 }, getRes);
    assert(getRes.statusCode === 405, 'GET /api/payments/razorpay/verify rejected with 405 Method Not Allowed');

    // 3.2 Unauthenticated request (401)
    const unauthRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      unauthRes
    );
    assert(unauthRes.statusCode === 401, 'Unauthenticated verification request rejected with 401 Unauthorized');

    // 3.3 Missing required fields (400)
    const missingFields = [
      { orderId: order1.id, razorpayPaymentId: testRzpPaymentId, razorpayOrderId: testRzpOrderId }, // missing signature
      { orderId: order1.id, razorpayPaymentId: testRzpPaymentId, razorpaySignature: validTestSignature }, // missing razorpayOrderId
      { orderId: order1.id, razorpayOrderId: testRzpOrderId, razorpaySignature: validTestSignature }, // missing paymentId
      { razorpayPaymentId: testRzpPaymentId, razorpayOrderId: testRzpOrderId, razorpaySignature: validTestSignature }, // missing orderId
    ];

    for (let i = 0; i < missingFields.length; i++) {
      const missingRes = createMockRes();
      await razorpayVerifyHandler(
        {
          method: 'POST',
          _testUser: user1,
          body: missingFields[i],
        },
        missingRes
      );
      assert(missingRes.statusCode === 400, `Missing required field case ${i + 1} rejected with 400 Bad Request`);
    }

    // 3.4 Malformed verification fields (400)
    const malformedRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: 'invalid id with spaces!!',
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      malformedRes
    );
    assert(malformedRes.statusCode === 400, 'Malformed order ID rejected with 400 Bad Request');

    // 3.5 Unknown Alongkar order (404)
    const unknownOrderRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: 'cuid_nonexistent_9999999',
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      unknownOrderRes
    );
    assert(unknownOrderRes.statusCode === 404, 'Unknown Alongkar order rejected with 404 Not Found');

    // 3.6 Customer Isolation: User 2 attempts to verify User 1's order (404)
    const crossUserRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user2,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      crossUserRes
    );
    assert(crossUserRes.statusCode === 404, 'Customer isolation enforced: User 2 cannot verify User 1 order (404)');

    // 3.7 Razorpay Order ID mismatch (400)
    const mismatchOrderRes = createMockRes();
    const wrongRzpOrderId = `order_wrong_${ts}`;
    const wrongSig = generateCheckoutSignature(wrongRzpOrderId, testRzpPaymentId, testKeySecret);
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: wrongRzpOrderId,
          razorpaySignature: wrongSig,
        },
      },
      mismatchOrderRes
    );
    assert(mismatchOrderRes.statusCode === 400, 'Razorpay Order ID mismatch with DB record rejected with 400');

    // 3.8 Invalid Checkout Signature (400)
    const badSigRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: 'deadbeef00112233445566778899aabbccddeeff',
        },
      },
      badSigRes
    );
    assert(badSigRes.statusCode === 400, 'Invalid Checkout signature rejected with 400 Bad Request');

    // ─── 4. Gateway Payment State Verification & Captured Checks ─────────────
    console.log('\n--- 4. Gateway Payment State Verification & Non-Captured Handling ---');

    // 4.1 Non-captured (authorized only) payment: Must NOT mark order PAID
    const nonCapturedPayment = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 349900,
      currency: 'INR',
      status: 'authorized', // Not captured
    };

    const nonCapturedRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        _testPayment: nonCapturedPayment,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      nonCapturedRes
    );
    assert(nonCapturedRes.statusCode === 400, 'Non-captured (authorized) payment rejected from transition (400)');

    const orderCheckAfterNonCaptured = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(orderCheckAfterNonCaptured?.paymentStatus === 'PENDING', 'Payment status remains PENDING for non-captured payment');
    assert(orderCheckAfterNonCaptured?.status === 'PENDING_PAYMENT', 'Order status remains PENDING_PAYMENT');
    assert(orderCheckAfterNonCaptured?.paidAt === null, 'paidAt remains null for non-captured payment');

    // 4.2 Amount mismatch between Gateway and Alongkar Order
    const amountMismatchPayment = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 10000, // ₹100 instead of ₹3499
      currency: 'INR',
      status: 'captured',
    };

    const amountMismatchRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        _testPayment: amountMismatchPayment,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      amountMismatchRes
    );
    assert(amountMismatchRes.statusCode === 400, 'Payment amount mismatch rejected with 400 Bad Request');

    // 4.3 Currency mismatch
    const currencyMismatchPayment = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 349900,
      currency: 'USD',
      status: 'captured',
    };

    const currencyMismatchRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        _testPayment: currencyMismatchPayment,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      currencyMismatchRes
    );
    assert(currencyMismatchRes.statusCode === 400, 'Payment currency mismatch rejected with 400 Bad Request');

    // ─── 5. Successful Server-Side Verification & Atomic State Transition ─────
    console.log('\n--- 5. Successful Verification & Atomic Database Transition ---');

    const validCapturedPayment = {
      id: testRzpPaymentId,
      order_id: testRzpOrderId,
      amount: 349900,
      currency: 'INR',
      status: 'captured',
    };

    const successRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        _testPayment: validCapturedPayment,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      successRes
    );

    assert(successRes.statusCode === 200, 'Successful payment verification returns 200 OK');
    assert(successRes.data?.success === true, 'Response contains success: true');
    assert(successRes.data?.order?.paymentStatus === 'PAID', 'Response order paymentStatus is PAID');
    assert(successRes.data?.order?.status === 'CONFIRMED', 'Response order status is CONFIRMED');
    assert(successRes.data?.order?.shippingStatus === 'READY', 'Response shippingStatus is READY');

    // Verify Authoritative Database Record
    const dbOrderConfirmed = await prisma.order.findUnique({ where: { id: order1.id } });
    assert(dbOrderConfirmed?.paymentStatus === 'PAID', 'DB order paymentStatus transitioned to PAID');
    assert(dbOrderConfirmed?.status === 'CONFIRMED', 'DB order status transitioned to CONFIRMED');
    assert(dbOrderConfirmed?.shippingStatus === 'READY', 'DB shippingStatus transitioned to READY');
    assert(dbOrderConfirmed?.paidAt instanceof Date, 'DB paidAt timestamp is populated with valid date');
    assert(dbOrderConfirmed?.paymentTransactionId === testRzpPaymentId, 'DB paymentTransactionId recorded');
    assert(dbOrderConfirmed?.paymentOrderId === testRzpOrderId, 'DB paymentOrderId preserved');

    // ─── 6. Idempotent Replay Verification ───────────────────────────────────
    console.log('\n--- 6. Testing Idempotent Replay of Verified Payment ---');

    const replayRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        _testPayment: validCapturedPayment,
        body: {
          orderId: order1.id,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: testRzpOrderId,
          razorpaySignature: validTestSignature,
        },
      },
      replayRes
    );

    assert(replayRes.statusCode === 200, 'Duplicate/replay verification returns 200 OK');
    assert(replayRes.data?.alreadyPaid === true, 'Response flags alreadyPaid: true for idempotent replay');
    assert(replayRes.data?.order?.paymentStatus === 'PAID', 'Order remains PAID on replay');

    // ─── 7. Ineligible State Rejection (CANCELLED & REFUNDED) ────────────────
    console.log('\n--- 7. Ineligible State Rejection (CANCELLED / REFUNDED) ---');

    const cancelledOrder = await createTestOrder(user1, 'CANCELLED', 'CANCELLED', `order_cnc_${ts}`, 'cancelled');
    const cancelledSig = generateCheckoutSignature(`order_cnc_${ts}`, `pay_cnc_${ts}`, testKeySecret);

    const cancelledRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: cancelledOrder.id,
          razorpayPaymentId: `pay_cnc_${ts}`,
          razorpayOrderId: `order_cnc_${ts}`,
          razorpaySignature: cancelledSig,
        },
      },
      cancelledRes
    );
    assert(cancelledRes.statusCode === 400, 'Cancelled order verification rejected with 400');

    const refundedOrder = await createTestOrder(user1, 'DELIVERED', 'REFUNDED', `order_ref_${ts}`, 'refunded');
    const refundedSig = generateCheckoutSignature(`order_ref_${ts}`, `pay_ref_${ts}`, testKeySecret);

    const refundedRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: user1,
        body: {
          orderId: refundedOrder.id,
          razorpayPaymentId: `pay_ref_${ts}`,
          razorpayOrderId: `order_ref_${ts}`,
          razorpaySignature: refundedSig,
        },
      },
      refundedRes
    );
    assert(refundedRes.statusCode === 400, 'Refunded order verification rejected with 400');

    // ─── 8. Concurrency & Parallel Verification Race Requests ────────────────
    console.log('\n--- 8. Testing Concurrent Parallel Verification Requests ---');

    const raceRzpOrderId = `order_race_${ts}`;
    const raceRzpPaymentId = `pay_race_${ts}`;
    const raceOrder = await createTestOrder(user1, 'PENDING_PAYMENT', 'PENDING', raceRzpOrderId, 'race');
    const raceSig = generateCheckoutSignature(raceRzpOrderId, raceRzpPaymentId, testKeySecret);

    const racePayment = {
      id: raceRzpPaymentId,
      order_id: raceRzpOrderId,
      amount: 349900,
      currency: 'INR',
      status: 'captured',
    };

    const raceRes1 = createMockRes();
    const raceRes2 = createMockRes();

    await Promise.all([
      razorpayVerifyHandler(
        {
          method: 'POST',
          _testUser: user1,
          _testPayment: racePayment,
          body: {
            orderId: raceOrder.id,
            razorpayPaymentId: raceRzpPaymentId,
            razorpayOrderId: raceRzpOrderId,
            razorpaySignature: raceSig,
          },
        },
        raceRes1
      ),
      razorpayVerifyHandler(
        {
          method: 'POST',
          _testUser: user1,
          _testPayment: racePayment,
          body: {
            orderId: raceOrder.id,
            razorpayPaymentId: raceRzpPaymentId,
            razorpayOrderId: raceRzpOrderId,
            razorpaySignature: raceSig,
          },
        },
        raceRes2
      ),
    ]);

    assert(
      raceRes1.statusCode === 200 && raceRes2.statusCode === 200,
      'Both concurrent verification requests succeeded (200 OK)'
    );

    const raceOrderDb = await prisma.order.findUnique({ where: { id: raceOrder.id } });
    assert(raceOrderDb?.paymentStatus === 'PAID', 'Race order transitioned cleanly to PAID in DB');
    assert(raceOrderDb?.status === 'CONFIRMED', 'Race order transitioned cleanly to CONFIRMED in DB');

    // ─── 9. Webhook Endpoint: Signature & Security Verification ──────────────
    console.log('\n--- 9. Webhook Endpoint Signature & Security Verification ---');

    // 9.1 Missing Signature Header (400)
    const missingWebhookSigRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: {},
        body: { event: 'payment.captured' },
      },
      missingWebhookSigRes
    );
    assert(missingWebhookSigRes.statusCode === 400, 'Missing x-razorpay-signature header rejected with 400');

    // 9.2 Invalid Webhook Signature (400)
    const invalidWebhookRes = createMockRes();
    const mockPayloadRaw = JSON.stringify({ event: 'payment.captured' });
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': 'invalid_hex_signature_1234567890' },
        rawBody: mockPayloadRaw,
        body: JSON.parse(mockPayloadRaw),
      },
      invalidWebhookRes
    );
    assert(invalidWebhookRes.statusCode === 400, 'Invalid webhook signature rejected with 400 Bad Request');

    // ─── 10. Webhook Reconciliation: payment.captured Event ─────────────────
    console.log('\n--- 10. Webhook Event: payment.captured Reconciliation ---');

    const webhookRzpOrderId = `order_whk_${ts}`;
    const webhookRzpPaymentId = `pay_whk_${ts}`;
    const webhookOrder = await createTestOrder(user1, 'PENDING_PAYMENT', 'PENDING', webhookRzpOrderId, 'whk');

    const capturedWebhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: webhookRzpPaymentId,
            order_id: webhookRzpOrderId,
            amount: 349900,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });
    const capturedWebhookSig = generateWebhookSignature(capturedWebhookBody, testWebhookSecret);

    const capturedWebhookRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': capturedWebhookSig },
        rawBody: capturedWebhookBody,
        body: JSON.parse(capturedWebhookBody),
      },
      capturedWebhookRes
    );

    assert(capturedWebhookRes.statusCode === 200, 'payment.captured webhook responded 200 OK');
    assert(capturedWebhookRes.data?.status === 'processed', 'Webhook status reported processed');

    const whkOrderInDb = await prisma.order.findUnique({ where: { id: webhookOrder.id } });
    assert(whkOrderInDb?.paymentStatus === 'PAID', 'Webhook reconciled paymentStatus to PAID in DB');
    assert(whkOrderInDb?.status === 'CONFIRMED', 'Webhook reconciled order status to CONFIRMED in DB');
    assert(whkOrderInDb?.shippingStatus === 'READY', 'Webhook transitioned shippingStatus to READY');
    assert(whkOrderInDb?.paidAt instanceof Date, 'Webhook populated paidAt timestamp');
    assert(whkOrderInDb?.paymentTransactionId === webhookRzpPaymentId, 'Webhook recorded paymentTransactionId');

    // 10.1 Duplicate Webhook Replay
    const replayWebhookRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': capturedWebhookSig },
        rawBody: capturedWebhookBody,
        body: JSON.parse(capturedWebhookBody),
      },
      replayWebhookRes
    );
    assert(replayWebhookRes.statusCode === 200, 'Duplicate webhook replay responded 200 OK');
    assert(replayWebhookRes.data?.idempotentReplay === true, 'Duplicate webhook identified as idempotentReplay');

    // ─── 11. Webhook Reconciliation: order.paid Event ───────────────────────
    console.log('\n--- 11. Webhook Event: order.paid Reconciliation ---');

    const orderPaidRzpOrderId = `order_op_${ts}`;
    const orderPaidOrder = await createTestOrder(user1, 'PENDING_PAYMENT', 'PENDING', orderPaidRzpOrderId, 'op');

    const orderPaidBody = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: orderPaidRzpOrderId,
            amount: 349900,
            amount_paid: 349900,
            status: 'paid',
          },
        },
      },
    });
    const orderPaidSig = generateWebhookSignature(orderPaidBody, testWebhookSecret);

    const orderPaidRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': orderPaidSig },
        rawBody: orderPaidBody,
        body: JSON.parse(orderPaidBody),
      },
      orderPaidRes
    );

    assert(orderPaidRes.statusCode === 200, 'order.paid webhook responded 200 OK');
    const orderPaidDb = await prisma.order.findUnique({ where: { id: orderPaidOrder.id } });
    assert(orderPaidDb?.paymentStatus === 'PAID', 'order.paid transitioned paymentStatus to PAID');
    assert(orderPaidDb?.status === 'CONFIRMED', 'order.paid transitioned status to CONFIRMED');

    // ─── 12. Webhook Event: payment.failed Handling & Non-Downgrade Invariant ─
    console.log('\n--- 12. Webhook Event: payment.failed & Non-Downgrade Invariant ---');

    // 12.1 payment.failed on a PENDING_PAYMENT order (records sanitized reason, keeps retryable)
    const failRzpOrderId = `order_fail_${ts}`;
    const failOrder = await createTestOrder(user1, 'PENDING_PAYMENT', 'PENDING', failRzpOrderId, 'fail');

    const failedWebhookBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_fail_${ts}`,
            order_id: failRzpOrderId,
            error_description: 'Card declined by bank due to insufficient funds',
            error_code: 'BAD_REQUEST_ERROR',
          },
        },
      },
    });
    const failedWebhookSig = generateWebhookSignature(failedWebhookBody, testWebhookSecret);

    const failedWebhookRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': failedWebhookSig },
        rawBody: failedWebhookBody,
        body: JSON.parse(failedWebhookBody),
      },
      failedWebhookRes
    );

    assert(failedWebhookRes.statusCode === 200, 'payment.failed webhook responded 200 OK');
    const failOrderDb = await prisma.order.findUnique({ where: { id: failOrder.id } });
    assert(failOrderDb?.status === 'PENDING_PAYMENT', 'Order status remains PENDING_PAYMENT (retryable)');
    assert(failOrderDb?.paymentStatus === 'PENDING', 'Payment status remains PENDING (retryable)');
    assert(
      failOrderDb?.paymentFailureReason === 'Card declined by bank due to insufficient funds',
      'paymentFailureReason recorded sanitized failure description'
    );

    // 12.2 Strict Invariant: payment.failed on an ALREADY-PAID order must NEVER downgrade it!
    const paidFailWebhookBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_stale_fail_${ts}`,
            order_id: webhookRzpOrderId, // already PAID order from step 10
            error_description: 'Late timeout failure event from bank',
          },
        },
      },
    });
    const paidFailWebhookSig = generateWebhookSignature(paidFailWebhookBody, testWebhookSecret);

    const paidFailWebhookRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': paidFailWebhookSig },
        rawBody: paidFailWebhookBody,
        body: JSON.parse(paidFailWebhookBody),
      },
      paidFailWebhookRes
    );

    assert(paidFailWebhookRes.statusCode === 200, 'Stale payment.failed on paid order responded 200 OK');
    assert(paidFailWebhookRes.data?.status === 'ignored_already_paid', 'payment.failed safely ignored for already-paid order');

    const paidOrderAfterStaleFail = await prisma.order.findUnique({ where: { id: webhookOrder.id } });
    assert(paidOrderAfterStaleFail?.paymentStatus === 'PAID', 'Strict Invariant: Already PAID order is NEVER downgraded');
    assert(paidOrderAfterStaleFail?.status === 'CONFIRMED', 'Strict Invariant: Already CONFIRMED order remains CONFIRMED');

    // ─── 13. Security & Secret Leakage Checks ────────────────────────────────
    console.log('\n--- 13. Security & Credential Leakage Protection ---');

    const allResponsesString = [
      JSON.stringify(successRes.data || {}),
      JSON.stringify(replayRes.data || {}),
      JSON.stringify(capturedWebhookRes.data || {}),
      JSON.stringify(orderPaidRes.data || {}),
      JSON.stringify(failedWebhookRes.data || {}),
    ].join(' ');

    assert(!allResponsesString.includes(testKeySecret), 'RAZORPAY_KEY_SECRET never leaked in any response');
    assert(!allResponsesString.includes(testWebhookSecret), 'RAZORPAY_WEBHOOK_SECRET never leaked in any response');
    assert(!allResponsesString.includes('key_secret'), 'key_secret field never appears in any response');

  } catch (err: any) {
    console.error('Unexpected test error during Phase 1J-C:', err);
    assert(false, `Unexpected test error: ${err.message}`);
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
    const userIds = [user1?.id, user2?.id].filter(Boolean);
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

  console.log('\n====================================================================');
  console.log(`PHASE 1J-C TEST RESULTS: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled fatal error in Phase 1J-C tests:', err);
  process.exit(1);
});
