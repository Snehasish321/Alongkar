import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  X,
  ShoppingBag,
  Calendar,
  User,
  MapPoint,
  CreditCard,
  Truck,
  Sparkles,
  Layers,
  Copy,
  Check,
  Alert,
  XCircle2,
  Refresh,
} from 'reicon-react';
import type { Order } from '../../types';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getShippingStatusBadgeInfo,
  getPaymentMethodBadgeInfo,
  parseOrderDiscounts,
} from '../../lib/order-status';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';
import { cancelAdminOrder, retryAdminRefund } from '../../services/orderApi';

interface AdminOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onOrderUpdated?: (updatedOrder: Order) => void;
}

export const AdminOrderDetailModal: React.FC<AdminOrderDetailModalProps> = ({
  isOpen,
  onClose,
  order: initialOrder,
  onOrderUpdated,
}) => {
  const { getToken } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Local order tracking for immediate UI updates upon action
  const [currentOrder, setCurrentOrder] = useState<Order | null>(initialOrder);

  // Cancellation & Refund Retry State
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetryingRefund, setIsRetryingRefund] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  useEffect(() => {
    setCurrentOrder(initialOrder);
    setIsConfirmCancelOpen(false);
    setCancelReason('');
    setCancelError(null);
    setCancelFeedback(null);
    setIsRetryingRefund(false);
  }, [initialOrder, isOpen]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Lock body scroll when modal is open and restore on close
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !currentOrder) return null;
  const order = currentOrder;

  const isCancellable = Boolean(
    order &&
      order.status !== 'CANCELLED' &&
      order.status !== 'DELIVERED' &&
      order.shippingStatus !== 'DELIVERED' &&
      order.shippingStatus !== 'SHIPPED' &&
      order.shippingStatus !== 'IN_TRANSIT' &&
      order.paymentStatus !== 'REFUNDED'
  );

  const isCod = (order.paymentProvider || '').toUpperCase() === 'COD';
  const isPaidPrepaid = !isCod && order.paymentStatus === 'PAID';

  const isRefundRetryable = Boolean(
    order &&
      order.status === 'CANCELLED' &&
      order.paymentStatus === 'PAID' &&
      !isCod &&
      Boolean(order.paymentTransactionId)
  );

  const handleExecuteRefundRetry = async () => {
    if (!order || isRetryingRefund) return;
    setIsRetryingRefund(true);
    setCancelError(null);
    setCancelFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }

      const res = await retryAdminRefund(token, {
        orderId: order.id,
      });

      if (res.order) {
        setCurrentOrder(res.order);
        if (onOrderUpdated) {
          onOrderUpdated(res.order);
        }
      }
      setCancelFeedback(res.message || 'Refund successfully processed.');
    } catch (err: any) {
      console.error('Failed to retry refund:', err);
      setCancelError(err.message || 'Failed to process refund. Please try again.');
    } finally {
      setIsRetryingRefund(false);
    }
  };

  const handleExecuteCancellation = async () => {
    if (!order || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    setCancelFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }

      const res = await cancelAdminOrder(token, {
        orderId: order.id,
        cancelReason: cancelReason.trim() || undefined,
      });

      setCurrentOrder(res.order);
      setCancelFeedback(res.message || 'Order successfully cancelled.');
      setIsConfirmCancelOpen(false);

      if (onOrderUpdated) {
        onOrderUpdated(res.order);
      }
    } catch (err: any) {
      console.error('Failed to cancel order:', err);
      setCancelError(err.message || 'Failed to cancel order. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const orderBadge = getOrderStatusBadgeInfo(order.status);
  const paymentBadge = getPaymentStatusBadgeInfo(order.paymentStatus);
  const shippingBadge = getShippingStatusBadgeInfo(order.shippingStatus);
  const paymentMethodBadge = getPaymentMethodBadgeInfo(order.paymentProvider);
  const discountBreakdown = parseOrderDiscounts(order);

  const OrderIcon = orderBadge.icon;
  const PaymentIcon = paymentBadge.icon;
  const ShippingIcon = shippingBadge.icon;

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const formattedPaidAt = order.paidAt
    ? new Date(order.paidAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const formattedShippedAt = order.shippedAt
    ? new Date(order.shippedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const formattedDeliveredAt = order.deliveredAt
    ? new Date(order.deliveredAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const hasFulfillmentData = Boolean(
    order.shipmentProvider ||
      order.shipmentOrderId ||
      order.shipmentTrackingNumber ||
      order.shipmentAwbCode ||
      order.shippedAt ||
      order.deliveredAt
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#07030A]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-4xl bg-[#140B1A] border border-[#D6B878]/30 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[92vh] text-[#EDE4D5]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-order-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#180F20] border-b border-[#D6B878]/20 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="admin-order-modal-title"
                  className="font-serif text-lg sm:text-xl font-bold text-[#F8F4EC] tracking-wide"
                >
                  Order #{order.orderNumber}
                </h2>
                <button
                  type="button"
                  onClick={() => handleCopy(order.orderNumber, 'order-num')}
                  className="p-1 rounded text-white/40 hover:text-[#D6B878] hover:bg-white/5 transition-colors"
                  title="Copy Order Number"
                  aria-label="Copy Order Number"
                >
                  {copiedId === 'order-num' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/50">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                <span className="text-white/20">•</span>
                <span className="font-mono text-[11px] text-white/40">ID: {order.id}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Status Overview Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-1">
                Order Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${orderBadge.bgClass}`}
              >
                <OrderIcon className="w-3.5 h-3.5" />
                {orderBadge.label}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-1">
                Payment Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${paymentBadge.bgClass}`}
              >
                <PaymentIcon className="w-3.5 h-3.5" />
                {paymentBadge.label}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-1">
                Payment Method
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${paymentMethodBadge.bgClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${paymentMethodBadge.dotClass}`} />
                {paymentMethodBadge.label}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-1">
                Shipping Status
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${shippingBadge.bgClass}`}
              >
                <ShippingIcon className="w-3.5 h-3.5" />
                {shippingBadge.label}
              </span>
            </div>
          </div>

          {/* Customer and Delivery Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Snapshot */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <User className="w-4 h-4" />
                Customer Information
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/50">Name:</span>
                  <span className="font-medium text-white/90">{order.customerName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/50">Email:</span>
                  <span className="font-medium text-white/90 break-all">{order.customerEmail}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/50">Phone:</span>
                  <span className="font-medium text-white/90">{order.customerPhone || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-white/50">User Account ID:</span>
                  <span className="font-mono text-[11px] text-white/50">{order.userId}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address Snapshot */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <MapPoint className="w-4 h-4" />
                Shipping Address
              </div>
              <div className="text-xs text-white/80 space-y-1">
                <p className="font-medium text-white/90">{order.customerName}</p>
                <p>{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state} -{' '}
                  <span className="font-mono font-medium text-[#D6B878]">{order.shippingAddress.pincode}</span>
                </p>
                <p className="text-white/50">{order.shippingAddress.country || 'India'}</p>
              </div>
            </div>
          </div>

          {/* Order Items Table (Historical Snapshot) */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <Layers className="w-4 h-4" />
                Order Items ({order.items?.length || 0})
              </div>
              <span className="text-[11px] text-white/40">Historical snapshot data</span>
            </div>

            <div className="divide-y divide-white/5">
              {order.items?.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={getOptimizedImageUrl(item.productImage, IMAGE_PRESETS.THUMB_SM)}
                      alt={item.productName}
                      className="w-12 h-12 rounded-lg object-cover bg-white/5 border border-white/10 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f';
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white/90 truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 text-[11px] text-white/40">
                        <span>Qty: {item.quantity}</span>
                        {item.productSku && (
                          <>
                            <span>•</span>
                            <span className="font-mono">SKU: {item.productSku}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>₹{item.unitPrice.toLocaleString('en-IN')} each</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-[#EDE4D5]">
                      ₹{item.lineTotal.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing & Financial Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment & Gateway Data */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <CreditCard className="w-4 h-4" />
                Payment Gateway Details
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/50">Provider:</span>
                  <span className="font-medium text-white/90">{order.paymentProvider || 'N/A'}</span>
                </div>
                {order.paymentOrderId && (
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/50">Gateway Order ID:</span>
                    <span className="font-mono text-[11px] text-white/70">{order.paymentOrderId}</span>
                  </div>
                )}
                {order.paymentTransactionId && (
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/50">Transaction ID:</span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {order.paymentTransactionId}
                    </span>
                  </div>
                )}
                {formattedPaidAt && (
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/50">Paid At:</span>
                    <span className="font-medium text-white/90">{formattedPaidAt}</span>
                  </div>
                )}
                {order.paymentFailureReason && (
                  <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px]">
                    <span className="font-semibold block mb-0.5">Failure Reason:</span>
                    {order.paymentFailureReason}
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <Sparkles className="w-4 h-4" />
                Financial Breakdown
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-white/70">
                  <span>Items Subtotal</span>
                  <span>₹{order.subtotal.toLocaleString('en-IN')}</span>
                </div>

                {discountBreakdown.regularDiscountAmount ? (
                  <div className="flex justify-between text-emerald-400">
                    <span>
                      Coupon Discount ({discountBreakdown.regularCouponCode || 'PROMO'})
                    </span>
                    <span>-₹{discountBreakdown.regularDiscountAmount.toLocaleString('en-IN')}</span>
                  </div>
                ) : null}

                {discountBreakdown.prepaid5DiscountAmount ? (
                  <div className="flex justify-between text-[#D6B878]">
                    <span>Prepaid Benefit (5% Extra Off)</span>
                    <span>-₹{discountBreakdown.prepaid5DiscountAmount.toLocaleString('en-IN')}</span>
                  </div>
                ) : null}

                <div className="flex justify-between text-white/70">
                  <span>Shipping Fee</span>
                  <span>
                    {order.shippingFee === 0 ? (
                      <span className="text-emerald-400 font-medium">Free</span>
                    ) : (
                      `₹${order.shippingFee.toLocaleString('en-IN')}`
                    )}
                  </span>
                </div>

                {order.taxTotal > 0 && (
                  <div className="flex justify-between text-white/70">
                    <span>Estimated Tax</span>
                    <span>₹{order.taxTotal.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm font-bold">
                  <span className="text-[#F8F4EC]">Grand Total</span>
                  <span className="text-base text-[#D6B878] font-serif">
                    ₹{order.grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Fulfillment Info (if available) */}
          {hasFulfillmentData && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#D6B878]">
                <Truck className="w-4 h-4" />
                Fulfillment Information
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {order.shipmentProvider && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">Carrier / Provider</span>
                    <span className="font-medium text-white/90">{order.shipmentProvider}</span>
                  </div>
                )}
                {order.shipmentOrderId && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">Shipment Order ID</span>
                    <span className="font-mono text-white/90">{order.shipmentOrderId}</span>
                  </div>
                )}
                {order.shipmentTrackingNumber && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">Tracking Number</span>
                    <span className="font-mono text-white/90">{order.shipmentTrackingNumber}</span>
                  </div>
                )}
                {order.shipmentAwbCode && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">AWB Code</span>
                    <span className="font-mono text-[#D6B878]">{order.shipmentAwbCode}</span>
                  </div>
                )}
                {formattedShippedAt && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">Shipped At</span>
                    <span className="font-medium text-white/90">{formattedShippedAt}</span>
                  </div>
                )}
                {formattedDeliveredAt && (
                  <div>
                    <span className="text-white/40 block text-[10px] uppercase">Delivered At</span>
                    <span className="font-medium text-white/90">{formattedDeliveredAt}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cancel Feedback Banner */}
          {cancelFeedback && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{cancelFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelFeedback(null)}
                className="text-emerald-400/60 hover:text-emerald-300 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Action Error Banner (e.g. from refund retry) */}
          {cancelError && !isConfirmCancelOpen && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Alert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{cancelError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelError(null)}
                className="text-rose-400/60 hover:text-rose-300 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Notes & Comments */}
          {(order.customerNotes || order.adminNotes) && (
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-2 text-xs">
              {order.customerNotes && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-0.5">
                    Customer Delivery Instructions:
                  </span>
                  <p className="text-white/80 bg-white/5 p-2 rounded">{order.customerNotes}</p>
                </div>
              )}
              {order.adminNotes && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-white/40 block mb-0.5">
                    System / Admin Notes:
                  </span>
                  <p className="text-white/60 font-mono text-[11px] bg-white/5 p-2 rounded">
                    {order.adminNotes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-[#180F20] border-t border-[#D6B878]/20 text-xs text-white/40">
          <div className="flex items-center gap-2">
            {isCancellable && (
              <button
                type="button"
                onClick={() => {
                  setCancelError(null);
                  setIsConfirmCancelOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <XCircle2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Cancel Order</span>
              </button>
            )}
            {isRefundRetryable && (
              <button
                type="button"
                onClick={handleExecuteRefundRetry}
                disabled={isRetryingRefund}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRetryingRefund ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing Refund...</span>
                  </>
                ) : (
                  <>
                    <Refresh className="w-3.5 h-3.5 text-amber-400" />
                    <span>Retry Refund</span>
                  </>
                )}
              </button>
            )}
            {!isCancellable && !isRefundRetryable && (
              <span className="text-[11px] text-white/30 italic">
                {order.status === 'CANCELLED'
                  ? 'Order is cancelled'
                  : order.status === 'DELIVERED'
                  ? 'Order is delivered'
                  : 'Read-only view'}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#EDE4D5] font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Cancel Order Confirmation Dialog Overlay */}
      {isConfirmCancelOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#07030A]/90 backdrop-blur-md">
          <div
            className="relative w-full max-w-md bg-[#180F20] border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-[#EDE4D5]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Alert className="w-5 h-5" />
              </div>
              <div>
                <h3 id="cancel-dialog-title" className="font-serif text-lg font-bold text-[#F8F4EC]">
                  Cancel Order #{order.orderNumber}?
                </h3>
                <p className="text-xs text-white/60 mt-0.5">
                  This action will restore product inventory and cancel fulfillment.
                </p>
              </div>
            </div>

            {/* Financial & Refund Preview */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-white/70">
                <span>Customer:</span>
                <span className="font-medium text-white/90">{order.customerName}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Grand Total:</span>
                <span className="font-semibold text-[#D6B878]">₹{order.grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Payment Method:</span>
                <span className="font-medium text-white/90">{isCod ? 'Cash on Delivery (COD)' : 'Prepaid (Razorpay)'}</span>
              </div>

              <div className="pt-2 border-t border-white/10 text-[11px]">
                {isPaidPrepaid ? (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                    <span className="font-semibold block">Automatic Razorpay Refund:</span>
                    A refund of ₹{order.grandTotal.toLocaleString('en-IN')} will be initiated back to the customer.
                  </div>
                ) : isCod ? (
                  <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                    <span className="font-semibold block">COD Order:</span>
                    No payment refund is required.
                  </div>
                ) : (
                  <div className="p-2 rounded bg-white/5 border border-white/10 text-white/60">
                    Order is unpaid ({order.paymentStatus}); no refund required.
                  </div>
                )}
              </div>
            </div>

            {/* Cancellation Reason Input */}
            <div className="space-y-1.5 text-xs">
              <label htmlFor="admin-cancel-reason" className="block text-white/60 font-medium">
                Cancellation Reason (Optional):
              </label>
              <textarea
                id="admin-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Customer requested cancellation, address unverifiable..."
                rows={2}
                maxLength={500}
                className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-[#EDE4D5] placeholder:text-white/30 focus:outline-none focus:border-rose-500/50 resize-none transition-colors"
              />
            </div>

            {/* Error Message */}
            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <Alert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (!isCancelling) {
                    setIsConfirmCancelOpen(false);
                    setCancelError(null);
                  }
                }}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleExecuteCancellation}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

