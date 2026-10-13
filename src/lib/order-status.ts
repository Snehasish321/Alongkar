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
import type { OrderStatus, PaymentStatus, ShippingStatus } from '../types/index.js';

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

  // Match: Prepaid Incentive (PREPAID5): ₹70 or PREPAID5: ₹70
  if (!isCod) {
    // Specifically require a colon or explicit "- Discount:" delimiter followed by the amount,
    // avoiding matching the numeral "5" inside the token "PREPAID5" or "(5% Extra Off)"
    const prepaidMatch = order.adminNotes.match(
      /(?:Prepaid Incentive|PREPAID5)[^:\n\r|]*?(?::|\bDiscount:)\s*₹?\s*(\d+(?:\.\d+)?)/i
    );
    if (prepaidMatch) {
      prepaid5DiscountAmount = parseFloat(prepaidMatch[1]);
    }

    // Defensive reconciliation with authoritative totalDiscount:
    // If regular discount was parsed (or absent) and prepaid incentive was mentioned,
    // verify the sum matches totalDiscount. If not, or if prepaidMatch was missed,
    // reconcile against (totalDiscount - regularDiscountAmount).
    const regularPart = regularDiscountAmount || 0;
    const remainingDiscount = Math.max(0, totalDiscount - regularPart);

    if (prepaid5DiscountAmount !== undefined) {
      if (regularPart + prepaid5DiscountAmount !== totalDiscount && remainingDiscount > 0) {
        prepaid5DiscountAmount = remainingDiscount;
      }
    } else if (
      remainingDiscount > 0 &&
      (order.adminNotes.includes('PREPAID5') || /Prepaid Incentive/i.test(order.adminNotes))
    ) {
      prepaid5DiscountAmount = remainingDiscount;
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

export type FulfilmentStage =
  | 'REVIEWING'
  | 'PACKAGING'
  | 'PICKUP_BY_DELIVERY_PARTNER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export const FULFILMENT_STAGE_SEQUENCE: FulfilmentStage[] = [
  'REVIEWING',
  'PACKAGING',
  'PICKUP_BY_DELIVERY_PARTNER',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const FULFILMENT_STAGE_METADATA: Record<
  FulfilmentStage,
  {
    stage: FulfilmentStage;
    label: string;
    description: string;
    actionButtonLabel?: string;
    nextStage?: FulfilmentStage;
    targetOrderStatus: OrderStatus;
    targetShippingStatus: ShippingStatus;
  }
> = {
  REVIEWING: {
    stage: 'REVIEWING',
    label: 'Order Review',
    description: 'Order confirmed and awaiting packaging preparation',
    actionButtonLabel: 'Move to Packaging',
    nextStage: 'PACKAGING',
    targetOrderStatus: 'CONFIRMED',
    targetShippingStatus: 'READY',
  },
  PACKAGING: {
    stage: 'PACKAGING',
    label: 'Packaging',
    description: 'Jewellery is being packaged and prepared for carrier pickup',
    actionButtonLabel: 'Mark Ready for Pickup',
    nextStage: 'PICKUP_BY_DELIVERY_PARTNER',
    targetOrderStatus: 'PROCESSING',
    targetShippingStatus: 'PROCESSING',
  },
  PICKUP_BY_DELIVERY_PARTNER: {
    stage: 'PICKUP_BY_DELIVERY_PARTNER',
    label: 'Courier Pickup',
    description: 'Dispatched and handed over to delivery partner',
    actionButtonLabel: 'Mark Out for Delivery',
    nextStage: 'OUT_FOR_DELIVERY',
    targetOrderStatus: 'SHIPPED',
    targetShippingStatus: 'SHIPPED',
  },
  OUT_FOR_DELIVERY: {
    stage: 'OUT_FOR_DELIVERY',
    label: 'Out for Delivery',
    description: 'Package is in transit with courier for local delivery',
    actionButtonLabel: 'Mark Delivered',
    nextStage: 'DELIVERED',
    targetOrderStatus: 'SHIPPED',
    targetShippingStatus: 'IN_TRANSIT',
  },
  DELIVERED: {
    stage: 'DELIVERED',
    label: 'Delivered',
    description: 'Order successfully delivered to customer',
    targetOrderStatus: 'DELIVERED',
    targetShippingStatus: 'DELIVERED',
  },
};

/**
 * Pure evaluator mapping database OrderStatus and ShippingStatus to the human fulfilment lifecycle stage.
 */
export function getOrderFulfilmentStage(order: {
  status?: string | null;
  shippingStatus?: string | null;
}): FulfilmentStage | null {
  const status = (order?.status || '').toUpperCase();
  const shipping = (order?.shippingStatus || '').toUpperCase();

  if (status === 'CANCELLED' || shipping === 'CANCELLED') {
    return null;
  }

  if (status === 'DELIVERED' || shipping === 'DELIVERED') {
    return 'DELIVERED';
  }

  if (shipping === 'IN_TRANSIT') {
    return 'OUT_FOR_DELIVERY';
  }

  if (status === 'SHIPPED' || shipping === 'SHIPPED') {
    return 'PICKUP_BY_DELIVERY_PARTNER';
  }

  if (status === 'PROCESSING' || shipping === 'PROCESSING') {
    return 'PACKAGING';
  }

  return 'REVIEWING';
}

export interface CancellationRequestDetails {
  status: 'PENDING' | 'REJECTED' | 'APPROVED' | null;
  requestedAt: Date | string | null;
  requestReason: string | null;
  resolvedAt: Date | string | null;
  rejectionReason: string | null;
}

/**
 * Extracts and normalizes customer cancellation request details for an order.
 * Works seamlessly with dedicated database columns when present, and safely
 * reconstructs state from cancelReason and adminNotes in fallback mode.
 */
export function getCancellationRequestDetails(order: {
  status?: string | null;
  cancelledAt?: Date | string | null;
  updatedAt?: Date | string | null;
  cancelReason?: string | null;
  adminNotes?: string | null;
  customerNotes?: string | null;
  cancellationRequestStatus?: string | null;
  cancellationRequestedAt?: Date | string | null;
  cancellationRequestReason?: string | null;
  cancellationResolvedAt?: Date | string | null;
  cancellationRejectionReason?: string | null;
}): CancellationRequestDetails {
  if (!order) {
    return {
      status: null,
      requestedAt: null,
      requestReason: null,
      resolvedAt: null,
      rejectionReason: null,
    };
  }

  // 1. Dedicated column mode (authoritative when present)
  if (order.cancellationRequestStatus && typeof order.cancellationRequestStatus === 'string') {
    const upper = order.cancellationRequestStatus.trim().toUpperCase() as 'PENDING' | 'REJECTED' | 'APPROVED';
    if (['PENDING', 'REJECTED', 'APPROVED'].includes(upper)) {
      return {
        status: upper,
        requestedAt: order.cancellationRequestedAt || null,
        requestReason: order.cancellationRequestReason || null,
        resolvedAt: order.cancellationResolvedAt || (upper === 'APPROVED' ? order.cancelledAt || null : null),
        rejectionReason: order.cancellationRejectionReason || null,
      };
    }
  }

  // 2. Fallback mode: evaluate adminNotes and cancelReason
  const adminNotes = typeof order.adminNotes === 'string' ? order.adminNotes : '';
  const cancelReason = typeof order.cancelReason === 'string' ? order.cancelReason.trim() : '';

  // Scan adminNotes for structured markers and legacy audit lines with order-of-occurrence tracking
  const pendingPatterns = [
    /\[cancellation_pending\]/gi,
    /\[cancellation_request:pending\]/gi,
    /cancellation requested by customer/gi,
  ];

  const rejectedPatterns = [
    /\[cancellation_rejected\]/gi,
    /\[cancellation_request:rejected\]/gi,
    /cancellation request rejected by admin/gi,
    /cancellation request rejected/gi,
  ];

  const approvedPatterns = [
    /\[cancellation_approved\]/gi,
    /\[cancellation_request:approved\]/gi,
    /cancellation request approved by administrator/gi,
    /cancellation request approved/gi,
  ];

  let lastPendingIdx = -1;
  let lastRejectedIdx = -1;
  let lastApprovedIdx = -1;

  for (const pat of pendingPatterns) {
    let match;
    while ((match = pat.exec(adminNotes)) !== null) {
      if (match.index > lastPendingIdx) lastPendingIdx = match.index;
    }
  }

  for (const pat of rejectedPatterns) {
    let match;
    while ((match = pat.exec(adminNotes)) !== null) {
      if (match.index > lastRejectedIdx) lastRejectedIdx = match.index;
    }
  }

  for (const pat of approvedPatterns) {
    let match;
    while ((match = pat.exec(adminNotes)) !== null) {
      if (match.index > lastApprovedIdx) lastApprovedIdx = match.index;
    }
  }

  const isCancelReasonRejected = cancelReason.startsWith('[REJECTED]');
  const isCancelReasonCustomerRequest = cancelReason.startsWith('Customer requested cancellation') ||
    cancelReason.toLowerCase().startsWith('customer requested cancellation');

  // Case A: Latest event is REJECTED
  if (lastRejectedIdx > -1 && lastRejectedIdx > lastPendingIdx) {
    let rejectionReason: string | null = null;
    const rejectionSlice = adminNotes.slice(lastRejectedIdx);
    const endOfEntry = rejectionSlice.indexOf('|');
    const entryText = endOfEntry > -1 ? rejectionSlice.slice(0, endOfEntry) : rejectionSlice;
    const reasonQuoteMatch = entryText.match(/:\s*"?([^"|]+)"?/);
    if (reasonQuoteMatch && reasonQuoteMatch[1]) {
      rejectionReason = reasonQuoteMatch[1].trim();
    }

    let requestReason: string | null = null;
    if (isCancelReasonRejected) {
      requestReason = cancelReason.replace(/^\[REJECTED\]\s*/i, '').replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null;
    } else if (cancelReason) {
      requestReason = cancelReason.replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null;
    }

    return {
      status: 'REJECTED',
      requestedAt: order.updatedAt || null,
      requestReason,
      resolvedAt: order.updatedAt || null,
      rejectionReason,
    };
  }

  if (isCancelReasonRejected && lastPendingIdx === -1) {
    const requestReason = cancelReason.replace(/^\[REJECTED\]\s*/i, '').replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null;
    return {
      status: 'REJECTED',
      requestedAt: order.updatedAt || null,
      requestReason,
      resolvedAt: order.updatedAt || null,
      rejectionReason: null,
    };
  }

  // Case B: Latest event is APPROVED
  if (lastApprovedIdx > -1 && lastApprovedIdx > lastPendingIdx) {
    return {
      status: 'APPROVED',
      requestedAt: order.updatedAt || null,
      requestReason: cancelReason.replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null,
      resolvedAt: order.cancelledAt || order.updatedAt || null,
      rejectionReason: null,
    };
  }

  if (order.status === 'CANCELLED') {
    if (lastPendingIdx > -1 || isCancelReasonCustomerRequest) {
      return {
        status: 'APPROVED',
        requestedAt: order.updatedAt || null,
        requestReason: cancelReason.replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null,
        resolvedAt: order.cancelledAt || order.updatedAt || null,
        rejectionReason: null,
      };
    }
    return {
      status: null,
      requestedAt: null,
      requestReason: null,
      resolvedAt: null,
      rejectionReason: null,
    };
  }

  // Case C: Active order with pending cancellation request
  if (
    lastPendingIdx > -1 ||
    isCancelReasonCustomerRequest ||
    (cancelReason.length > 0 && !isCancelReasonRejected && order.status !== 'CANCELLED')
  ) {
    let requestReason: string | null = null;
    if (cancelReason) {
      requestReason = cancelReason.replace(/^Customer requested cancellation(?:\s*\([^)]*\))?:?\s*/i, '').trim() || null;
    } else if (lastPendingIdx > -1) {
      const pendingSlice = adminNotes.slice(lastPendingIdx);
      const endOfEntry = pendingSlice.indexOf('|');
      const entryText = endOfEntry > -1 ? pendingSlice.slice(0, endOfEntry) : pendingSlice;
      const match = entryText.match(/:\s*(.+)$/);
      if (match && match[1]) requestReason = match[1].trim();
    }

    return {
      status: 'PENDING',
      requestedAt: order.updatedAt || null,
      requestReason,
      resolvedAt: null,
      rejectionReason: null,
    };
  }

  return {
    status: null,
    requestedAt: null,
    requestReason: null,
    resolvedAt: null,
    rejectionReason: null,
  };
}

