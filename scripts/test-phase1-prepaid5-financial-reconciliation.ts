import {
  calculateAuthoritativePricing,
  calculatePrepaidIncentive,
  calculateShippingFee,
  validateAndCalculateCoupon,
  PREPAID_INCENTIVE_CODE,
  PREPAID_INCENTIVE_PERCENT,
} from '../api/_utils/pricing.ts';
import { parseOrderDiscounts } from '../src/lib/order-status.ts';

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

console.log('=============================================================================');
console.log('PREPAID5 DISCOUNT CALCULATION & FINANCIAL BREAKDOWN RECONCILIATION AUDIT');
console.log('=============================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authoritative Pricing Tests: Subtotal ₹1,399 Scenarios
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Authoritative Pricing Calculation Tests ---');

// 1.1 Subtotal ₹1,399 with PREPAID5 only (Online Razorpay)
const res1399PrepaidOnly = calculateAuthoritativePricing(
  [{ unitPrice: 1399, quantity: 1 }],
  'PREPAID5',
  'RAZORPAY'
);
assert(res1399PrepaidOnly.success === true, 'Subtotal ₹1,399 + PREPAID5 succeeds');
const p1 = res1399PrepaidOnly.pricing!;
assert(p1.subtotal === 1399, 'Subtotal is ₹1,399');
assert(p1.regularCouponDiscount === 0, 'No regular promotional coupon applied');
assert(
  p1.prepaid5Discount === 70,
  `PREPAID5 discount is ₹70 (5% of 1399 = 69.95, rounded to 70), got ₹${p1.prepaid5Discount}`
);
assert(p1.discountTotal === 70, `Total discount is ₹70, got ₹${p1.discountTotal}`);
assert(p1.shippingFee === 0, 'Free shipping applied (₹1,399 >= ₹499)');
assert(p1.grandTotal === 1329, `Grand total is ₹1,329 (1399 - 70 = 1329), got ₹${p1.grandTotal}`);

// 1.2 Subtotal ₹1,399 with WELCOME100 + PREPAID5 (Stacking Online Razorpay)
const res1399WelcomePrepaid = calculateAuthoritativePricing(
  [{ unitPrice: 1399, quantity: 1 }],
  'WELCOME100',
  'RAZORPAY'
);
assert(res1399WelcomePrepaid.success === true, 'Subtotal ₹1,399 + WELCOME100 + Razorpay succeeds');
const p2 = res1399WelcomePrepaid.pricing!;
assert(p2.subtotal === 1399, 'Subtotal is ₹1,399');
assert(p2.regularCouponDiscount === 100, `WELCOME100 flat discount is ₹100, got ₹${p2.regularCouponDiscount}`);
// Remaining base: 1399 - 100 = 1299. 5% of 1299 = 64.95, rounded to 65.
assert(
  p2.prepaid5Discount === 65,
  `PREPAID5 discount on remaining ₹1,299 is ₹65 (5% of 1299 = 64.95, rounded to 65), got ₹${p2.prepaid5Discount}`
);
assert(p2.discountTotal === 165, `Total combined discount is ₹165 (100 + 65), got ₹${p2.discountTotal}`);
assert(p2.shippingFee === 0, 'Free shipping applied (₹1,399 >= ₹499)');
assert(p2.grandTotal === 1234, `Grand total is ₹1,234 (1399 - 165 = 1234), got ₹${p2.grandTotal}`);

// 1.3 Subtotal ₹1,399 with COD: Must receive ₹0 PREPAID5 discount
const res1399Cod = calculateAuthoritativePricing(
  [{ unitPrice: 1399, quantity: 1 }],
  'PREPAID5',
  'COD'
);
assert(res1399Cod.success === true, 'Subtotal ₹1,399 + COD succeeds');
const p3 = res1399Cod.pricing!;
assert(p3.prepaid5Discount === 0, `COD order receives ₹0 PREPAID5 discount, got ₹${p3.prepaid5Discount}`);
assert(p3.discountTotal === 0, `COD order total discount is ₹0, got ₹${p3.discountTotal}`);
assert(p3.grandTotal === 1399, `COD order grand total is ₹1,399, got ₹${p3.grandTotal}`);

// 1.4 Subtotal ₹1,399 with WELCOME100 + COD
const res1399WelcomeCod = calculateAuthoritativePricing(
  [{ unitPrice: 1399, quantity: 1 }],
  'WELCOME100',
  'COD'
);
assert(res1399WelcomeCod.success === true, 'Subtotal ₹1,399 + WELCOME100 + COD succeeds');
const p4 = res1399WelcomeCod.pricing!;
assert(p4.regularCouponDiscount === 100, 'Regular coupon discount is ₹100');
assert(p4.prepaid5Discount === 0, 'COD order receives ₹0 PREPAID5 discount');
assert(p4.discountTotal === 100, 'Total discount is ₹100');
assert(p4.grandTotal === 1299, 'Grand total is ₹1,299');

// 1.5 Subtotal below free-shipping threshold (₹399 < ₹499) with PREPAID5 on Razorpay
const res399Prepaid = calculateAuthoritativePricing(
  [{ unitPrice: 399, quantity: 1 }],
  undefined,
  'RAZORPAY'
);
const p5 = res399Prepaid.pricing!;
assert(p5.subtotal === 399, 'Subtotal is ₹399');
assert(p5.shippingFee === 60, `Standard shipping fee ₹60 charged for order < ₹499, got ₹${p5.shippingFee}`);
assert(
  p5.prepaid5Discount === 20,
  `5% discount on ₹399 is ₹20 (19.95 rounded to 20), got ₹${p5.prepaid5Discount}`
);
assert(p5.grandTotal === 439, `Grand total is ₹439 (399 - 20 + 60 = 439), got ₹${p5.grandTotal}`);

// 1.6 Invariant: Discount cannot exceed eligible amount
const cappedDiscount = calculatePrepaidIncentive(10, 'RAZORPAY');
assert(cappedDiscount <= 10 && cappedDiscount >= 0, 'Discount does not exceed eligible amount');

// 1.7 Free shipping calculation directly
assert(calculateShippingFee(1399) === 0, 'calculateShippingFee(1399) is 0');
assert(calculateShippingFee(499) === 0, 'calculateShippingFee(499) is 0');
assert(calculateShippingFee(498) === 60, 'calculateShippingFee(498) is 60');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Order Breakdown Parsing & Reconciliation Tests (parseOrderDiscounts)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Order Breakdown Parsing & Reconciliation Tests ---');

// 2.1 Actual adminNotes produced by api/orders.ts for Subtotal ₹1,399 PREPAID5 only
const order1 = {
  discountTotal: 70,
  paymentProvider: 'RAZORPAY',
  adminNotes: 'Prepaid Incentive (PREPAID5): ₹70 | Payment Method: Online (Razorpay)',
};
const bd1 = parseOrderDiscounts(order1);
assert(
  bd1.prepaid5DiscountAmount === 70,
  `Parsed prepaid5DiscountAmount is ₹70 (NOT ₹5!), got ₹${bd1.prepaid5DiscountAmount}`
);
assert(bd1.totalDiscount === 70, `Parsed totalDiscount is ₹70, got ₹${bd1.totalDiscount}`);
assert(bd1.regularCouponCode === undefined, 'regularCouponCode is undefined');
assert(
  (bd1.regularDiscountAmount || 0) + (bd1.prepaid5DiscountAmount || 0) === bd1.totalDiscount,
  'Reconciliation: regular + prepaid === totalDiscount (0 + 70 === 70)'
);

// 2.2 Actual adminNotes produced by api/orders.ts for Subtotal ₹1,399 WELCOME100 + PREPAID5
const order2 = {
  discountTotal: 165,
  paymentProvider: 'RAZORPAY',
  adminNotes:
    'Applied Coupon: WELCOME100 (₹100 Flat Welcome Benefit) - Discount: ₹100 | Prepaid Incentive (PREPAID5): ₹65 | Payment Method: Online (Razorpay)',
};
const bd2 = parseOrderDiscounts(order2);
assert(bd2.regularCouponCode === 'WELCOME100', 'regularCouponCode is WELCOME100');
assert(bd2.regularDiscountAmount === 100, `regularDiscountAmount is ₹100, got ₹${bd2.regularDiscountAmount}`);
assert(
  bd2.prepaid5DiscountAmount === 65,
  `prepaid5DiscountAmount is ₹65 (NOT ₹5!), got ₹${bd2.prepaid5DiscountAmount}`
);
assert(bd2.totalDiscount === 165, `totalDiscount is ₹165, got ₹${bd2.totalDiscount}`);
assert(
  (bd2.regularDiscountAmount || 0) + (bd2.prepaid5DiscountAmount || 0) === bd2.totalDiscount,
  'Reconciliation: regular + prepaid === totalDiscount (100 + 65 === 165)'
);

// 2.3 COD Order with WELCOME100: Must have NO prepaid discount
const order3 = {
  discountTotal: 100,
  paymentProvider: 'COD',
  adminNotes:
    'Applied Coupon: WELCOME100 (₹100 Flat Welcome Benefit) - Discount: ₹100 | Payment Method: Cash on Delivery',
};
const bd3 = parseOrderDiscounts(order3);
assert(bd3.regularCouponCode === 'WELCOME100', 'regularCouponCode is WELCOME100');
assert(bd3.regularDiscountAmount === 100, 'regularDiscountAmount is ₹100');
assert(
  bd3.prepaid5DiscountAmount === undefined,
  `prepaid5DiscountAmount is undefined for COD, got ${bd3.prepaid5DiscountAmount}`
);
assert(bd3.totalDiscount === 100, 'totalDiscount is ₹100');

// 2.4 Truncated or alternative format notes: Defensive reconciliation
const orderLegacy = {
  discountTotal: 70,
  paymentProvider: 'RAZORPAY',
  adminNotes: 'PREPAID5 incentive applied | Payment Method: Online (Razorpay)',
};
const bdLegacy = parseOrderDiscounts(orderLegacy);
assert(
  bdLegacy.prepaid5DiscountAmount === 70,
  `Defensive reconciliation recovered prepaid discount ₹70, got ₹${bdLegacy.prepaid5DiscountAmount}`
);
assert(bdLegacy.totalDiscount === 70, 'totalDiscount is ₹70');

// 2.5 Alternative note format: "PREPAID5: ₹70"
const orderAlt = {
  discountTotal: 70,
  paymentProvider: 'RAZORPAY',
  adminNotes: 'PREPAID5: ₹70 | Payment Method: Online (Razorpay)',
};
const bdAlt = parseOrderDiscounts(orderAlt);
assert(
  bdAlt.prepaid5DiscountAmount === 70,
  `Direct match on PREPAID5: ₹70 succeeded with ₹70, got ₹${bdAlt.prepaid5DiscountAmount}`
);

// 2.6 Zero discount order
const orderZero = {
  discountTotal: 0,
  paymentProvider: 'RAZORPAY',
  adminNotes: 'Payment Method: Online (Razorpay)',
};
const bdZero = parseOrderDiscounts(orderZero);
assert(bdZero.totalDiscount === 0, 'totalDiscount is 0');
assert(bdZero.prepaid5DiscountAmount === undefined, 'prepaid5DiscountAmount is undefined');

// ─────────────────────────────────────────────────────────────────────────────
// 3. Financial Reconciliation Across System Boundaries
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. System-Wide Financial Reconciliation Validation ---');

// Verify that for subtotal ₹1,399 with PREPAID5:
// Items Subtotal: ₹1,399
// Promo discount: ₹0
// Prepaid benefit: ₹70
// Shipping fee: ₹0
// Final / Grand Total: ₹1,329
const subtotalVal = 1399;
const prepaid5Val = p1.prepaid5Discount;
const shippingVal = p1.shippingFee;
const grandTotalVal = p1.grandTotal;

assert(
  subtotalVal - prepaid5Val + shippingVal === grandTotalVal,
  `Checkout & DB reconciliation: 1399 - 70 + 0 === 1329 (verified: ${subtotalVal - prepaid5Val + shippingVal} === ${grandTotalVal})`
);
assert(
  bd1.totalDiscount === prepaid5Val,
  `Modal breakdown reconciliation: bd1.totalDiscount (${bd1.totalDiscount}) === p1.prepaid5Discount (${prepaid5Val})`
);

console.log('\n=============================================================================');
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${failedTests} failures)`);
console.log('=============================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
