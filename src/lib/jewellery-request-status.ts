import {
  Clock,
  Sparkles,
  TickCircle,
  ShoppingBag,
  Truck,
  XCircle2,
  Alert,
  type IconComponent,
} from 'reicon-react';

export interface StatusBadgeInfo {
  label: string;
  icon: IconComponent;
  bgClass: string;
  dotClass: string;
}

export const getStatusBadgeInfo = (status: string): StatusBadgeInfo => {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pending Review',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 'UNDER_REVIEW':
      return {
        label: 'Under Review',
        icon: Sparkles,
        bgClass: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
        dotClass: 'bg-blue-500',
      };
    case 'QUOTE_SENT':
      return {
        label: 'Quote Sent',
        icon: TickCircle,
        bgClass: 'bg-purple-500/10 text-purple-800 border-purple-500/30',
        dotClass: 'bg-purple-500',
      };
    case 'ADVANCE_PENDING':
      return {
        label: 'Advance Pending',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 'ADVANCE_PAID':
      return {
        label: 'Advance Paid',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'SOURCING':
    case 'SOURCING_IN_PROGRESS':
      return {
        label: 'Sourcing',
        icon: Sparkles,
        bgClass: 'bg-[#B08D57]/15 text-[#6B4B1B] border-[#B08D57]/40',
        dotClass: 'bg-[#B08D57]',
      };
    case 'PRODUCT_RECEIVED':
      return {
        label: 'Product Received',
        icon: ShoppingBag,
        bgClass: 'bg-teal-500/10 text-teal-800 border-teal-500/30',
        dotClass: 'bg-teal-500',
      };
    case 'BALANCE_PENDING':
      return {
        label: 'Balance Pending',
        icon: Clock,
        bgClass: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    case 'BALANCE_PAID':
      return {
        label: 'Balance Paid',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'READY_TO_SHIP':
      return {
        label: 'Ready to Ship',
        icon: ShoppingBag,
        bgClass: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30',
        dotClass: 'bg-indigo-500',
      };
    case 'SHIPPED':
      return {
        label: 'Shipped',
        icon: Truck,
        bgClass: 'bg-sky-500/10 text-sky-800 border-sky-500/30',
        dotClass: 'bg-sky-500',
      };
    case 'DELIVERED':
    case 'COMPLETED':
      return {
        label: 'Delivered',
        icon: TickCircle,
        bgClass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    case 'NOT_SOURCEABLE':
      return {
        label: 'Not Sourceable',
        icon: XCircle2,
        bgClass: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
        dotClass: 'bg-rose-500',
      };
    case 'CANCELLED':
    case 'CLOSED':
      return {
        label: 'Cancelled',
        icon: Alert,
        bgClass: 'bg-gray-500/10 text-gray-700 border-gray-400/30',
        dotClass: 'bg-gray-500',
      };
    default:
      return {
        label: status.replace(/_/g, ' '),
        icon: Clock,
        bgClass: 'bg-[#40000D]/10 text-[#40000D] border-[#40000D]/20',
        dotClass: 'bg-[#40000D]',
      };
  }
};
