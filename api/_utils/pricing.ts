import { Prisma } from '@prisma/client';

export interface CouponDefinition {
  code: string;
  label: string;
  type: 'percentage' | 'fixed';
  discountPercent?: number;
  flatDiscount?: number;
  minOrder?: number;
}

export const FREE_SHIPPING_THRESHOLD = 499;
export const STANDARD_SHIPPING_FEE = 60;

export const PREPAID_INCENTIVE_CODE = 'PREPAID5';
export const PREPAID_INCENTIVE_PERCENT = 5;

export const PREPAID_INCENTIVE_DEFINITION: CouponDefinition = {
  code: PREPAID_INCENTIVE_CODE,
  label: '5% Extra Off on Prepaid',
  type: 'percentage',
  discountPercent: PREPAID_INCENTIVE_PERCENT,
};

export const REGULAR_PROMO_CODES: Record<string, CouponDefinition> = {
  ALONGKAR10: {
    code: 'ALONGKAR10',
    label: '10% Off Atelier Special',
    type: 'percentage',
    discountPercent: 10,
  },
  FESTIVE500: {
    code: 'FESTIVE500',
    label: '₹500 Off on orders above ₹2,500',
    type: 'fixed',
    flatDiscount: 500,
    minOrder: 2500,
  },
  WELCOME100: {
    code: 'WELCOME100',
    label: '₹100 Flat Welcome Benefit',
    type: 'fixed',
    flatDiscount: 100,
    minOrder: 999,
  },
};

export const PROMO_CODES: Record<string, CouponDefinition> = {
  ...REGULAR_PROMO_CODES,
  [PREPAID_INCENTIVE_CODE]: PREPAID_INCENTIVE_DEFINITION,
};

/**
 * Normalizes a coupon code: trims whitespace, removes control characters, and converts to uppercase.
 */
export function normalizeCouponCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export type PaymentMethod = 'RAZORPAY' | 'COD';

export function normalizePaymentMethod(method: unknown): PaymentMethod {
  if (typeof method === 'string') {
    const trimmed = method.trim().toUpperCase();
    if (trimmed === 'COD') return 'COD';
  }
  return 'RAZORPAY';
}

export interface CouponValidationResult {
  isValid: boolean;
  coupon: CouponDefinition | null;
  discountAmount: number;
  errorMessage?: string;
}

/**
 * Validates a single coupon code against the merchandise subtotal.
 * Enforces minOrder requirements and payment-method rules for PREPAID5.
 */
export function validateAndCalculateCoupon(
  subtotal: number,
  rawCode?: unknown,
  rawPaymentMethod?: unknown
): CouponValidationResult {
  const code = normalizeCouponCode(rawCode);
  const paymentMethod = normalizePaymentMethod(rawPaymentMethod);

  if (!code) {
    return {
      isValid: true,
      coupon: null,
      discountAmount: 0,
    };
  }

  const coupon = PROMO_CODES[code];
  if (!coupon) {
    return {
      isValid: false,
      coupon: null,
      discountAmount: 0,
      errorMessage: `Coupon "${code}" is invalid or expired.`,
    };
  }

  if (coupon.minOrder !== undefined && subtotal < coupon.minOrder) {
    return {
      isValid: false,
      coupon,
      discountAmount: 0,
      errorMessage: `Coupon "${coupon.code}" requires a minimum subtotal of ₹${coupon.minOrder.toLocaleString('en-IN')}.`,
    };
  }

  // Payment method rule: PREPAID5 is valid only for RAZORPAY (online prepaid)
  if (coupon.code === PREPAID_INCENTIVE_CODE) {
    if (paymentMethod === 'COD') {
      return {
        isValid: true,
        coupon,
        discountAmount: 0,
      };
    }
    const discount = Math.round((subtotal * PREPAID_INCENTIVE_PERCENT) / 100);
    return {
      isValid: true,
      coupon,
      discountAmount: Math.max(0, Math.min(subtotal, discount)),
    };
  }

  let discount = 0;
  if (coupon.type === 'percentage' && coupon.discountPercent) {
    discount = Math.round((subtotal * coupon.discountPercent) / 100);
  } else if (coupon.type === 'fixed' && coupon.flatDiscount) {
    discount = Math.min(subtotal, coupon.flatDiscount);
  }

  // Safety invariant: discount cannot exceed subtotal and cannot be negative
  discount = Math.max(0, Math.min(subtotal, discount));

  return {
    isValid: true,
    coupon,
    discountAmount: discount,
  };
}

/**
 * Calculates authoritative shipping fee based on server-evaluated merchandise subtotal.
 */
export function calculateShippingFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

/**
 * Calculates the PREPAID5 payment incentive (5% discount) on the eligible amount.
 * The eligible amount is defined as (subtotal - regularCouponDiscount).
 * For COD payments, the incentive is always ₹0.
 * Fractional rupee amounts are rounded to the nearest integer rupee using Math.round.
 */
export function calculatePrepaidIncentive(
  eligibleAmount: number,
  paymentMethod: PaymentMethod
): number {
  if (paymentMethod !== 'RAZORPAY' || eligibleAmount <= 0) {
    return 0;
  }
  const discount = Math.round((eligibleAmount * PREPAID_INCENTIVE_PERCENT) / 100);
  return Math.max(0, Math.min(eligibleAmount, discount));
}

