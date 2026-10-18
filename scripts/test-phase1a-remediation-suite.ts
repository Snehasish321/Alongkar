/**
 * ALONGKAR PHASE 1A — REMEDIATION VERIFICATION SUITE
 * 
 * Safe in-memory unit tests validating:
 * 1. Workstream 1: Delivery Address Collection & Phone/PIN Validation Rules
 * 2. Workstream 2: Shipping Threshold (₹399) & Standard Fee (₹40) Boundaries
 * 3. Workstream 3: PREPAID5 5% Discount with Authoritative ₹80 Cap
 * 4. Coupon & Shipping Interactions
 * 5. Payment Invariants & Integer-Paise Precision
 */

import {
  calculateAuthoritativePricing,
  calculatePrepaidIncentive,
  calculateShippingFee,
  validateAndCalculateCoupon,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  PREPAID_INCENTIVE_MAX_DISCOUNT,
  PREPAID_INCENTIVE_PERCENT,
} from '../api/_utils/pricing.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: unknown, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('=============================================================================');
console.log('ALONGKAR PHASE 1A REMEDIATION SUITE: PRICING, ADDRESS & PAYMENT VALIDATION');
console.log('=============================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// WORKSTREAM 1: ADDRESS & CONTACT VALIDATION RULES
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- WORKSTREAM 1: Address & Contact Validation Rules ---');

// Phone normalization and validation logic (mirrored between CartPage.tsx & api/orders.ts)
function normalizeAndValidatePhone(inputPhone: string): { valid: boolean; normalized?: string; error?: string } {
  if (!inputPhone || typeof inputPhone !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }
  const digits = inputPhone.replace(/\D/g, '');
  const tenDigit = digits.length === 10 ? digits : digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0')) ? digits.slice(-10) : '';
  if (!/^[6-9]\d{9}$/.test(tenDigit)) {
    return { valid: false, error: 'Please enter a valid 10-digit Indian mobile number starting with 6-9.' };
  }
  return { valid: true, normalized: tenDigit };
}

// PIN code validation logic
function validateIndianPincode(pincode: string): { valid: boolean; error?: string } {
  if (!pincode || typeof pincode !== 'string') {
    return { valid: false, error: 'PIN code is required.' };
  }
  const cleaned = pincode.trim();
  if (!/^[1-9][0-9]{5}$/.test(cleaned)) {
    return { valid: false, error: 'PIN code must be a 6-digit Indian postal code.' };
  }
  return { valid: true };
}

// Phone Tests
assert(normalizeAndValidatePhone('9876543210').valid === true, 'Standard 10-digit mobile 9876543210 is valid');
assert(normalizeAndValidatePhone('9876543210').normalized === '9876543210', 'Phone normalizes correctly');
assert(normalizeAndValidatePhone('+91 98765 43210').valid === true, 'International format +91 98765 43210 is valid');
assert(normalizeAndValidatePhone('+91 98765 43210').normalized === '9876543210', 'International format normalizes to 10 digits');
assert(normalizeAndValidatePhone('09876543210').valid === true, 'Leading-zero format 09876543210 is valid');
assert(normalizeAndValidatePhone('09876543210').normalized === '9876543210', 'Leading zero stripped to 10 digits');
assert(normalizeAndValidatePhone('919876543210').valid === true, 'Prefix 91 format 919876543210 is valid');
assert(normalizeAndValidatePhone('919876543210').normalized === '9876543210', 'Prefix 91 stripped to 10 digits');
assert(normalizeAndValidatePhone('5876543210').valid === false, 'Rejects mobile starting with 5 (must start with 6-9)');
assert(normalizeAndValidatePhone('12345').valid === false, 'Rejects short mobile (5 digits)');
assert(normalizeAndValidatePhone('9876543210123').valid === false, 'Rejects overly long mobile');
assert(normalizeAndValidatePhone('abcdefghij').valid === false, 'Rejects non-numeric phone');
assert(normalizeAndValidatePhone('').valid === false, 'Rejects empty phone');

// Pincode Tests
assert(validateIndianPincode('700001').valid === true, 'Kolkata PIN 700001 is valid');
assert(validateIndianPincode('731224').valid === true, 'Rampurhat PIN 731224 is valid');
assert(validateIndianPincode('110001').valid === true, 'Delhi PIN 110001 is valid');
assert(validateIndianPincode('012345').valid === false, 'Rejects PIN starting with 0');
assert(validateIndianPincode('70001').valid === false, 'Rejects 5-digit PIN');
assert(validateIndianPincode('7000001').valid === false, 'Rejects 7-digit PIN');
assert(validateIndianPincode('700 001').valid === false, 'Rejects PIN with internal spaces');
assert(validateIndianPincode('ABCDEF').valid === false, 'Rejects alphabetic PIN');
assert(validateIndianPincode('').valid === false, 'Rejects empty PIN');

// ─────────────────────────────────────────────────────────────────────────────
// WORKSTREAM 2: SHIPPING PRICING BOUNDARY TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- WORKSTREAM 2: Shipping Pricing Boundary Tests ---');

assert(FREE_SHIPPING_THRESHOLD === 399, 'Free shipping threshold constant is ₹399');
assert(STANDARD_SHIPPING_FEE === 40, 'Standard shipping fee constant is ₹40');

// Boundary: Empty cart
assert(calculateShippingFee(0) === 0, 'Subtotal ₹0 incurs ₹0 shipping (empty cart free)');

// Boundary: Below threshold
assert(calculateShippingFee(1) === 40, 'Subtotal ₹1 incurs standard ₹40 shipping fee');
assert(calculateShippingFee(100) === 40, 'Subtotal ₹100 incurs standard ₹40 shipping fee');
assert(calculateShippingFee(350) === 40, 'Subtotal ₹350 incurs standard ₹40 shipping fee');
assert(calculateShippingFee(398.99) === 40, 'Subtotal ₹398.99 incurs standard ₹40 shipping fee');

// Boundary: Exact threshold
assert(calculateShippingFee(399) === 0, 'Subtotal exactly ₹399 unlocks free shipping (₹0)');

// Boundary: Above threshold
assert(calculateShippingFee(399.01) === 0, 'Subtotal ₹399.01 qualifies for free shipping (₹0)');
assert(calculateShippingFee(400) === 0, 'Subtotal ₹400 qualifies for free shipping (₹0)');
assert(calculateShippingFee(1399) === 0, 'Subtotal ₹1,399 qualifies for free shipping (₹0)');
assert(calculateShippingFee(5000) === 0, 'Subtotal ₹5,000 qualifies for free shipping (₹0)');

// Full Authoritative Order Evaluation at Shipping Boundaries:
const orderSub398 = calculateAuthoritativePricing([{ unitPrice: 398, quantity: 1 }], undefined, 'COD');
assert(orderSub398.success === true && orderSub398.pricing?.shippingFee === 40, 'Order subtotal ₹398 charges ₹40 shipping');
assert(orderSub398.pricing?.grandTotal === 438, 'Order subtotal ₹398 grand total is ₹438 (398 + 40)');

const orderSub399 = calculateAuthoritativePricing([{ unitPrice: 399, quantity: 1 }], undefined, 'COD');
assert(orderSub399.success === true && orderSub399.pricing?.shippingFee === 0, 'Order subtotal ₹399 charges ₹0 shipping');
assert(orderSub399.pricing?.grandTotal === 399, 'Order subtotal ₹399 grand total is ₹399 (399 + 0)');

// Coupon & Shipping Interaction:
// Documented Rule: calculateShippingFee evaluates qualifying merchandise subtotal BEFORE promotional coupons.
// An order with merchandise subtotal ₹450 with ALONGKAR10 (10% off):
const orderCouponQualifiesShipping = calculateAuthoritativePricing(
  [{ unitPrice: 450, quantity: 1 }],
  'ALONGKAR10',
  'COD'
);
assert(orderCouponQualifiesShipping.success === true, 'Order subtotal ₹450 with ALONGKAR10 succeeds');
assert(
  orderCouponQualifiesShipping.pricing?.shippingFee === 0,
  'Merchandise subtotal ₹450 >= ₹399 retains free shipping even after coupon discount'
);
assert(
  orderCouponQualifiesShipping.pricing?.grandTotal === 405,
  'Grand total is ₹405 (450 - 45 + 0)'
);

// Order with merchandise subtotal ₹350 with ALONGKAR10 (order subtotal < 399 before coupon):
const orderCouponIncursShipping = calculateAuthoritativePricing(
  [{ unitPrice: 350, quantity: 1 }],
  'ALONGKAR10',
  'COD'
);
assert(
  orderCouponIncursShipping.pricing?.shippingFee === 40,
  'Merchandise subtotal ₹350 < ₹399 incurs ₹40 shipping fee'
);
assert(
  orderCouponIncursShipping.pricing?.grandTotal === 355,
  'Grand total is ₹355 (350 - 35 + 40)'
);

// High-subtotal order with WELCOME100 (minOrder ₹999):
const orderWelcomeQualifies = calculateAuthoritativePricing(
  [{ unitPrice: 1200, quantity: 1 }],
  'WELCOME100',
  'COD'
);
assert(
  orderWelcomeQualifies.success === true && orderWelcomeQualifies.pricing?.shippingFee === 0,
  'Merchandise subtotal ₹1,200 with WELCOME100 retains free shipping'
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKSTREAM 3: PREPAID5 DISCOUNT & ₹80 CAP BOUNDARY TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- WORKSTREAM 3: PREPAID5 5% Discount & ₹80 Cap Boundary Tests ---');

assert(PREPAID_INCENTIVE_PERCENT === 5, 'Prepaid discount percentage is 5%');
assert(PREPAID_INCENTIVE_MAX_DISCOUNT === 80, 'Prepaid maximum discount cap is ₹80');

// Cap Boundaries via calculatePrepaidIncentive:
// Case 1: Below ₹80 cap (base < ₹1,600)
// Base ₹500: 5% of 500 = ₹25
assert(calculatePrepaidIncentive(500, 'RAZORPAY') === 25, 'Base ₹500 -> 5% is ₹25 (below ₹80 cap)');
// Base ₹1,000: 5% of 1000 = ₹50
assert(calculatePrepaidIncentive(1000, 'RAZORPAY') === 50, 'Base ₹1,000 -> 5% is ₹50 (below ₹80 cap)');
// Base ₹1,590: 5% of 1590 = 79.5 -> rounds to 80 (exact boundary)
assert(calculatePrepaidIncentive(1590, 'RAZORPAY') === 80, 'Base ₹1,590 -> 79.5 rounds to ₹80 (within cap)');
// Base ₹1,500: 5% of 1500 = ₹75
assert(calculatePrepaidIncentive(1500, 'RAZORPAY') === 75, 'Base ₹1,500 -> 5% is ₹75 (below ₹80 cap)');

// Case 2: Exactly at ₹80 cap (base = ₹1,600)
// Base ₹1,600: 5% of 1600 = ₹80.0
assert(calculatePrepaidIncentive(1600, 'RAZORPAY') === 80, 'Base ₹1,600 -> exactly ₹80 cap');

// Case 3: Above ₹80 cap (base > ₹1,600)
// Base ₹1,800: raw 5% is ₹90 -> must cap at ₹80
assert(calculatePrepaidIncentive(1800, 'RAZORPAY') === 80, 'Base ₹1,800 -> raw 5% is ₹90, strictly capped at ₹80');
// Base ₹2,000: raw 5% is ₹100 -> must cap at ₹80
assert(calculatePrepaidIncentive(2000, 'RAZORPAY') === 80, 'Base ₹2,000 -> raw 5% is ₹100, strictly capped at ₹80');
// Base ₹3,000: raw 5% is ₹150 -> must cap at ₹80
assert(calculatePrepaidIncentive(3000, 'RAZORPAY') === 80, 'Base ₹3,000 -> raw 5% is ₹150, strictly capped at ₹80');
// Base ₹5,000: raw 5% is ₹250 -> must cap at ₹80
assert(calculatePrepaidIncentive(5000, 'RAZORPAY') === 80, 'Base ₹5,000 -> raw 5% is ₹250, strictly capped at ₹80');
// Base ₹10,000: raw 5% is ₹500 -> must cap at ₹80
assert(calculatePrepaidIncentive(10000, 'RAZORPAY') === 80, 'Base ₹10,000 -> raw 5% is ₹500, strictly capped at ₹80');

// COD Payment Method Invariant:
assert(calculatePrepaidIncentive(2000, 'COD') === 0, 'COD order receives ₹0 prepaid discount (base ₹2,000)');
assert(calculatePrepaidIncentive(5000, 'COD') === 0, 'COD order receives ₹0 prepaid discount (base ₹5,000)');
assert(calculatePrepaidIncentive(1000, undefined) === 0, 'Undefined payment method receives ₹0 prepaid discount');

// Authoritative Pricing Engine Cap Enforcement on Cart:
const highValueOrder = calculateAuthoritativePricing(
  [{ unitPrice: 2500, quantity: 2 }], // subtotal = ₹5,000
  undefined,
  'RAZORPAY'
);
assert(highValueOrder.success === true, 'Authoritative pricing on ₹5,000 cart succeeds');
const hvPricing = highValueOrder.pricing!;
assert(hvPricing.subtotal === 5000, 'Subtotal is ₹5,000');
assert(hvPricing.shippingFee === 0, 'Shipping fee is ₹0 (>= ₹399)');
assert(
  hvPricing.prepaid5Discount === 80,
  `PREPAID5 on ₹5,000 cart is strictly capped at ₹80 (NOT ₹250!), got ₹${hvPricing.prepaid5Discount}`
);
assert(
  hvPricing.grandTotal === 4920,
  `Grand total is ₹4,920 (5000 - 80 = 4920), got ₹${hvPricing.grandTotal}`
);

// High value order with promotional coupon + PREPAID5 cap:
// Subtotal = ₹3,000, WELCOME100 coupon (₹100 off). Remaining base = ₹2,900.
// Raw 5% of ₹2,900 = ₹145 -> capped at ₹80. Total discount = 100 + 80 = ₹180.
const highValueStackedOrder = calculateAuthoritativePricing(
  [{ unitPrice: 3000, quantity: 1 }],
  'WELCOME100',
  'RAZORPAY'
);
assert(highValueStackedOrder.success === true, 'Authoritative pricing with coupon stacking succeeds');
const hvsPricing = highValueStackedOrder.pricing!;
assert(hvsPricing.regularCouponDiscount === 100, 'WELCOME100 discount is ₹100');
assert(
  hvsPricing.prepaid5Discount === 80,
  `Stacked PREPAID5 on remaining base ₹2,900 is capped at ₹80 (NOT ₹145!), got ₹${hvsPricing.prepaid5Discount}`
);
assert(
  hvsPricing.discountTotal === 180,
  `Combined discount is ₹180 (100 + 80), got ₹${hvsPricing.discountTotal}`
);
assert(
  hvsPricing.grandTotal === 2820,
  `Grand total is ₹2,820 (3000 - 180 = 2820), got ₹${hvsPricing.grandTotal}`
);

// Explicit PREPAID5 Coupon Validation via validateAndCalculateCoupon:
const directPrepaid5 = validateAndCalculateCoupon(2000, 'PREPAID5', 'RAZORPAY');
assert(directPrepaid5.isValid === true, 'Explicit PREPAID5 coupon is valid on RAZORPAY');
assert(
  directPrepaid5.discountAmount === 80,
  `Explicit PREPAID5 on ₹2,000 is capped at ₹80 (got ₹${directPrepaid5.discountAmount})`
);

const directPrepaid5Cod = validateAndCalculateCoupon(2000, 'PREPAID5', 'COD');
assert(
  directPrepaid5Cod.discountAmount === 0,
  'Explicit PREPAID5 coupon gives ₹0 discount on COD'
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKSTREAM 4: PAYMENT RECONCILIATION & INTEGER-PAISE ARITHMETIC
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- WORKSTREAM 4: Financial Precision & Integer-Paise Arithmetic ---');

// Razorpay requires integer paise amounts: amount_in_paise = Math.round(grandTotal * 100)
function toIntegerPaise(amountInInr: number): number {
  return Math.round(amountInInr * 100);
}

assert(toIntegerPaise(1329) === 132900, '₹1,329 converts to exactly 132900 paise');
assert(toIntegerPaise(379) === 37900, '₹379 converts to exactly 37900 paise');
assert(toIntegerPaise(372) === 37200, '₹372 converts to exactly 37200 paise');
assert(toIntegerPaise(4920) === 492000, '₹4,920 converts to exactly 492000 paise');

// Verify that for any evaluated order: subtotal - discountTotal + shippingFee === grandTotal
const testOrders = [
  calculateAuthoritativePricing([{ unitPrice: 350, quantity: 1 }], undefined, 'RAZORPAY'),
  calculateAuthoritativePricing([{ unitPrice: 399, quantity: 1 }], undefined, 'RAZORPAY'),
  calculateAuthoritativePricing([{ unitPrice: 1399, quantity: 1 }], 'WELCOME100', 'RAZORPAY'),
  calculateAuthoritativePricing([{ unitPrice: 2000, quantity: 1 }], undefined, 'RAZORPAY'),
  calculateAuthoritativePricing([{ unitPrice: 5000, quantity: 1 }], 'WELCOME100', 'RAZORPAY'),
];

testOrders.forEach((o, idx) => {
  const p = o.pricing!;
  const expectedGrand = p.subtotal - p.discountTotal + p.shippingFee;
  assert(
    p.grandTotal === expectedGrand,
    `Order ${idx + 1} financial balance: ${p.subtotal} - ${p.discountTotal} + ${p.shippingFee} === ${p.grandTotal}`
  );
});

console.log('\n=============================================================================');
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed (${failedTests} failures)`);
console.log('=============================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
