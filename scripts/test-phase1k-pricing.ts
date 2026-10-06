import 'dotenv/config';

process.env.NODE_ENV = 'test';
if (!process.env.RAZORPAY_KEY_ID) {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_TjwH5wwovsHM2p';
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  process.env.RAZORPAY_KEY_SECRET = 'DHbXAF96pEIZk1tB4dvaukyU';
}

import prisma from '../src/lib/prisma.js';
import ordersHandler from '../api/orders.js';
import { handleCreatePaymentOrder as razorpayOrderHandler } from '../api/payments/razorpay.js';
import {
  normalizeCouponCode,
  validateAndCalculateCoupon,
  calculateShippingFee,
  calculateAuthoritativePricing,
  PROMO_CODES,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
} from '../api/_utils/pricing.js';

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

function createMockReq(options: {
  method?: string;
  url?: string;
  body?: any;
  headers?: Record<string, string>;
  user?: any;
}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/api/orders',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer mock_token',
      ...(options.headers || {}),
    },
    body: options.body || {},
    _testUser: options.user,
  };
}

async function runPhase1KTests() {
  console.log('===============================================================');
  console.log('PHASE 1K: SERVER-AUTHORITATIVE PRICING, COUPONS & SHIPPING');
  console.log('===============================================================');

  // ==========================================================================
  // SECTION 1: Unit Tests for Pricing Helper Functions
  // ==========================================================================
  console.log('\n--- 1. Unit Testing Pricing & Coupon Helper Functions ---');

  // Normalization
  assert(normalizeCouponCode('alongkar10') === 'ALONGKAR10', 'normalizeCouponCode converts lowercase to uppercase');
  assert(normalizeCouponCode('  ALONGKAR10  ') === 'ALONGKAR10', 'normalizeCouponCode trims leading/trailing whitespace');
  assert(normalizeCouponCode('') === null, 'normalizeCouponCode returns null for empty string');
  assert(normalizeCouponCode(null) === null, 'normalizeCouponCode returns null for null');
  assert(normalizeCouponCode(undefined) === null, 'normalizeCouponCode returns null for undefined');

  // Shipping Calculation
  assert(calculateShippingFee(0) === 0, 'Shipping fee is 0 for 0 subtotal');
  assert(calculateShippingFee(100) === STANDARD_SHIPPING_FEE, `Shipping fee is ₹${STANDARD_SHIPPING_FEE} for ₹100 subtotal`);
  assert(calculateShippingFee(498.99) === STANDARD_SHIPPING_FEE, `Shipping fee is ₹${STANDARD_SHIPPING_FEE} just below threshold (₹498.99)`);
  assert(calculateShippingFee(FREE_SHIPPING_THRESHOLD) === 0, `Shipping fee is ₹0 at exact threshold (₹${FREE_SHIPPING_THRESHOLD})`);
  assert(calculateShippingFee(1500) === 0, 'Shipping fee is ₹0 above threshold (₹1500)');

  // Coupon: ALONGKAR10 (10%)
  const alongkar10Res = validateAndCalculateCoupon(2000, 'ALONGKAR10');
  assert(alongkar10Res.isValid === true, 'ALONGKAR10 is valid for ₹2000 subtotal');
  assert(alongkar10Res.discountAmount === 200, 'ALONGKAR10 calculates exact 10% discount (₹200 on ₹2000)');

  // Coupon: PREPAID5 (5%)
  const prepaid5Res = validateAndCalculateCoupon(3000, 'PREPAID5');
  assert(prepaid5Res.isValid === true, 'PREPAID5 is valid for ₹3000 subtotal');
  assert(prepaid5Res.discountAmount === 150, 'PREPAID5 calculates exact 5% discount (₹150 on ₹3000)');

  // Coupon: FESTIVE500 (Flat ₹500, min ₹2500)
  const festiveEligible = validateAndCalculateCoupon(3000, 'FESTIVE500');
  assert(festiveEligible.isValid === true, 'FESTIVE500 is valid for ₹3000 (>= ₹2500 minOrder)');
  assert(festiveEligible.discountAmount === 500, 'FESTIVE500 gives flat ₹500 discount');

  const festiveIneligible = validateAndCalculateCoupon(2000, 'FESTIVE500');
  assert(festiveIneligible.isValid === false, 'FESTIVE500 is invalid for ₹2000 (< ₹2500 minOrder)');
  assert(festiveIneligible.discountAmount === 0, 'FESTIVE500 gives 0 discount when ineligible');
  assert(typeof festiveIneligible.errorMessage === 'string', 'FESTIVE500 provides clear error message when ineligible');

  // Coupon: WELCOME100 (Flat ₹100, min ₹999)
  const welcomeEligible = validateAndCalculateCoupon(1500, 'WELCOME100');
  assert(welcomeEligible.isValid === true, 'WELCOME100 is valid for ₹1500 (>= ₹999 minOrder)');
  assert(welcomeEligible.discountAmount === 100, 'WELCOME100 gives flat ₹100 discount');

  const welcomeIneligible = validateAndCalculateCoupon(800, 'WELCOME100');
  assert(welcomeIneligible.isValid === false, 'WELCOME100 is invalid for ₹800 (< ₹999 minOrder)');
  assert(welcomeIneligible.discountAmount === 0, 'WELCOME100 gives 0 discount when ineligible');

  // Invalid / Unknown Coupons
  const unknownCouponRes = validateAndCalculateCoupon(2000, 'INVALID_CODE_999');
  assert(unknownCouponRes.isValid === false, 'Unknown coupon is marked invalid');
  assert(unknownCouponRes.discountAmount === 0, 'Unknown coupon gives 0 discount');

  // Authoritative Order Pricing Calculation
  const orderPricingRes = calculateAuthoritativePricing(
    [
      { unitPrice: 1200, quantity: 2 }, // 2400
      { unitPrice: 300, quantity: 1 },  // 300 -> subtotal = 2700
    ],
    'ALONGKAR10' // 10% of 2700 = 270
  );
  assert(orderPricingRes.success === true, 'calculateAuthoritativePricing succeeds');
  if (orderPricingRes.pricing) {
    assert(orderPricingRes.pricing.subtotal === 2700, 'Subtotal is exactly ₹2700');
    assert(orderPricingRes.pricing.discountTotal === 270, 'Discount is exactly ₹270 (10%)');
    assert(orderPricingRes.pricing.shippingFee === 0, 'Shipping is ₹0 (subtotal >= 499)');
    assert(orderPricingRes.pricing.grandTotal === 2430, 'Grand total is exactly ₹2430 (2700 - 270 + 0)');
  }

  // ==========================================================================
  // SECTION 2: Database Setup & Integration Tests
  // ==========================================================================
  console.log('\n--- 2. Setting Up Database Test Entities ---');

  const testSuffix = `p1k_${Date.now()}`;
  const testUser1ClerkId = `user_clerk_p1k_1_${Date.now()}`;
  const testUser2ClerkId = `user_clerk_p1k_2_${Date.now()}`;

  const user1 = await prisma.user.create({
    data: {
      clerkUserId: testUser1ClerkId,
      email: `customer1_${testSuffix}@example.com`,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      clerkUserId: testUser2ClerkId,
      email: `customer2_${testSuffix}@example.com`,
    },
  });

  const productLow = await prisma.product.create({
    data: {
      name: `Low Value Ring ${testSuffix}`,
      slug: `low-value-ring-${testSuffix}`,
      category: 'Rings',
      price: 350.0,
      originalPrice: 500.0,
      discountPercent: 30,
      image: 'https://example.com/ring.jpg',
      hoverImage: 'https://example.com/ring-hover.jpg',
      description: 'Handcrafted ring',
      finish: 'Gold',
      baseMaterial: 'Brass',
      warranty: '1 Year',
      inStock: true,
    },
  });

  const productMid = await prisma.product.create({
    data: {
      name: `Mid Value Necklace ${testSuffix}`,
      slug: `mid-value-necklace-${testSuffix}`,
      category: 'Necklaces',
      price: 1500.0,
      originalPrice: 2000.0,
      discountPercent: 25,
      image: 'https://example.com/necklace.jpg',
      hoverImage: 'https://example.com/necklace-hover.jpg',
      description: 'Royal polki necklace',
      finish: 'Gold',
      baseMaterial: 'Silver',
      warranty: '1 Year',
      inStock: true,
    },
  });

  const productHigh = await prisma.product.create({
    data: {
      name: `High Value Bridal Set ${testSuffix}`,
      slug: `high-value-set-${testSuffix}`,
      category: 'Sets',
      price: 3200.0,
      originalPrice: 4000.0,
      discountPercent: 20,
      image: 'https://example.com/set.jpg',
      hoverImage: 'https://example.com/set-hover.jpg',
      description: 'Bridal jewellery set',
      finish: 'Gold',
      baseMaterial: 'Silver',
      warranty: '2 Years',
      inStock: true,
    },
  });

  console.log(`Created test users: ${user1.id}, ${user2.id}`);
  console.log(`Created test products: ${productLow.id} (₹350), ${productMid.id} (₹1500), ${productHigh.id} (₹3200)`);

  const createdOrderIds: string[] = [];

  // ==========================================================================
  // SECTION 3: Attack Vector & Client Manipulation Tests
  // ==========================================================================
  console.log('\n--- 3. Testing Resistance to Client Price & Total Manipulation ---');

  // Test 3.1: Client attempts to send fake low prices
  const reqTamperPrice = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Tamper Tester',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Fake Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      idempotencyKey: `tamper_price_${Date.now()}`,
      items: [
        {
          productId: productHigh.id,
          quantity: 1,
          price: 1.0, // Client attempts to buy ₹3200 set for ₹1!
          unitPrice: 1.0,
          lineTotal: 1.0,
          originalPrice: 1.0,
        },
      ],
      subtotal: 1.0,
      discountTotal: 0,
      shippingFee: 0,
      grandTotal: 1.0,
    },
  });

  const resTamperPrice = createMockRes();
  await ordersHandler(reqTamperPrice, resTamperPrice);
  assert(resTamperPrice.statusCode === 201, 'Order creation succeeds');
  const tamperedOrder = resTamperPrice.data?.order;
  if (tamperedOrder) {
    createdOrderIds.push(tamperedOrder.id);
    assert(tamperedOrder.subtotal === 3200, 'Server enforced DB product price ₹3200 (client ₹1 was IGNORED)');
    assert(tamperedOrder.shippingFee === 0, 'Server calculated ₹0 shipping fee (subtotal >= ₹499)');
    assert(tamperedOrder.grandTotal === 3200, 'Server enforced authoritative grandTotal ₹3200 (client ₹1 was IGNORED)');
    assert(tamperedOrder.items[0].unitPrice === 3200, 'OrderItem.unitPrice snapshot is authoritative ₹3200');
    assert(tamperedOrder.items[0].lineTotal === 3200, 'OrderItem.lineTotal snapshot is authoritative ₹3200');
  }

  // Test 3.2: Client attempts to send fake shipping fee on below-threshold order
  const reqTamperShipping = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Shipping Tamperer',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Fake Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      idempotencyKey: `tamper_shipping_${Date.now()}`,
      items: [
        {
          productId: productLow.id, // Price is ₹350 (< ₹499 threshold)
          quantity: 1,
        },
      ],
      shippingFee: 0, // Client claims free shipping!
      grandTotal: 350,
    },
  });

  const resTamperShipping = createMockRes();
  await ordersHandler(reqTamperShipping, resTamperShipping);
  assert(resTamperShipping.statusCode === 201, 'Order creation succeeds');
  const shippingOrder = resTamperShipping.data?.order;
  if (shippingOrder) {
    createdOrderIds.push(shippingOrder.id);
    assert(shippingOrder.subtotal === 350, 'Authoritative subtotal is ₹350');
    assert(shippingOrder.shippingFee === 60, 'Server ENFORCED ₹60 shipping fee (client ₹0 was IGNORED)');
    assert(shippingOrder.grandTotal === 410, 'Server ENFORCED grandTotal ₹410 (350 + 60)');
  }

  // Test 3.3: Client attempts to send fake arbitrary discount
  const reqTamperDiscount = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Discount Tamperer',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Fake Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      idempotencyKey: `tamper_discount_${Date.now()}`,
      items: [
        {
          productId: productMid.id, // Price is ₹1500
          quantity: 1,
        },
      ],
      discountTotal: 1400, // Client claims ₹1400 discount with no coupon!
      grandTotal: 100,
    },
  });

  const resTamperDiscount = createMockRes();
  await ordersHandler(reqTamperDiscount, resTamperDiscount);
  assert(resTamperDiscount.statusCode === 201, 'Order creation succeeds');
  const discountOrder = resTamperDiscount.data?.order;
  if (discountOrder) {
    createdOrderIds.push(discountOrder.id);
    assert(discountOrder.subtotal === 1500, 'Authoritative subtotal is ₹1500');
    assert(discountOrder.discountTotal === 0, 'Server ENFORCED ₹0 discount (client ₹1400 was IGNORED)');
    assert(discountOrder.grandTotal === 1500, 'Server ENFORCED grandTotal ₹1500 (client ₹100 was IGNORED)');
  }

  // ==========================================================================
  // SECTION 4: Coupon Application & Validation Tests
  // ==========================================================================
  console.log('\n--- 4. Testing Server-Side Coupon Calculations & Validation ---');

  // Test 4.1: ALONGKAR10 (10% discount on ₹1500 = ₹150)
  const reqAlongkar10 = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Coupon Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_alongkar10_${Date.now()}`,
      couponCode: 'ALONGKAR10',
      items: [{ productId: productMid.id, quantity: 1 }], // 1500
    },
  });

  const resAlongkar10 = createMockRes();
  await ordersHandler(reqAlongkar10, resAlongkar10);
  assert(resAlongkar10.statusCode === 201, 'ALONGKAR10 order created with 201');
  const alongkar10Order = resAlongkar10.data?.order;
  if (alongkar10Order) {
    createdOrderIds.push(alongkar10Order.id);
    assert(alongkar10Order.subtotal === 1500, 'Subtotal is ₹1500');
    assert(alongkar10Order.discountTotal === 150, 'Authoritative discountTotal is ₹150 (10% of 1500)');
    assert(alongkar10Order.shippingFee === 0, 'Shipping fee is ₹0 (subtotal >= 499)');
    assert(alongkar10Order.grandTotal === 1350, 'Authoritative grandTotal is ₹1350 (1500 - 150)');
  }

  // Test 4.2: PREPAID5 (5% discount on ₹1500 = ₹75)
  const reqPrepaid5 = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Prepaid Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_prepaid5_${Date.now()}`,
      couponCode: 'PREPAID5',
      items: [{ productId: productMid.id, quantity: 1 }], // 1500
    },
  });

  const resPrepaid5 = createMockRes();
  await ordersHandler(reqPrepaid5, resPrepaid5);
  assert(resPrepaid5.statusCode === 201, 'PREPAID5 order created with 201');
  const prepaid5Order = resPrepaid5.data?.order;
  if (prepaid5Order) {
    createdOrderIds.push(prepaid5Order.id);
    assert(prepaid5Order.subtotal === 1500, 'Subtotal is ₹1500');
    assert(prepaid5Order.discountTotal === 75, 'Authoritative discountTotal is ₹75 (5% of 1500)');
    assert(prepaid5Order.grandTotal === 1425, 'Authoritative grandTotal is ₹1425 (1500 - 75)');
  }

  // Test 4.3: FESTIVE500 on eligible subtotal (₹3200 >= ₹2500 -> ₹500 off)
  const reqFestiveEligible = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Festive Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_festive_ok_${Date.now()}`,
      couponCode: 'FESTIVE500',
      items: [{ productId: productHigh.id, quantity: 1 }], // 3200
    },
  });

  const resFestiveEligible = createMockRes();
  await ordersHandler(reqFestiveEligible, resFestiveEligible);
  assert(resFestiveEligible.statusCode === 201, 'FESTIVE500 eligible order created with 201');
  const festiveOrder = resFestiveEligible.data?.order;
  if (festiveOrder) {
    createdOrderIds.push(festiveOrder.id);
    assert(festiveOrder.subtotal === 3200, 'Subtotal is ₹3200');
    assert(festiveOrder.discountTotal === 500, 'Authoritative discountTotal is ₹500');
    assert(festiveOrder.grandTotal === 2700, 'Authoritative grandTotal is ₹2700 (3200 - 500)');
  }

  // Test 4.4: FESTIVE500 on ineligible subtotal (₹1500 < ₹2500 -> rejected with 400)
  const reqFestiveIneligible = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Ineligible Festive Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_festive_fail_${Date.now()}`,
      couponCode: 'FESTIVE500',
      items: [{ productId: productMid.id, quantity: 1 }], // 1500 (< 2500)
    },
  });

  const resFestiveIneligible = createMockRes();
  await ordersHandler(reqFestiveIneligible, resFestiveIneligible);
  assert(resFestiveIneligible.statusCode === 400, 'FESTIVE500 on ineligible subtotal returns 400 Bad Request');
  assert(
    typeof resFestiveIneligible.data?.error === 'string' &&
      resFestiveIneligible.data.error.includes('minimum subtotal'),
    'Clear minimum subtotal validation error returned'
  );

  // Test 4.5: WELCOME100 on eligible subtotal (₹1500 >= ₹999 -> ₹100 off)
  const reqWelcomeEligible = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Welcome Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_welcome_ok_${Date.now()}`,
      couponCode: 'WELCOME100',
      items: [{ productId: productMid.id, quantity: 1 }], // 1500
    },
  });

  const resWelcomeEligible = createMockRes();
  await ordersHandler(reqWelcomeEligible, resWelcomeEligible);
  assert(resWelcomeEligible.statusCode === 201, 'WELCOME100 eligible order created with 201');
  const welcomeOrder = resWelcomeEligible.data?.order;
  if (welcomeOrder) {
    createdOrderIds.push(welcomeOrder.id);
    assert(welcomeOrder.subtotal === 1500, 'Subtotal is ₹1500');
    assert(welcomeOrder.discountTotal === 100, 'Authoritative discountTotal is ₹100');
    assert(welcomeOrder.grandTotal === 1400, 'Authoritative grandTotal is ₹1400 (1500 - 100)');
  }

  // Test 4.6: WELCOME100 on ineligible subtotal (₹350 < ₹999 -> rejected with 400)
  const reqWelcomeIneligible = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Ineligible Welcome Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_welcome_fail_${Date.now()}`,
      couponCode: 'WELCOME100',
      items: [{ productId: productLow.id, quantity: 1 }], // 350 (< 999)
    },
  });

  const resWelcomeIneligible = createMockRes();
  await ordersHandler(reqWelcomeIneligible, resWelcomeIneligible);
  assert(resWelcomeIneligible.statusCode === 400, 'WELCOME100 on ineligible subtotal returns 400 Bad Request');

  // Test 4.7: Coupon Normalization (lowercase input 'alongkar10' with spaces)
  const reqNormCoupon = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Normalized Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_norm_${Date.now()}`,
      couponCode: '  alongkar10  ',
      items: [{ productId: productMid.id, quantity: 1 }], // 1500
    },
  });

  const resNormCoupon = createMockRes();
  await ordersHandler(reqNormCoupon, resNormCoupon);
  assert(resNormCoupon.statusCode === 201, 'Lowercase coupon code normalized and accepted (201)');
  const normOrder = resNormCoupon.data?.order;
  if (normOrder) {
    createdOrderIds.push(normOrder.id);
    assert(normOrder.discountTotal === 150, 'Calculated 10% discount from normalized code');
  }

  // Test 4.8: Invalid/bogus coupon code returns 400 Bad Request
  const reqInvalidCoupon = createMockReq({
    method: 'POST',
    user: user1,
    body: {
      customerName: 'Invalid Coupon Client',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700016',
      },
      idempotencyKey: `coupon_invalid_${Date.now()}`,
      couponCode: 'BOGUS_CODE_404',
      items: [{ productId: productMid.id, quantity: 1 }],
    },
  });

  const resInvalidCoupon = createMockRes();
  await ordersHandler(reqInvalidCoupon, resInvalidCoupon);
  assert(resInvalidCoupon.statusCode === 400, 'Invalid coupon code returns 400 Bad Request');
  assert(
    typeof resInvalidCoupon.data?.error === 'string' &&
      resInvalidCoupon.data.error.includes('invalid or expired'),
    'Clear invalid coupon error message returned'
  );

  // ==========================================================================
  // SECTION 5: Razorpay Gateway Integration with Authoritative grandTotal
  // ==========================================================================
  console.log('\n--- 5. Testing Razorpay Order Initiation Uses Authoritative Order.grandTotal ---');

  if (alongkar10Order) {
    const reqRzpOrder = createMockReq({
      method: 'POST',
      url: '/api/payments/razorpay/order',
      user: user1,
      body: {
        orderId: alongkar10Order.id,
      },
    });

    const resRzpOrder = createMockRes();
    await razorpayOrderHandler(reqRzpOrder, resRzpOrder);
    assert(resRzpOrder.statusCode === 201 || resRzpOrder.statusCode === 200, 'Razorpay payment order initialized');
    assert(resRzpOrder.data?.success === true, 'Razorpay order creation returned success: true');
    assert(typeof resRzpOrder.data?.razorpayOrderId === 'string', 'Valid razorpayOrderId returned');
    assert(
      resRzpOrder.data?.amount === 135000,
      'Razorpay order amount is exactly 135000 paise (₹1350.00 authoritative Order.grandTotal * 100)'
    );
  }

  // ==========================================================================
  // SECTION 6: Cart-Based Checkout with Authoritative Pricing
  // ==========================================================================
  console.log('\n--- 6. Testing Cart-Based Checkout with Authoritative Pricing ---');

  // Populate User 2 DB cart
  const user2Cart = await prisma.cart.create({
    data: {
      userId: user2.id,
      items: {
        create: [
          { productId: productLow.id, quantity: 1 }, // 350
          { productId: productMid.id, quantity: 2 }, // 3000 -> subtotal = 3350
        ],
      },
    },
  });

  const reqCartCheckout = createMockReq({
    method: 'POST',
    user: user2,
    body: {
      customerName: 'User 2 Cart Checkout',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '456 Cart Lane',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      idempotencyKey: `user2_cart_checkout_${Date.now()}`,
      couponCode: 'FESTIVE500',
    },
  });

  const resCartCheckout = createMockRes();
  await ordersHandler(reqCartCheckout, resCartCheckout);
  assert(resCartCheckout.statusCode === 201, 'Cart-based checkout created order with 201');
  const cartOrder = resCartCheckout.data?.order;
  if (cartOrder) {
    createdOrderIds.push(cartOrder.id);
    assert(cartOrder.subtotal === 3350, 'Authoritative subtotal calculated from user cart items (₹3350)');
    assert(cartOrder.discountTotal === 500, 'Authoritative coupon discount applied (₹500)');
    assert(cartOrder.shippingFee === 0, 'Authoritative shipping fee is ₹0 (subtotal >= 499)');
    assert(cartOrder.grandTotal === 2850, 'Authoritative grandTotal is ₹2850 (3350 - 500)');

    // Verify DB cart was cleared
    const remainingCartItems = await prisma.cartItem.findMany({
      where: { cartId: user2Cart.id },
    });
    assert(remainingCartItems.length === 0, 'User cart in database was cleared atomically on order creation');
  }

  // ==========================================================================
  // SECTION 7: Idempotency & Customer Isolation
  // ==========================================================================
  console.log('\n--- 7. Testing Idempotency & Customer Isolation ---');

  // Replay request with same idempotency key
  const resReplay = createMockRes();
  await ordersHandler(reqCartCheckout, resReplay);
  assert(resReplay.statusCode === 200, 'Idempotent replay returns 200 OK');
  assert(resReplay.data?.idempotentReplay === true, 'idempotentReplay flag is true');
  assert(resReplay.data?.order?.id === cartOrder?.id, 'Replayed order ID matches originally created order');

  // Cross-user idempotency collision attempt
  const reqCrossUser = createMockReq({
    method: 'POST',
    user: user1, // User 1 attempts to steal User 2 idempotency key!
    body: {
      customerName: 'Attacker',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Fake Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      idempotencyKey: reqCartCheckout.body.idempotencyKey,
    },
  });

  const resCrossUser = createMockRes();
  await ordersHandler(reqCrossUser, resCrossUser);
  assert(resCrossUser.statusCode === 409, 'Cross-user idempotency key collision rejected with 409 Conflict');

  // Unauthenticated checkout attempt
  const reqUnauth = createMockReq({
    method: 'POST',
    user: null,
    body: {
      customerName: 'Guest User',
      customerPhone: '9876543210',
      shippingAddress: {
        line1: '123 Fake Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
      },
      idempotencyKey: `unauth_${Date.now()}`,
    },
  });

  const resUnauth = createMockRes();
  await ordersHandler(reqUnauth, resUnauth);
  assert(resUnauth.statusCode === 401, 'Unauthenticated order creation blocked with 401 Unauthorized');

  // ==========================================================================
  // SECTION 8: Cleanup Test Data
  // ==========================================================================
  console.log('\n--- 8. Cleaning Up Test Entities ---');

  if (createdOrderIds.length > 0) {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }

  await prisma.product.deleteMany({
    where: { id: { in: [productLow.id, productMid.id, productHigh.id] } },
  });

  await prisma.cartItem.deleteMany({
    where: { cart: { userId: { in: [user1.id, user2.id] } } },
  });
  await prisma.cart.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id] } },
  });

  console.log('Cleanup completed.');

  console.log('\n===============================================================');
  console.log(`PHASE 1K TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase1KTests().catch((err) => {
  console.error('Fatal error running Phase 1K tests:', err);
  process.exit(1);
});