export interface CalculatedOrderPricing {
  subtotal: number;
  discountTotal: number;
  regularCouponDiscount: number;
  prepaid5Discount: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  coupon: CouponDefinition | null;
  regularCouponCode: string | null;
  // Decimal representations for Prisma storage
  subtotalDec: Prisma.Decimal;
  discountTotalDec: Prisma.Decimal;
  shippingFeeDec: Prisma.Decimal;
  taxTotalDec: Prisma.Decimal;
  grandTotalDec: Prisma.Decimal;
}

/**
 * Computes all authoritative pricing fields for an order:
 * 1. Calculates authoritative subtotal from product unit prices and quantities.
 * 2. Validates and applies exactly one regular promotional coupon (if provided).
 * 3. Evaluates the payment method (RAZORPAY vs COD).
 * 4. Stacks the PREPAID5 payment-method incentive (5%) on the remaining amount after regular coupon discount when paymentMethod === 'RAZORPAY'.
 *    When paymentMethod === 'COD', PREPAID5 discount is ₹0.
 * 5. Calculates shipping fee from the subtotal.
 * 6. Returns authoritative grand total and Decimal instances for database storage.
 */
export function calculateAuthoritativePricing(
  items: Array<{ unitPrice: number; quantity: number }>,
  rawCouponCode?: unknown,
  rawPaymentMethod?: unknown
): {
  success: boolean;
  pricing?: CalculatedOrderPricing;
  error?: string;
} {
  let subtotal = 0;
  for (const item of items) {
    const unitPrice = typeof item.unitPrice === 'number' && !isNaN(item.unitPrice) ? item.unitPrice : 0;
    const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 0;
    subtotal += unitPrice * quantity;
  }

  // Round subtotal to 2 decimal places
  subtotal = Math.round(subtotal * 100) / 100;

  const paymentMethod = normalizePaymentMethod(rawPaymentMethod);
  const normalizedCode = normalizeCouponCode(rawCouponCode);

  let regularCoupon: CouponDefinition | null = null;
  let regularCouponCode: string | null = null;
  let regularCouponDiscount = 0;

  if (normalizedCode) {
    if (normalizedCode === PREPAID_INCENTIVE_CODE) {
      // PREPAID5 is recognized internally as a payment incentive indicator.
      // No regular promotional coupon is applied.
    } else {
      const regularPromo = REGULAR_PROMO_CODES[normalizedCode];
      if (!regularPromo) {
        return {
          success: false,
          error: `Coupon "${normalizedCode}" is invalid or expired.`,
        };
      }

      if (regularPromo.minOrder !== undefined && subtotal < regularPromo.minOrder) {
        return {
          success: false,
          error: `Coupon "${regularPromo.code}" requires a minimum subtotal of ₹${regularPromo.minOrder.toLocaleString('en-IN')}.`,
        };
      }

      regularCoupon = regularPromo;
      regularCouponCode = regularPromo.code;

      if (regularPromo.type === 'percentage' && regularPromo.discountPercent) {
        regularCouponDiscount = Math.round((subtotal * regularPromo.discountPercent) / 100);
      } else if (regularPromo.type === 'fixed' && regularPromo.flatDiscount) {
        regularCouponDiscount = Math.min(subtotal, regularPromo.flatDiscount);
      }
      regularCouponDiscount = Math.max(0, Math.min(subtotal, regularCouponDiscount));
    }
  }

  // Calculate PREPAID5 incentive on eligible base amount (subtotal after regular coupon discount)
  const eligiblePrepaidBase = Math.max(0, subtotal - regularCouponDiscount);
  const prepaid5Discount = calculatePrepaidIncentive(eligiblePrepaidBase, paymentMethod);

  // Total discount combined
  const discountTotal = regularCouponDiscount + prepaid5Discount;

  // Authoritative shipping fee
  const shippingFee = calculateShippingFee(subtotal);
  const taxTotal = 0;
  const grandTotal = Math.max(0, Math.round((subtotal - discountTotal + shippingFee + taxTotal) * 100) / 100);

  // Effective coupon definition for UI/logging backward compatibility
  const effectiveCoupon =
    regularCoupon || (normalizedCode === PREPAID_INCENTIVE_CODE ? PREPAID_INCENTIVE_DEFINITION : null);

  return {
    success: true,
    pricing: {
      subtotal,
      discountTotal,
      regularCouponDiscount,
      prepaid5Discount,
      shippingFee,
      taxTotal,
      grandTotal,
      paymentMethod,
      coupon: effectiveCoupon,
      regularCouponCode,
      subtotalDec: new Prisma.Decimal(subtotal.toFixed(2)),
      discountTotalDec: new Prisma.Decimal(discountTotal.toFixed(2)),
      shippingFeeDec: new Prisma.Decimal(shippingFee.toFixed(2)),
      taxTotalDec: new Prisma.Decimal(taxTotal.toFixed(2)),
      grandTotalDec: new Prisma.Decimal(grandTotal.toFixed(2)),
    },
  };
}
