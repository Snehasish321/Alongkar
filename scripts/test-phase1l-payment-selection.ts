import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import ordersHandler from '../api/orders.js';
import {
  calculateAuthoritativePricing,
  validateAndCalculateCoupon,
  normalizePaymentMethod,
} from '../api/_utils/pricing.js';
import {
  handleCreatePaymentOrder as paymentOrderHandler,
  handleVerifyPayment as verifyHandler,
  handleReconcilePayment as reconcileHandler,
} from '../api/payments/razorpay.js';
import crypto from 'crypto';

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

async function runPaymentSelectionPhase1LTests() {
  process.env.NODE_ENV = 'test';
  if (!process.env.RAZORPAY_KEY_ID) {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_TjwH5wwovsHM2p';
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    process.env.RAZORPAY_KEY_SECRET = 'DHbXAF96pEIZk1tB4dvaukyU';
  }

  console.log('====================================================================');
  console.log('PHASE 1L-A: PAYMENT METHOD SELECTION & PAYMENT-AWARE PRICING TESTS');
  console.log('====================================================================\n');

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

  // 1. Fetch real in-stock product
  const products = await prisma.product.findMany({ where: { inStock: true }, take: 2 });
  if (products.length < 1) {
    console.error('❌ Need at least 1 in-stock product in database to run tests.');
    process.exit(1);
  }

  const testProduct = products[0];
  const ts = Date.now();
  const testClerkUser1 = `clerk_phase1l_user1_${ts}`;
  const testClerkUser2 = `clerk_phase1l_user2_${ts}`;

  let user1DbId = '';
  let user2DbId = '';
  let codOrderId = '';
  let rzpOrderId = '';

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // Section 1: Pure Pricing Engine & PREPAID5 Payment Method Tests
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- 1. Pricing Engine & Payment Method Discount Tests ---');

    // 1.1 Payment method normalizer
    assert(normalizePaymentMethod('RAZORPAY') === 'RAZORPAY', 'normalizePaymentMethod("RAZORPAY") returns RAZORPAY');
    assert(normalizePaymentMethod('cod') === 'COD', 'normalizePaymentMethod("cod") returns COD');
    assert(normalizePaymentMethod('COD') === 'COD', 'normalizePaymentMethod("COD") returns COD');
    assert(normalizePaymentMethod(undefined) === 'RAZORPAY', 'normalizePaymentMethod(undefined) defaults to RAZORPAY');

    // 1.2 PREPAID5 with Razorpay online payment
    const rzpCoupon = validateAndCalculateCoupon(999, 'PREPAID5', 'RAZORPAY');
    assert(rzpCoupon.isValid === true, 'PREPAID5 is valid for RAZORPAY');
    assert(rzpCoupon.discountAmount === 50, 'PREPAID5 gives ₹50 (5%) discount on ₹999 subtotal with RAZORPAY');

    const rzpPricing = calculateAuthoritativePricing([{ unitPrice: 999, quantity: 1 }], 'PREPAID5', 'RAZORPAY');
    assert(rzpPricing.success === true, 'calculateAuthoritativePricing succeeds for RAZORPAY + PREPAID5');
    assert(rzpPricing.pricing?.discountTotal === 50, 'Razorpay discountTotal is ₹50');
    assert(rzpPricing.pricing?.grandTotal === 949, 'Razorpay grandTotal is ₹949 (₹999 - ₹50 + ₹0 shipping)');

    // 1.3 PREPAID5 with COD payment
    const codCoupon = validateAndCalculateCoupon(999, 'PREPAID5', 'COD');
    assert(codCoupon.isValid === true, 'PREPAID5 evaluation succeeds for COD without error');
    assert(codCoupon.discountAmount === 0, 'PREPAID5 gives ₹0 discount for COD payment');

    const codPricing = calculateAuthoritativePricing([{ unitPrice: 999, quantity: 1 }], 'PREPAID5', 'COD');
    assert(codPricing.success === true, 'calculateAuthoritativePricing succeeds for COD + PREPAID5');
    assert(codPricing.pricing?.discountTotal === 0, 'COD discountTotal is ₹0 for PREPAID5');
    assert(codPricing.pricing?.grandTotal === 999, 'COD grandTotal is ₹999 (full price, no PREPAID5 discount)');

    // 1.4 Non-payment-method-dependent coupons (e.g. ALONGKAR10) stack with PREPAID5 on RAZORPAY, but not on COD
    const rzpAlongkar = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'ALONGKAR10', 'RAZORPAY');
    assert(rzpAlongkar.pricing?.discountTotal === 145, 'ALONGKAR10 stacks with PREPAID5: gives ₹145 (₹100 + ₹45) discount on RAZORPAY');
    assert(rzpAlongkar.pricing?.grandTotal === 855, 'ALONGKAR10 gives ₹855 grandTotal on RAZORPAY');

    const codAlongkar = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'ALONGKAR10', 'COD');
    assert(codAlongkar.pricing?.discountTotal === 100, 'ALONGKAR10 gives 10% (₹100) discount on COD (PREPAID5 is ₹0)');
    assert(codAlongkar.pricing?.grandTotal === 900, 'ALONGKAR10 gives ₹900 grandTotal on COD');

    // ──────────────────────────────────────────────────────────────────────────
    // Section 2: Setup Database Users & Carts for End-to-End Tests
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Setting Up Test Users & Carts ---');

    const user1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: 'user1_phase1l@example.com',
      },
    });
    user1DbId = user1.id;

    const cart1 = await prisma.cart.create({
      data: {
        userId: user1.id,
      },
    });

    await prisma.cartItem.create({
      data: {
        cartId: cart1.id,
        productId: testProduct.id,
        quantity: 1,
      },
    });

    const user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: 'user2_phase1l@example.com',
      },
    });
    user2DbId = user2.id;

    const cart2 = await prisma.cart.create({
      data: {
        userId: user2.id,
      },
    });

    await prisma.cartItem.create({
      data: {
        cartId: cart2.id,
        productId: testProduct.id,
        quantity: 1,
      },
    });

    assert(Boolean(user1DbId && user2DbId), 'Test users and carts created in database');

    // ──────────────────────────────────────────────────────────────────────────
    // Section 3: Cash on Delivery (COD) Order Creation & Cart Clearing
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Cash on Delivery (COD) Flow Tests ---');

    const codPayload = {
      customerName: 'Aarav Roy (COD Client)',
      customerPhone: '9876543210',
      customerEmail: 'aarav.cod@example.com',
      shippingAddress: {
        line1: '45 Lake Temple Road',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700029',
        country: 'India',
      },
      idempotencyKey: `idemp_cod_test_${ts}`,
      couponCode: 'PREPAID5', // Client attempts to send PREPAID5 with COD
      paymentMethod: 'COD',
    };

    const mockReqCod: any = {
      method: 'POST',
      _testUser: user1,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testClerkUser1}`,
      },
      body: codPayload,
      query: {},
    };
    const mockResCod = createMockRes();

    await ordersHandler(mockReqCod, mockResCod);

    assert(mockResCod.statusCode === 201, 'POST /api/orders with COD returns HTTP 201 Created');
    const createdCodOrder = mockResCod.data?.order;
    codOrderId = createdCodOrder?.id;

    assert(createdCodOrder?.status === 'CONFIRMED', 'COD order is created with status CONFIRMED');
    assert(createdCodOrder?.paymentStatus === 'PENDING', 'COD order is created with paymentStatus PENDING (not marked PAID)');
    assert(createdCodOrder?.paymentProvider === 'COD', 'COD order records paymentProvider as "COD"');
    assert(createdCodOrder?.discountTotal === 0, 'Server enforced discountTotal = 0 (PREPAID5 blocked on COD)');
    assert(createdCodOrder?.grandTotal === testProduct.price, `Server calculated grandTotal = ₹${testProduct.price} without PREPAID5 discount`);

    // Verify User 1 cart is cleared in DB atomically
    const user1CartItemsAfterCod = await prisma.cartItem.findMany({
      where: { cartId: cart1.id },
    });
    assert(user1CartItemsAfterCod.length === 0, 'User 1 cart is atomically cleared in DB upon successful COD order creation');

    // ──────────────────────────────────────────────────────────────────────────
    // Section 4: Razorpay Online Payment Flow & Cart Persistence
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Razorpay Online Flow Tests ---');

    const rzpPayload = {
      customerName: 'Ananya Sen (Online Client)',
      customerPhone: '9830012345',
      customerEmail: 'ananya.rzp@example.com',
      shippingAddress: {
        line1: '12 Salt Lake Sector V',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700091',
        country: 'India',
      },
      idempotencyKey: `idemp_rzp_test_${ts}`,
      couponCode: 'PREPAID5',
      paymentMethod: 'RAZORPAY',
    };

    const mockReqRzp: any = {
      method: 'POST',
      _testUser: user2,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testClerkUser2}`,
      },
      body: rzpPayload,
      query: {},
    };
    const mockResRzp = createMockRes();

    await ordersHandler(mockReqRzp, mockResRzp);

    assert(mockResRzp.statusCode === 201, 'POST /api/orders with RAZORPAY returns HTTP 201 Created');
    const createdRzpOrder = mockResRzp.data?.order;
    rzpOrderId = createdRzpOrder?.id;

    assert(createdRzpOrder?.status === 'PENDING_PAYMENT', 'Razorpay order is created with status PENDING_PAYMENT');
    assert(createdRzpOrder?.paymentStatus === 'PENDING', 'Razorpay order is created with paymentStatus PENDING');
    assert(createdRzpOrder?.paymentProvider === 'RAZORPAY', 'Razorpay order records paymentProvider as "RAZORPAY"');
    const expectedRzpDiscount = Math.round((testProduct.price * 5) / 100);
    const expectedRzpGrandTotal = testProduct.price - expectedRzpDiscount;
    assert(createdRzpOrder?.discountTotal === expectedRzpDiscount, `Server calculated discountTotal = ₹${expectedRzpDiscount} for PREPAID5 on Razorpay`);
    assert(createdRzpOrder?.grandTotal === expectedRzpGrandTotal, `Server calculated grandTotal = ₹${expectedRzpGrandTotal} for Razorpay order`);

    // Verify User 2 cart is NOT cleared while Razorpay payment is pending
    const user2CartItemsWhilePending = await prisma.cartItem.findMany({
      where: { cartId: cart2.id },
    });
    assert(user2CartItemsWhilePending.length === 1, 'User 2 cart remains persistent while Razorpay payment is pending');

    // ──────────────────────────────────────────────────────────────────────────
    // Section 5: Gateway Order Creation & Verification for Razorpay
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Razorpay Gateway Order Creation & Verification ---');

    const mockReqPaymentOrder: any = {
      method: 'POST',
      _testUser: user2,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testClerkUser2}`,
      },
      body: { orderId: rzpOrderId },
    };
    const mockResPaymentOrder = createMockRes();

    await paymentOrderHandler(mockReqPaymentOrder, mockResPaymentOrder);

    assert(mockResPaymentOrder.statusCode === 201 || mockResPaymentOrder.statusCode === 200, 'POST /api/payments/razorpay/order returns HTTP 201/200');
    const rzpGatewayOrderId = mockResPaymentOrder.data?.razorpayOrderId;
    assert(Boolean(rzpGatewayOrderId), 'Valid Razorpay Gateway Order ID returned');
    assert(mockResPaymentOrder.data?.amount === expectedRzpGrandTotal * 100, `Gateway order amount is ₹${expectedRzpGrandTotal} in paise`);

    // Generate valid HMAC signature for mock verification
    const mockPaymentId = `pay_sim_${Date.now()}`;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'DHbXAF96pEIZk1tB4dvaukyU';
    const hmacPayload = `${rzpGatewayOrderId}|${mockPaymentId}`;
    const validSignature = crypto.createHmac('sha256', secret).update(hmacPayload).digest('hex');

    const mockSuccessPayment = {
      id: mockPaymentId,
      entity: 'payment',
      order_id: rzpGatewayOrderId,
      amount: expectedRzpGrandTotal * 100,
      currency: 'INR',
      status: 'captured',
      captured: true,
    };

    const mockReqVerify: any = {
      method: 'POST',
      _testUser: user2,
      _testPayment: mockSuccessPayment,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${testClerkUser2}`,
      },
      body: {
        orderId: rzpOrderId,
        razorpayPaymentId: mockPaymentId,
        razorpayOrderId: rzpGatewayOrderId,
        razorpaySignature: validSignature,
      },
    };
    const mockResVerify = createMockRes();

    await verifyHandler(mockReqVerify, mockResVerify);

    assert(mockResVerify.statusCode === 200, 'POST /api/payments/razorpay/verify returns HTTP 200');
    assert(mockResVerify.data?.success === true, 'Payment verification success flag is true');

    const updatedRzpOrder = await prisma.order.findUnique({ where: { id: rzpOrderId } });
    assert(updatedRzpOrder?.status === 'CONFIRMED', 'Order transitioned to CONFIRMED after payment verification');
    assert(updatedRzpOrder?.paymentStatus === 'PAID', 'Order transitioned to PAID after payment verification');

    // Cart is now cleared after verified payment
    const user2CartItemsAfterPaid = await prisma.cartItem.findMany({
      where: { cartId: cart2.id },
    });
    assert(user2CartItemsAfterPaid.length === 0, 'User 2 cart is cleared after successful payment verification');

  } catch (err: any) {
    console.error('❌ Unexpected error during Phase 1L-A test execution:', err);
    failed++;
  } finally {
    // Teardown
    console.log('\n--- Cleaning Up Phase 1L Test Data ---');
    if (codOrderId || rzpOrderId) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: [codOrderId, rzpOrderId].filter(Boolean) } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: [codOrderId, rzpOrderId].filter(Boolean) } },
      });
    }
    if (user1DbId || user2DbId) {
      await prisma.cartItem.deleteMany({
        where: { cart: { userId: { in: [user1DbId, user2DbId].filter(Boolean) } } },
      });
      await prisma.cart.deleteMany({
        where: { userId: { in: [user1DbId, user2DbId].filter(Boolean) } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [user1DbId, user2DbId].filter(Boolean) } },
      });
    }
    console.log('Teardown complete.');
  }

  console.log('\n====================================================================');
  console.log(`PHASE 1L-A TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentSelectionPhase1LTests();
