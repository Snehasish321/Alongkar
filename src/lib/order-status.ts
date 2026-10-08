import {
  Clock,
  Sparkles,
  TickCircle,
  Truck,
  Alert,
  Layers,
  CloseCircle,
  Refresh,
  type IconComponent,
} from 'reicon-react';
import type { OrderStatus, PaymentStatus, ShippingStatus } from '../types';

export interface StatusBadgeInfo {
  label: string;
  icon: IconComponent;
  bgClass: string;
  dotClass: string;
}

/**
 * Returns human-readable label and styling classes for OrderStatus
 */
export const getOrderStatusBadgeInfo = (status: OrderStatus | string): StatusBadgeInfo => {
  switch (status) {
    case 'PENDING_PAYMENT':
      return {
        label: 'Pending Payment',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmed',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'PROCESSING':
      return {
        label: 'Processing',
        icon: Sparkles,
        bgClass: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
        dotClass: 'bg-blue-500',
      };
    case 'SHIPPED':
      return {
        label: 'Shipped',
        icon: Truck,
        bgClass: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30',
        dotClass: 'bg-indigo-500',
      };
    case 'DELIVERED':
      return {
        label: 'Delivered',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        icon: CloseCircle,
        bgClass: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
        dotClass: 'bg-rose-500',
      };
    default:
      return {
        label: status || 'Unknown',
        icon: Clock,
        bgClass: 'bg-gray-500/10 text-gray-800 border-gray-500/30',
        dotClass: 'bg-gray-500',
      };
  }
};

/**
 * Returns human-readable label and styling classes for PaymentStatus
 */
export const getPaymentStatusBadgeInfo = (status: PaymentStatus | string): StatusBadgeInfo => {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pending',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 'PAID':
      return {
        label: 'Paid',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'FAILED':
      return {
        label: 'Failed',
        icon: Alert,
        bgClass: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
        dotClass: 'bg-rose-500',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        icon: CloseCircle,
        bgClass: 'bg-gray-500/10 text-gray-800 border-gray-500/30',
        dotClass: 'bg-gray-500',
      };
    case 'REFUNDED':
      return {
        label: 'Refunded',
        icon: Refresh,
        bgClass: 'bg-purple-500/10 text-purple-800 border-purple-500/30',
        dotClass: 'bg-purple-500',
      };
    case 'PARTIALLY_REFUNDED':
      return {
        label: 'Partially Refunded',
        icon: Refresh,
        bgClass: 'bg-purple-500/10 text-purple-800 border-purple-500/30',
        dotClass: 'bg-purple-500',
      };
    default:
      return {
        label: status || 'Unknown',
        icon: Clock,
        bgClass: 'bg-gray-500/10 text-gray-800 border-gray-500/30',
        dotClass: 'bg-gray-500',
      };
  }
};

/**
 * Returns human-readable label and styling classes for ShippingStatus
 */
export const getShippingStatusBadgeInfo = (status: ShippingStatus | string): StatusBadgeInfo => {
  switch (status) {
    case 'NOT_READY':
      return {
        label: 'Not Ready',
        icon: Clock,
        bgClass: 'bg-gray-500/10 text-gray-700 border-gray-500/30',
        dotClass: 'bg-gray-500',
      };
    case 'READY':
      return {
        label: 'Ready for Dispatch',
        icon: Sparkles,
        bgClass: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
        dotClass: 'bg-blue-500',
      };
    case 'PROCESSING':
      return {
        label: 'Packaging',
        icon: Layers,
        bgClass: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
        dotClass: 'bg-blue-500',
      };
    case 'SHIPPED':
      return {
        label: 'Shipped',
        icon: Truck,
        bgClass: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30',
        dotClass: 'bg-indigo-500',
      };
    case 'IN_TRANSIT':
      return {
        label: 'In Transit',
        icon: Truck,
        bgClass: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30',
        dotClass: 'bg-indigo-500',
      };
    case 'DELIVERED':
      return {
        label: 'Delivered',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        icon: CloseCircle,
        bgClass: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
        dotClass: 'bg-rose-500',
      };
    case 'RETURNED':
      return {
        label: 'Returned',
        icon: Refresh,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    default:
      return {
        label: status || 'Unknown',
        icon: Clock,
        bgClass: 'bg-gray-500/10 text-gray-800 border-gray-500/30',
        dotClass: 'bg-gray-500',
      };
  }
};

export interface PaymentMethodBadgeInfo {
  label: string;
  detail: string;
  fullLabel: string;
  isCod: boolean;
  isOnline: boolean;
  bgClass: string;
  dotClass: string;
}

/**
 * Returns human-readable label and styling classes for Payment Provider / Method
 */
export const getPaymentMethodBadgeInfo = (provider: string | null | undefined): PaymentMethodBadgeInfo => {
  const isCod = provider?.toUpperCase() === 'COD';
  if (isCod) {
    return {
      label: 'Cash on Delivery',
      detail: 'COD',
      fullLabel: 'Cash on Delivery (COD)',
      isCod: true,
      isOnline: false,
      bgClass: 'bg-amber-700/10 text-amber-900 border-amber-700/25',
      dotClass: 'bg-amber-700',
    };
  }
  return {
    label: 'Paid Online',
    detail: 'Razorpay',
    fullLabel: 'Paid Online (Razorpay)',
    isCod: false,
    isOnline: true,
    bgClass: 'bg-[#8C6C38]/10 text-[#8C6C38] border-[#8C6C38]/30',
    dotClass: 'bg-[#8C6C38]',
  };
};

export interface OrderDiscountBreakdown {
  regularCouponCode?: string;
  regularCouponLabel?: string;
  regularDiscountAmount?: number;
  prepaid5DiscountAmount?: number;
  totalDiscount: number;
}

/**
 * Safely parses persisted discount details from order metadata snapshot
 */
export const parseOrderDiscounts = (order: {
  discountTotal: number;
  adminNotes?: string | null;
  paymentProvider?: string | null;
}): OrderDiscountBreakdown => {
  const totalDiscount = Math.max(0, Number(order.discountTotal) || 0);
  const isCod = order.paymentProvider?.toUpperCase() === 'COD';

  if (!order.adminNotes || totalDiscount === 0) {
    return { totalDiscount };
  }

  let regularCouponCode: string | undefined;
  let regularCouponLabel: string | undefined;
  let regularDiscountAmount: number | undefined;
  let prepaid5DiscountAmount: number | undefined;

  // Match: Applied Coupon: FESTIVE500 (Festive Special ₹500 OFF) - Discount: ₹500
  const couponMatch = order.adminNotes.match(
    /Applied Coupon:\s*([A-Z0-9_-]+)(?:\s*\((.*?)\))?\s*-\s*Discount:\s*₹?(\d+(?:\.\d+)?)/i
  );
  if (couponMatch) {
    regularCouponCode = couponMatch[1];
    regularCouponLabel = couponMatch[2]?.trim() || undefined;
    regularDiscountAmount = parseFloat(couponMatch[3]);
  }

  // Match: Prepaid Incentive (PREPAID5): ₹142 or PREPAID5: ₹142
  if (!isCod) {
    const prepaidMatch =
      order.adminNotes.match(/Prepaid Incentive.*?₹?(\d+(?:\.\d+)?)/i) ||
      order.adminNotes.match(/PREPAID5.*?₹?(\d+(?:\.\d+)?)/i);
    if (prepaidMatch) {
      prepaid5DiscountAmount = parseFloat(prepaidMatch[1]);
    }
  }

  return {
    regularCouponCode,
    regularCouponLabel,
    regularDiscountAmount,
    prepaid5DiscountAmount,
    totalDiscount,
  };
};