/**
 * Checks whether an active order has a pending, unresolved customer cancellation request.
 * Prioritizes the dedicated CancellationRequestStatus enum when present, while preserving
 * verified legacy compatibility with unmigrated orders.
 */
export function hasPendingCancellationRequest(order: {
  status?: string | null;
  cancelReason?: string | null;
  customerNotes?: string | null;
  adminNotes?: string | null;
  cancellationRequestStatus?: string | null;
}): boolean {
  if (!order || order.status === 'CANCELLED') return false;

  // 1. Explicit dedicated CancellationRequestStatus enum (authoritative for new requests)
  if (order.cancellationRequestStatus && typeof order.cancellationRequestStatus === 'string') {
    const reqStatus = order.cancellationRequestStatus.trim().toUpperCase();
    if (reqStatus === 'PENDING') return true;
    if (reqStatus === 'REJECTED' || reqStatus === 'APPROVED') return false;
  }

  // 2. Evaluated fallback state (tracks latest chronological request event in adminNotes/cancelReason)
  const details = getCancellationRequestDetails(order);
  if (details.status === 'PENDING') return true;
  if (details.status === 'REJECTED' || details.status === 'APPROVED') return false;

  // 3. Legacy fallback: customerNotes indicating customer cancellation intent (if not resolved)
  if (order.customerNotes && typeof order.customerNotes === 'string') {
    const lower = order.customerNotes.toLowerCase();
    if (
      lower.includes('please cancel') ||
      lower.includes('request cancel') ||
      lower.includes('cancel this order')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Pure evaluator checking whether an order is currently eligible for customer-initiated cancellation.
 * Only orders in Reviewing or Packaging that have not been dispatched, delivered, or cancelled,
 * and do not already have a pending cancellation request, are eligible.
 */
export function isOrderCancellationEligible(order: {
  status?: string | null;
  shippingStatus?: string | null;
  paymentStatus?: string | null;
  cancelReason?: string | null;
  customerNotes?: string | null;
  adminNotes?: string | null;
  cancellationRequestStatus?: string | null;
}): boolean {
  if (!order) return false;

  const status = (order.status || '').toUpperCase();
  const shipping = (order.shippingStatus || '').toUpperCase();

  // Terminal or dispatched orders cannot be cancelled by customer
  if (status === 'CANCELLED' || shipping === 'CANCELLED') return false;
  if (status === 'DELIVERED' || shipping === 'DELIVERED') return false;
  if (status === 'SHIPPED' || shipping === 'SHIPPED' || shipping === 'IN_TRANSIT') return false;

  // Already requested / pending review
  if (hasPendingCancellationRequest(order)) return false;

  // Lifecycle check: Only orders in Reviewing or Packaging
  const stage = getOrderFulfilmentStage(order);
  return stage === 'REVIEWING' || stage === 'PACKAGING';
}
