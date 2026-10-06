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
