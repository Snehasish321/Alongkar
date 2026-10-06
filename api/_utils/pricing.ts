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

export const PROMO_CODES: Record<string, CouponDefinition> = {
  ALONGKAR10: {
    code: 'ALONGKAR10',
    label: '10% Off Atelier Special',
    type: 'percentage',
    discountPercent: 10,
  },
  PREPAID5: {
    code: 'PREPAID5',
    label: '5% Extra Off on Prepaid',
    type: 'percentage',
    discountPercent: 5,
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

/**
 * Normalizes a coupon code: trims whitespace, removes control characters, and converts to uppercase.
 */
export function normalizeCouponCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CouponValidationResult {
  isValid: boolean;
  coupon: CouponDefinition | null;
  discountAmount: number;
  errorMessage?: string;
}

/**
 * Validates a coupon code against the current merchandise subtotal and calculates the discount.
 */
export function validateAndCalculateCoupon(
  subtotal: number,
  rawCode?: unknown
): CouponValidationResult {
  const code = normalizeCouponCode(rawCode);
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

export interface CalculatedOrderPricing {
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  coupon: CouponDefinition | null;
  // Decimal representations for Prisma storage
  subtotalDec: Prisma.Decimal;
  discountTotalDec: Prisma.Decimal;
  shippingFeeDec: Prisma.Decimal;
  taxTotalDec: Prisma.Decimal;
  grandTotalDec: Prisma.Decimal;
}

/**
 * Computes all authoritative pricing fields for an order from server product prices,
 * quantities, and optional coupon code.
 */
export function calculateAuthoritativePricing(
  items: Array<{ unitPrice: number; quantity: number }>,
  rawCouponCode?: unknown
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

  const couponResult = validateAndCalculateCoupon(subtotal, rawCouponCode);
  if (!couponResult.isValid) {
    return {
      success: false,
      error: couponResult.errorMessage || 'Invalid coupon.',
    };
  }

  const discountTotal = couponResult.discountAmount;
  const shippingFee = calculateShippingFee(subtotal);
  const taxTotal = 0;
  const grandTotal = Math.max(0, Math.round((subtotal - discountTotal + shippingFee + taxTotal) * 100) / 100);

  return {
    success: true,
    pricing: {
      subtotal,
      discountTotal,
      shippingFee,
      taxTotal,
      grandTotal,
      coupon: couponResult.coupon,
      subtotalDec: new Prisma.Decimal(subtotal.toFixed(2)),
      discountTotalDec: new Prisma.Decimal(discountTotal.toFixed(2)),
      shippingFeeDec: new Prisma.Decimal(shippingFee.toFixed(2)),
      taxTotalDec: new Prisma.Decimal(taxTotal.toFixed(2)),
      grandTotalDec: new Prisma.Decimal(grandTotal.toFixed(2)),
    },
  };
}
