import './testDbGuard.js';
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
  normalizePaymentMethod,
  validateAndCalculateCoupon,
  calculateShippingFee,
  calculatePrepaidIncentive,
  calculateAuthoritativePricing,
  PROMO_CODES,
  REGULAR_PROMO_CODES,
  PREPAID_INCENTIVE_CODE,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
} from '../api/_utils/pricing.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${message}${details ? ` -> ${details}` : ''}`);
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

async function runPhase1Tests() {
  console.log('=============================================================================');
  console.log('PHASE 1: SERVER-AUTHORITATIVE COUPON + PREPAID5 PRICING ENGINE TESTS');
  console.log('=============================================================================\n');

  // ==========================================================================
  // SECTION 1: Pure Pricing Engine & Stacking Rules
  // ==========================================================================
  console.log('--- 1. Testing Core Pricing & Stacking Logic ---');

  // 1.1 No coupon + COD
  const noCouponCod = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], undefined, 'COD');
  assert(noCouponCod.success === true, 'No coupon + COD succeeds');
  assert(noCouponCod.pricing?.subtotal === 1000, 'No coupon + COD: subtotal is ₹1000');
  assert(noCouponCod.pricing?.regularCouponDiscount === 0, 'No coupon + COD: regularCouponDiscount is ₹0');
  assert(noCouponCod.pricing?.prepaid5Discount === 0, 'No coupon + COD: prepaid5Discount is ₹0');
  assert(noCouponCod.pricing?.discountTotal === 0, 'No coupon + COD: discountTotal is ₹0');
  assert(noCouponCod.pricing?.grandTotal === 1000, 'No coupon + COD: grandTotal is ₹1000');

  // 1.2 No coupon + Razorpay
  const noCouponRzp = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], undefined, 'RAZORPAY');
  assert(noCouponRzp.success === true, 'No coupon + Razorpay succeeds');
  assert(noCouponRzp.pricing?.subtotal === 1000, 'No coupon + Razorpay: subtotal is ₹1000');
  assert(noCouponRzp.pricing?.regularCouponDiscount === 0, 'No coupon + Razorpay: regularCouponDiscount is ₹0');
  assert(noCouponRzp.pricing?.prepaid5Discount === 50, 'No coupon + Razorpay: prepaid5Discount is ₹50 (5% of ₹1000)');
  assert(noCouponRzp.pricing?.discountTotal === 50, 'No coupon + Razorpay: discountTotal is ₹50');
  assert(noCouponRzp.pricing?.grandTotal === 950, 'No coupon + Razorpay: grandTotal is ₹950 (1000 - 50)');

  // 1.3 ALONGKAR10 + COD
  const alongkarCod = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'ALONGKAR10', 'COD');
  assert(alongkarCod.success === true, 'ALONGKAR10 + COD succeeds');
  assert(alongkarCod.pricing?.regularCouponDiscount === 100, 'ALONGKAR10 + COD: regularCouponDiscount is ₹100 (10%)');
  assert(alongkarCod.pricing?.prepaid5Discount === 0, 'ALONGKAR10 + COD: prepaid5Discount is ₹0 on COD');
  assert(alongkarCod.pricing?.discountTotal === 100, 'ALONGKAR10 + COD: discountTotal is ₹100');
  assert(alongkarCod.pricing?.grandTotal === 900, 'ALONGKAR10 + COD: grandTotal is ₹900 (1000 - 100)');

  // 1.4 ALONGKAR10 + Razorpay (Stacking: 10% regular coupon + 5% PREPAID5 on remaining amount)
  const alongkarRzp = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'ALONGKAR10', 'RAZORPAY');
  assert(alongkarRzp.success === true, 'ALONGKAR10 + Razorpay succeeds');
  assert(alongkarRzp.pricing?.regularCouponDiscount === 100, 'ALONGKAR10 + Razorpay: regularCouponDiscount is ₹100');
  assert(alongkarRzp.pricing?.prepaid5Discount === 45, 'ALONGKAR10 + Razorpay: prepaid5Discount is ₹45 (5% of remaining ₹900)');
  assert(alongkarRzp.pricing?.discountTotal === 145, 'ALONGKAR10 + Razorpay: discountTotal is ₹145 (100 + 45)');
  assert(alongkarRzp.pricing?.grandTotal === 855, 'ALONGKAR10 + Razorpay: grandTotal is ₹855 (1000 - 145)');

  // 1.5 FESTIVE500 below minimum threshold (< ₹2500)
  const festiveBelow = calculateAuthoritativePricing([{ unitPrice: 2000, quantity: 1 }], 'FESTIVE500', 'RAZORPAY');
  assert(festiveBelow.success === false, 'FESTIVE500 below threshold is rejected');
  assert(
    typeof festiveBelow.error === 'string' && festiveBelow.error.includes('minimum subtotal of ₹2,500'),
    'FESTIVE500 returns correct minimum subtotal error message'
  );

  // 1.6 FESTIVE500 at minimum threshold (₹2500) + COD
  const festiveMinCod = calculateAuthoritativePricing([{ unitPrice: 2500, quantity: 1 }], 'FESTIVE500', 'COD');
  assert(festiveMinCod.success === true, 'FESTIVE500 at minimum threshold + COD succeeds');
  assert(festiveMinCod.pricing?.regularCouponDiscount === 500, 'FESTIVE500 at threshold: regularCouponDiscount is ₹500');
  assert(festiveMinCod.pricing?.prepaid5Discount === 0, 'FESTIVE500 at threshold + COD: prepaid5Discount is ₹0');
  assert(festiveMinCod.pricing?.discountTotal === 500, 'FESTIVE500 at threshold + COD: discountTotal is ₹500');
  assert(festiveMinCod.pricing?.grandTotal === 2000, 'FESTIVE500 at threshold + COD: grandTotal is ₹2000 (2500 - 500)');

  // 1.7 FESTIVE500 at minimum threshold (₹2500) + Razorpay
  const festiveMinRzp = calculateAuthoritativePricing([{ unitPrice: 2500, quantity: 1 }], 'FESTIVE500', 'RAZORPAY');
  assert(festiveMinRzp.success === true, 'FESTIVE500 at minimum threshold + Razorpay succeeds');
  assert(festiveMinRzp.pricing?.regularCouponDiscount === 500, 'FESTIVE500 at threshold + RZP: regularCouponDiscount is ₹500');
  assert(festiveMinRzp.pricing?.prepaid5Discount === 100, 'FESTIVE500 at threshold + RZP: prepaid5Discount is ₹100 (5% of remaining ₹2000)');
  assert(festiveMinRzp.pricing?.discountTotal === 600, 'FESTIVE500 at threshold + RZP: discountTotal is ₹600 (500 + 100)');
  assert(festiveMinRzp.pricing?.grandTotal === 1900, 'FESTIVE500 at threshold + RZP: grandTotal is ₹1900 (2500 - 600)');

  // 1.8 FESTIVE500 above threshold (₹2899) + COD (Example 1)
  const festiveAboveCod = calculateAuthoritativePricing([{ unitPrice: 2899, quantity: 1 }], 'FESTIVE500', 'COD');
  assert(festiveAboveCod.success === true, 'FESTIVE500 above threshold (₹2899) + COD succeeds (Example 1)');
  assert(festiveAboveCod.pricing?.subtotal === 2899, 'Example 1: subtotal is ₹2899');
  assert(festiveAboveCod.pricing?.regularCouponDiscount === 500, 'Example 1: regularCouponDiscount is ₹500');
  assert(festiveAboveCod.pricing?.prepaid5Discount === 0, 'Example 1: prepaid5Discount is ₹0 on COD');
  assert(festiveAboveCod.pricing?.shippingFee === 0, 'Example 1: shippingFee is ₹0 (>= 499)');
  assert(festiveAboveCod.pricing?.grandTotal === 2399, 'Example 1: grandTotal is ₹2399 (2899 - 500)');

  // 1.9 FESTIVE500 above threshold (₹2899) + Razorpay (Example 2)
  const festiveAboveRzp = calculateAuthoritativePricing([{ unitPrice: 2899, quantity: 1 }], 'FESTIVE500', 'RAZORPAY');
  assert(festiveAboveRzp.success === true, 'FESTIVE500 above threshold (₹2899) + Razorpay succeeds (Example 2)');
  assert(festiveAboveRzp.pricing?.subtotal === 2899, 'Example 2: subtotal is ₹2899');
  assert(festiveAboveRzp.pricing?.regularCouponDiscount === 500, 'Example 2: regularCouponDiscount is ₹500');
  // 5% of (2899 - 500 = 2399) = 119.95 -> rounds to 120
  assert(festiveAboveRzp.pricing?.prepaid5Discount === 120, 'Example 2: prepaid5Discount is ₹120 (5% of ₹2399 = 119.95 rounded to 120)');
  assert(festiveAboveRzp.pricing?.discountTotal === 620, 'Example 2: discountTotal is ₹620 (500 + 120)');
  assert(festiveAboveRzp.pricing?.grandTotal === 2279, 'Example 2: grandTotal is ₹2279 (2899 - 620)');

  // 1.9.1 FESTIVE500 with ₹2,997 subtotal (Modal Pricing Verification Case)
  const modalRzp = calculateAuthoritativePricing([{ unitPrice: 2997, quantity: 1 }], 'FESTIVE500', 'RAZORPAY');
  assert(modalRzp.success === true, 'Modal case: ₹2997 + FESTIVE500 + RAZORPAY succeeds');
  assert(modalRzp.pricing?.subtotal === 2997, 'Modal case: Subtotal is ₹2997');
  assert(modalRzp.pricing?.regularCouponDiscount === 500, 'Modal case: FESTIVE500 discount is ₹500');
  // 5% of (2997 - 500 = 2497) = 124.85 -> rounds to 125
  assert(modalRzp.pricing?.prepaid5Discount === 125, 'Modal case: PREPAID5 discount is ₹125 (5% of ₹2497 = 124.85 rounded to 125)');
  assert(modalRzp.pricing?.discountTotal === 625, 'Modal case: Total discount is ₹625 (500 + 125)');
  assert(modalRzp.pricing?.grandTotal === 2372, 'Modal case: Grand total is ₹2372 (2997 - 625)');

  const modalCod = calculateAuthoritativePricing([{ unitPrice: 2997, quantity: 1 }], 'FESTIVE500', 'COD');
  assert(modalCod.success === true, 'Modal case: ₹2997 + FESTIVE500 + COD succeeds');
  assert(modalCod.pricing?.subtotal === 2997, 'Modal case COD: Subtotal is ₹2997');
  assert(modalCod.pricing?.regularCouponDiscount === 500, 'Modal case COD: FESTIVE500 discount is ₹500');
  assert(modalCod.pricing?.prepaid5Discount === 0, 'Modal case COD: PREPAID5 discount is ₹0');
  assert(modalCod.pricing?.discountTotal === 500, 'Modal case COD: Total discount is ₹500');
  assert(modalCod.pricing?.grandTotal === 2497, 'Modal case COD: Grand total is ₹2497 (2997 - 500)');

  // 1.10 WELCOME100 below minimum threshold (< ₹999)
  const welcomeBelow = calculateAuthoritativePricing([{ unitPrice: 800, quantity: 1 }], 'WELCOME100', 'RAZORPAY');
  assert(welcomeBelow.success === false, 'WELCOME100 below threshold (₹800 < ₹999) is rejected');
  assert(
    typeof welcomeBelow.error === 'string' && welcomeBelow.error.includes('minimum subtotal of ₹999'),
    'WELCOME100 returns correct minimum subtotal error message'
  );

  // 1.11 WELCOME100 at minimum threshold (₹999) + COD
  const welcomeMinCod = calculateAuthoritativePricing([{ unitPrice: 999, quantity: 1 }], 'WELCOME100', 'COD');
  assert(welcomeMinCod.success === true, 'WELCOME100 at minimum threshold + COD succeeds');
  assert(welcomeMinCod.pricing?.regularCouponDiscount === 100, 'WELCOME100 at threshold: regularCouponDiscount is ₹100');
  assert(welcomeMinCod.pricing?.prepaid5Discount === 0, 'WELCOME100 at threshold + COD: prepaid5Discount is ₹0');
  assert(welcomeMinCod.pricing?.discountTotal === 100, 'WELCOME100 at threshold + COD: discountTotal is ₹100');
  assert(welcomeMinCod.pricing?.grandTotal === 899, 'WELCOME100 at threshold + COD: grandTotal is ₹899');

  // 1.12 WELCOME100 at minimum threshold (₹999) + Razorpay
  const welcomeMinRzp = calculateAuthoritativePricing([{ unitPrice: 999, quantity: 1 }], 'WELCOME100', 'RAZORPAY');
  assert(welcomeMinRzp.success === true, 'WELCOME100 at minimum threshold + Razorpay succeeds');
  assert(welcomeMinRzp.pricing?.regularCouponDiscount === 100, 'WELCOME100 at threshold + RZP: regularCouponDiscount is ₹100');
  // 5% of (999 - 100 = 899) = 44.95 -> rounds to 45
  assert(welcomeMinRzp.pricing?.prepaid5Discount === 45, 'WELCOME100 at threshold + RZP: prepaid5Discount is ₹45 (5% of ₹899 = 44.95 rounded to 45)');
  assert(welcomeMinRzp.pricing?.discountTotal === 145, 'WELCOME100 at threshold + RZP: discountTotal is ₹145 (100 + 45)');
  assert(welcomeMinRzp.pricing?.grandTotal === 854, 'WELCOME100 at threshold + RZP: grandTotal is ₹854 (999 - 145)');

  // 1.13 WELCOME100 above threshold (₹1500) + COD
  const welcomeAboveCod = calculateAuthoritativePricing([{ unitPrice: 1500, quantity: 1 }], 'WELCOME100', 'COD');
  assert(welcomeAboveCod.success === true, 'WELCOME100 above threshold (₹1500) + COD succeeds');
  assert(welcomeAboveCod.pricing?.regularCouponDiscount === 100, 'WELCOME100 above threshold: regularCouponDiscount is ₹100');
  assert(welcomeAboveCod.pricing?.prepaid5Discount === 0, 'WELCOME100 above threshold + COD: prepaid5Discount is ₹0');
  assert(welcomeAboveCod.pricing?.grandTotal === 1400, 'WELCOME100 above threshold + COD: grandTotal is ₹1400');

  // 1.14 WELCOME100 above threshold (₹1500) + Razorpay
  const welcomeAboveRzp = calculateAuthoritativePricing([{ unitPrice: 1500, quantity: 1 }], 'WELCOME100', 'RAZORPAY');
  assert(welcomeAboveRzp.success === true, 'WELCOME100 above threshold (₹1500) + Razorpay succeeds');
  assert(welcomeAboveRzp.pricing?.regularCouponDiscount === 100, 'WELCOME100 above threshold + RZP: regularCouponDiscount is ₹100');
  assert(welcomeAboveRzp.pricing?.prepaid5Discount === 70, 'WELCOME100 above threshold + RZP: prepaid5Discount is ₹70 (5% of ₹1400)');
  assert(welcomeAboveRzp.pricing?.discountTotal === 170, 'WELCOME100 above threshold + RZP: discountTotal is ₹170');
  assert(welcomeAboveRzp.pricing?.grandTotal === 1330, 'WELCOME100 above threshold + RZP: grandTotal is ₹1330 (1500 - 170)');

  // 1.15 PREPAID5 manual code input behavior
  const manualPrepaidRzp = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'PREPAID5', 'RAZORPAY');
  assert(manualPrepaidRzp.success === true, 'Manual PREPAID5 + Razorpay succeeds');
  assert(manualPrepaidRzp.pricing?.regularCouponDiscount === 0, 'Manual PREPAID5: regularCouponDiscount is ₹0');
  assert(manualPrepaidRzp.pricing?.prepaid5Discount === 50, 'Manual PREPAID5: prepaid5Discount is ₹50');
  assert(manualPrepaidRzp.pricing?.discountTotal === 50, 'Manual PREPAID5: discountTotal is ₹50');

  const manualPrepaidCod = calculateAuthoritativePricing([{ unitPrice: 1000, quantity: 1 }], 'PREPAID5', 'COD');
  assert(manualPrepaidCod.success === true, 'Manual PREPAID5 + COD succeeds');
  assert(manualPrepaidCod.pricing?.prepaid5Discount === 0, 'Manual PREPAID5 + COD: prepaid5Discount is ₹0');
  assert(manualPrepaidCod.pricing?.discountTotal === 0, 'Manual PREPAID5 + COD: discountTotal is ₹0');

  // 1.16 Two regular coupons must NEVER stack
  const twoRegularCodes = calculateAuthoritativePricing([{ unitPrice: 3000, quantity: 1 }], 'ALONGKAR10,FESTIVE500', 'RAZORPAY');
  assert(twoRegularCodes.success === false, 'Multiple comma-separated regular coupons are rejected');

  const invalidPromo = calculateAuthoritativePricing([{ unitPrice: 3000, quantity: 1 }], 'UNKNOWN_CODE', 'RAZORPAY');
  assert(invalidPromo.success === false, 'Unknown coupon code is rejected');

  // 1.17 Fractional PREPAID5 Discount Rounding Tests
  assert(calculatePrepaidIncentive(999, 'RAZORPAY') === 50, '₹999 * 5% = 49.95 rounds to ₹50');
  assert(calculatePrepaidIncentive(1001, 'RAZORPAY') === 50, '₹1001 * 5% = 50.05 rounds to ₹50');
  assert(calculatePrepaidIncentive(1010, 'RAZORPAY') === 51, '₹1010 * 5% = 50.50 rounds to ₹51');
  assert(calculatePrepaidIncentive(1011, 'RAZORPAY') === 51, '₹1011 * 5% = 50.55 rounds to ₹51');
  assert(calculatePrepaidIncentive(2399, 'RAZORPAY') === 120, '₹2399 * 5% = 119.95 rounds to ₹120');
  assert(calculatePrepaidIncentive(350, 'RAZORPAY') === 18, '₹350 * 5% = 17.50 rounds to ₹18');
  assert(calculatePrepaidIncentive(999, 'COD') === 0, 'COD always yields ₹0 prepaid incentive regardless of amount');

  // Shipping fee with low subtotal (below ₹499) + PREPAID5 on Razorpay
  const lowSubtotalRzp = calculateAuthoritativePricing([{ unitPrice: 350, quantity: 1 }], undefined, 'RAZORPAY');
  assert(lowSubtotalRzp.pricing?.subtotal === 350, 'Low subtotal: ₹350');
  assert(lowSubtotalRzp.pricing?.prepaid5Discount === 18, 'Low subtotal: prepaid5 is ₹18');
  assert(lowSubtotalRzp.pricing?.shippingFee === 60, 'Low subtotal: shipping is ₹60 (subtotal < 499)');
  assert(lowSubtotalRzp.pricing?.grandTotal === 392, 'Low subtotal + Razorpay: grandTotal is ₹392 (350 - 18 + 60)');

  // ==========================================================================
  // SECTION 2: End-to-End API Integration & Tampering Protection
  // ==========================================================================
  console.log('\n--- 2. End-to-End Database & API Tampering Protection Tests ---');

  const ts = Date.now();
  const testUser = await prisma.user.create({
    data: {
      clerkUserId: `clerk_p1_user_${ts}`,
      email: `p1_user_${ts}@example.com`,
    },
  });

  const productA = await prisma.product.create({
    data: {
      name: `Gold Earrings ${ts}`,
      slug: `gold-earrings-${ts}`,
      category: 'Earrings',
      price: 1500.0,
      originalPrice: 2000.0,
      discountPercent: 25,
      image: 'https://example.com/earring.jpg',
      hoverImage: 'https://example.com/earring-hover.jpg',
      description: 'Handcrafted gold earrings',
      finish: 'Gold',
      baseMaterial: 'Silver',
      warranty: '1 Year',
      inStock: true,
    },
  });

  const productB = await prisma.product.create({
    data: {
      name: `Royal Choker ${ts}`,
      slug: `royal-choker-${ts}`,
      category: 'Necklaces',
      price: 2899.0,
      originalPrice: 3500.0,
      discountPercent: 17,
      image: 'https://example.com/choker.jpg',
      hoverImage: 'https://example.com/choker-hover.jpg',
      description: 'Royal polki choker',
      finish: 'Gold',
      baseMaterial: 'Silver',
      warranty: '2 Years',
      inStock: true,
    },
  });

  const createdOrderIds: string[] = [];

  try {
    // Test 2.1: Client submits fake subtotal, fake regular discount, fake prepaid discount, fake shipping, fake grandTotal
    const reqTamperAll = createMockReq({
      method: 'POST',
      user: testUser,
      body: {
        customerName: 'Tamper Master',
        customerPhone: '9876543210',
        shippingAddress: {
          line1: '123 Fake Street',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700001',
        },
        idempotencyKey: `tamper_all_${ts}`,
        couponCode: 'ALONGKAR10',
        paymentMethod: 'RAZORPAY',
        items: [
          {
            productId: productA.id,
            quantity: 1,
            price: 5.0, // Client claims product costs ₹5!
            unitPrice: 5.0,
            lineTotal: 5.0,
          },
        ],
        subtotal: 5.0, // Client fake subtotal
        discountTotal: 1000.0, // Client fake discount
        prepaidDiscount: 500.0, // Client fake prepaid discount
        shippingFee: 0,
        grandTotal: 1.0, // Client claims grandTotal is ₹1!
      },
    });

    const resTamperAll = createMockRes();
    await ordersHandler(reqTamperAll, resTamperAll);
    assert(resTamperAll.statusCode === 201, 'Tampered order request processed');
    const orderTampered = resTamperAll.data?.order;
    if (orderTampered) {
      createdOrderIds.push(orderTampered.id);
      assert(orderTampered.subtotal === 1500, 'Server enforced DB product price ₹1500 (client fake ₹5 ignored)');
      assert(orderTampered.discountTotal === 218, 'Server calculated authoritative discount: ₹150 (ALONGKAR10) + ₹68 (PREPAID5 on ₹1350) = ₹218 (client fake ₹1000 ignored)');
      assert(orderTampered.shippingFee === 0, 'Server calculated authoritative shippingFee ₹0 (client value ignored)');
      assert(orderTampered.grandTotal === 1282, 'Server enforced authoritative grandTotal ₹1282 (1500 - 218, client fake ₹1 ignored)');
      assert(orderTampered.paymentProvider === 'RAZORPAY', 'Order recorded paymentProvider as RAZORPAY');
    }

    // Test 2.2: Client selects COD but submits a PREPAID5 coupon / discount
    const reqCodPrepaid = createMockReq({
      method: 'POST',
      user: testUser,
      body: {
        customerName: 'COD Customer',
        customerPhone: '9876543210',
        shippingAddress: {
          line1: '123 Fake Street',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700001',
        },
        idempotencyKey: `cod_prepaid_${ts}`,
        couponCode: 'PREPAID5',
        paymentMethod: 'COD',
        items: [{ productId: productA.id, quantity: 1 }],
      },
    });

    const resCodPrepaid = createMockRes();
    await ordersHandler(reqCodPrepaid, resCodPrepaid);
    assert(resCodPrepaid.statusCode === 201, 'COD order with PREPAID5 processed');
    const orderCod = resCodPrepaid.data?.order;
    if (orderCod) {
      createdOrderIds.push(orderCod.id);
      assert(orderCod.discountTotal === 0, 'COD order receives ₹0 PREPAID5 discount');
      assert(orderCod.grandTotal === 1500, 'COD order grandTotal is full ₹1500');
      assert(orderCod.status === 'CONFIRMED', 'COD order is created with status CONFIRMED');
      assert(orderCod.paymentProvider === 'COD', 'COD order paymentProvider is COD');
    }

    // Test 2.3: Example 2 via API (₹2899 + FESTIVE500 + RAZORPAY)
    const reqExample2 = createMockReq({
      method: 'POST',
      user: testUser,
      body: {
        customerName: 'Example 2 Customer',
        customerPhone: '9876543210',
        shippingAddress: {
          line1: '123 Luxury Lane',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700001',
        },
        idempotencyKey: `example2_api_${ts}`,
        couponCode: 'FESTIVE500',
        paymentMethod: 'RAZORPAY',
        items: [{ productId: productB.id, quantity: 1 }],
      },
    });

    const resExample2 = createMockRes();
    await ordersHandler(reqExample2, resExample2);
    assert(resExample2.statusCode === 201, 'Example 2 order created');
    const orderEx2 = resExample2.data?.order;
    if (orderEx2) {
      createdOrderIds.push(orderEx2.id);
      assert(orderEx2.subtotal === 2899, 'Example 2: Subtotal is ₹2899');
      assert(orderEx2.discountTotal === 620, 'Example 2: Discount total is ₹620 (₹500 FESTIVE500 + ₹120 PREPAID5 on ₹2399)');
      assert(orderEx2.grandTotal === 2279, 'Example 2: Grand total is ₹2279 (2899 - 620)');
      assert(orderEx2.paymentProvider === 'RAZORPAY', 'Example 2: Payment provider is RAZORPAY');

      // Test Razorpay payment initiation receives the exact authoritative grandTotal in paise
      const reqRzpPay = createMockReq({
        method: 'POST',
        url: '/api/payments/razorpay/order',
        user: testUser,
        body: { orderId: orderEx2.id },
      });
      const resRzpPay = createMockRes();
      await razorpayOrderHandler(reqRzpPay, resRzpPay);
      assert(resRzpPay.statusCode === 201 || resRzpPay.statusCode === 200, 'Razorpay payment order initialized');
      assert(
        resRzpPay.data?.amount === 227900,
        'Razorpay order amount is exactly 227900 paise (₹2279 * 100) — uses persisted authoritative grandTotal'
      );
    }

    // Test 2.4: Quantity tampering (< 1 quantity)
    const reqTamperQty = createMockReq({
      method: 'POST',
      user: testUser,
      body: {
        customerName: 'Qty Tamperer',
        customerPhone: '9876543210',
        shippingAddress: {
          line1: '123 Fake Street',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700001',
        },
        idempotencyKey: `tamper_qty_${ts}`,
        items: [{ productId: productA.id, quantity: 0 }], // Invalid quantity
      },
    });
    const resTamperQty = createMockRes();
    await ordersHandler(reqTamperQty, resTamperQty);
    assert(resTamperQty.statusCode === 400, 'Invalid quantity (0) returns 400 Bad Request');

  } finally {
    // Teardown
    console.log('\n--- Cleaning Up Test Data ---');
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    await prisma.product.deleteMany({ where: { id: { in: [productA.id, productB.id] } } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: testUser.id } } });
    await prisma.cart.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    console.log('Teardown complete.');
  }

  console.log('\n=============================================================================');
  console.log(`PHASE 1 TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('=============================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('Fatal error running Phase 1 tests:', err);
  process.exit(1);
});
