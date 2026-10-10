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
  ArrowRight,
} from 'reicon-react';
import type { Order } from '../../types';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getShippingStatusBadgeInfo,
  getPaymentMethodBadgeInfo,
  parseOrderDiscounts,
  getOrderFulfilmentStage,
  hasPendingCancellationRequest,
  FULFILMENT_STAGE_METADATA,
  FULFILMENT_STAGE_SEQUENCE,
  type FulfilmentStage,
} from '../../lib/order-status';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';
import {
  cancelAdminOrder,
  retryAdminRefund,
  reconcileAdminRefund,
  advanceOrderFulfilmentStage,
  resolveAdminCancellationRequest,
  fetchAdminOrder,
} from '../../services/orderApi';

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
  const [isReconcilingRefund, setIsReconcilingRefund] = useState(false);
  const [isAdvancingFulfilment, setIsAdvancingFulfilment] = useState(false);
  const [isConfirmRejectOpen, setIsConfirmRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isResolvingCancellation, setIsResolvingCancellation] = useState(false);
  const [isApprovingCancellation, setIsApprovingCancellation] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [fulfilmentError, setFulfilmentError] = useState<string | null>(null);
  const [fulfilmentFeedback, setFulfilmentFeedback] = useState<string | null>(null);
  const [isRefreshingOrder, setIsRefreshingOrder] = useState(false);

  const prevOrderIdRef = React.useRef<string | null>(initialOrder?.id || null);
  const prevIsOpenRef = React.useRef<boolean>(isOpen);
  const onOrderUpdatedRef = React.useRef(onOrderUpdated);

  useEffect(() => {
    onOrderUpdatedRef.current = onOrderUpdated;
  }, [onOrderUpdated]);

  useEffect(() => {
    const isNewOrder = initialOrder?.id !== prevOrderIdRef.current;
    const isJustOpened = isOpen && !prevIsOpenRef.current;

    prevOrderIdRef.current = initialOrder?.id || null;
    prevIsOpenRef.current = isOpen;

    if (isNewOrder || isJustOpened) {
      setCurrentOrder(initialOrder);
      setIsConfirmCancelOpen(false);
      setIsConfirmRejectOpen(false);
      setCancelReason('');
      setRejectionReason('');
      setCancelError(null);
      setCancelFeedback(null);
      setFulfilmentError(null);
      setFulfilmentFeedback(null);
      setIsRetryingRefund(false);
      setIsReconcilingRefund(false);
      setIsAdvancingFulfilment(false);
      setIsResolvingCancellation(false);
      setIsApprovingCancellation(false);
    } else if (initialOrder) {
      // Retain existing local feedback & active modal view when syncing fresh order attributes
      setCurrentOrder(initialOrder);
    }
  }, [initialOrder, isOpen]);

  // Fetch fresh order details from server when modal opens to avoid stale cached state
  useEffect(() => {
    if (!isOpen || !initialOrder?.id) return;

    let isMounted = true;
    const refreshModalOrder = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const freshOrder = await fetchAdminOrder(token, initialOrder.id);
        if (isMounted && freshOrder) {
          setCurrentOrder(freshOrder);
          if (onOrderUpdatedRef.current) {
            onOrderUpdatedRef.current(freshOrder);
          }
        }
      } catch (err) {
        console.warn('Failed to refresh order details in modal:', err);
      }
    };

    refreshModalOrder();
    return () => {
      isMounted = false;
    };
  }, [isOpen, initialOrder?.id, getToken]);

  const handleManualRefresh = async () => {
    if (!currentOrder?.id || isRefreshingOrder) return;
    setIsRefreshingOrder(true);
    try {
      const token = await getToken();
      if (!token) return;
      const freshOrder = await fetchAdminOrder(token, currentOrder.id);
      if (freshOrder) {
        setCurrentOrder(freshOrder);
        if (onOrderUpdated) {
          onOrderUpdated(freshOrder);
        }
      }
    } catch (err: any) {
      console.warn('Failed to refresh order:', err);
    } finally {
      setIsRefreshingOrder(false);
    }
  };

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
        if (isConfirmCancelOpen) {
          setIsConfirmCancelOpen(false);
        } else if (isConfirmRejectOpen) {
          setIsConfirmRejectOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isConfirmCancelOpen, isConfirmRejectOpen]);

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

  const isRefundReconcilable = Boolean(
    order &&
      order.status === 'CANCELLED' &&
      !isCod &&
      Boolean(order.paymentTransactionId)
  );

  const handleExecuteRefundReconcile = async () => {
    if (!order || isReconcilingRefund) return;
    setIsReconcilingRefund(true);
    setCancelError(null);
    setCancelFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }

      const res = await reconcileAdminRefund(token, {
        orderId: order.id,
      });

      if (res.order) {
        setCurrentOrder(res.order);
        if (onOrderUpdated) {
          onOrderUpdated(res.order);
        }
      }
      setCancelFeedback(res.message || 'Refund reconciliation completed.');
    } catch (err: any) {
      console.error('Failed to reconcile refund:', err);
      setCancelError(err.message || 'Failed to reconcile refund. Please try again.');
    } finally {
      setIsReconcilingRefund(false);
    }
  };

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

  const handleResolveCancellation = async (decision: 'APPROVE' | 'REJECT') => {
    if (!order || isResolvingCancellation || isApprovingCancellation) return;
    setIsResolvingCancellation(true);
    if (decision === 'APPROVE') {
      setIsApprovingCancellation(true);
    }
    setCancelError(null);
    setCancelFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }

      const res = await resolveAdminCancellationRequest(token, {
        orderId: order.id,
        decision,
        rejectionReason: decision === 'REJECT' ? rejectionReason.trim() || undefined : undefined,
      });

      if (res.order) {
        setCurrentOrder(res.order);
      }

      let message = res.message;
      if (decision === 'APPROVE') {
        if (res.refundStatus === 'PENDING_RETRY') {
          message = `Cancellation request for Order #${order.orderNumber} approved and inventory restored, but payment refund is pending retry. Please use the refund action below to retry.`;
        } else if (res.refundStatus === 'REFUND_FAILED') {
          message = `Cancellation request for Order #${order.orderNumber} approved and inventory restored, but automatic payment refund failed. Please retry the refund below.`;
        } else if (res.refundStatus === 'REFUNDED') {
          message = `Cancellation request for Order #${order.orderNumber} approved. Order cancelled, inventory restored, and refund processed.`;
        }
      }

      setCancelFeedback(message);
      setIsConfirmRejectOpen(false);
      setIsConfirmCancelOpen(false);

      if (res.order && onOrderUpdated) {
        onOrderUpdated(res.order);
      }
    } catch (err: any) {
      console.error('Failed to resolve cancellation request:', err);
      setCancelError(err.message || 'Failed to resolve cancellation request. Please try again.');
    } finally {
      setIsResolvingCancellation(false);
      setIsApprovingCancellation(false);
    }
  };

  const currentStage: FulfilmentStage | null = order ? getOrderFulfilmentStage(order) : null;
  const stageMeta = currentStage ? FULFILMENT_STAGE_METADATA[currentStage] : null;
  const nextStage: FulfilmentStage | null = stageMeta?.nextStage || null;
  const nextStageMeta = nextStage ? FULFILMENT_STAGE_METADATA[nextStage] : null;

  const isCancellationPending = Boolean(order && hasPendingCancellationRequest(order));
  const isAdvanceBlockedByCancellation = Boolean(
    isCancellationPending &&
    nextStage &&
    ['PICKUP_BY_DELIVERY_PARTNER', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(nextStage)
  );

  const isUnpaidOnline = !isCod && order.paymentStatus !== 'PAID';

  const canAdvanceStage = Boolean(
    order &&
    order.status !== 'CANCELLED' &&
    order.status !== 'DELIVERED' &&
    order.shippingStatus !== 'DELIVERED' &&
    nextStage &&
    !isAdvanceBlockedByCancellation &&
    !isUnpaidOnline
  );

  const handleExecuteAdvanceFulfilment = async () => {
    if (!order || !nextStage || isAdvancingFulfilment || !canAdvanceStage) return;
    setIsAdvancingFulfilment(true);
    setFulfilmentError(null);
    setFulfilmentFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }

      const res = await advanceOrderFulfilmentStage(token, {
        orderId: order.id,
        targetStage: nextStage,
      });

      if (res.order) {
        setCurrentOrder(res.order);
        if (onOrderUpdated) {
          onOrderUpdated(res.order);
        }
      }
      setFulfilmentFeedback(res.message || `Order successfully advanced to ${nextStageMeta?.label}.`);
    } catch (err: any) {
      console.error('Failed to advance fulfilment stage:', err);
      setFulfilmentError(err.message || 'Failed to advance fulfilment stage. Please try again.');
    } finally {
      setIsAdvancingFulfilment(false);
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

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshingOrder}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh order details"
              aria-label="Refresh order details"
            >
              <Refresh className={`w-4 h-4 ${isRefreshingOrder ? 'animate-spin text-[#D6B878]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Top-Level Cancellation / Action Feedback Banner */}
          {cancelFeedback && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">{cancelFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelFeedback(null)}
                className="text-emerald-400/60 hover:text-emerald-300 p-1 cursor-pointer transition-colors"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Top-Level Action Error Banner */}
          {cancelError && !isConfirmCancelOpen && !isConfirmRejectOpen && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Alert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{cancelError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCancelError(null)}
                className="text-rose-400/60 hover:text-rose-300 p-1 cursor-pointer transition-colors"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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

          {/* Fulfilment Lifecycle Progression Card */}
          <div className="bg-[#180F20] border border-[#D6B878]/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-32 bg-[#D6B878]/5 rounded-full blur-3xl pointer-events-none" />

            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#D6B878]/10 border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878]">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-serif font-bold tracking-wider text-[#F8F4EC] uppercase">
                    Fulfilment Lifecycle
                  </h4>
                  <p className="text-[11px] text-white/50">
                    Order preparation, carrier pickup, and delivery tracking
                  </p>
                </div>
              </div>

              {/* Current Stage Badge */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[10px] uppercase font-semibold text-white/40">Current Stage:</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                  order.status === 'CANCELLED'
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : order.status === 'DELIVERED'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-[#D6B878]/15 text-[#D6B878] border-[#D6B878]/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    order.status === 'CANCELLED'
                      ? 'bg-rose-400'
                      : order.status === 'DELIVERED'
                      ? 'bg-emerald-400'
                      : 'bg-[#D6B878] animate-pulse'
                  }`} />
                  {stageMeta?.label || (order.status === 'CANCELLED' ? 'Cancelled' : 'Reviewing')}
                </span>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="py-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-1.5 relative">
                {FULFILMENT_STAGE_SEQUENCE.map((stageKey, idx) => {
                  const meta = FULFILMENT_STAGE_METADATA[stageKey];
                  const currentIdx = currentStage ? FULFILMENT_STAGE_SEQUENCE.indexOf(currentStage) : -1;
                  const isCancelled = order.status === 'CANCELLED';
                  const isDone = !isCancelled && currentIdx > idx;
                  const isCurrent = !isCancelled && currentIdx === idx;

                  return (
                    <div
                      key={stageKey}
                      className={`relative flex flex-col items-center sm:items-start p-2.5 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-[#D6B878]/10 border-[#D6B878]/60 shadow-md shadow-[#D6B878]/10'
                          : isDone
                          ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-300'
                          : 'bg-white/[0.01] border-white/5 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isDone
                              ? 'bg-emerald-500 text-black'
                              : isCurrent
                              ? 'bg-[#D6B878] text-[#180F20]'
                              : 'bg-white/10 text-white/40'
                          }`}
                        >
                          {isDone ? <Check className="w-3 h-3" /> : idx + 1}
                        </span>
                        <span className={`text-[11px] font-semibold leading-tight ${
                          isCurrent
                            ? 'text-[#F8F4EC]'
                            : isDone
                            ? 'text-emerald-300'
                            : 'text-white/40'
                        }`}>
                          {meta.label}
                        </span>
                      </div>
                      <span className="hidden sm:block text-[10px] text-white/40 line-clamp-1">
                        {meta.description}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Cancellation Alert with Admin Actions */}
            {isCancellationPending && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <Alert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <span className="font-semibold block text-amber-300">
                      Pending Customer Cancellation Request:
                    </span>
                    <p className="text-white/80">
                      {order.cancellationRequestReason || order.cancelReason
                        ? `Reason provided: "${order.cancellationRequestReason || order.cancelReason}"`
                        : 'Customer requested cancellation.'}
                    </p>
                    <p className="text-amber-300/80 text-[11px]">
                      Fulfilment progression to carrier pickup and delivery is paused until this request is resolved.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setIsConfirmCancelOpen(true);
                    }}
                    disabled={isResolvingCancellation || isApprovingCancellation}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isApprovingCancellation ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Approving Cancellation...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Cancellation</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setRejectionReason('');
                      setIsConfirmRejectOpen(true);
                    }}
                    disabled={isResolvingCancellation || isApprovingCancellation}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 font-semibold text-xs border border-white/20 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle2 className="w-3.5 h-3.5 text-white/60" />
                    <span>Reject Request & Resume Fulfilment</span>
                  </button>
                </div>
              </div>
            )}

            {/* Resolved Cancellation Alert (Rejected) */}
            {!isCancellationPending && order.cancellationRequestStatus === 'REJECTED' && (
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-white/70 text-xs space-y-1">
                <span className="font-semibold block text-white/90">
                  Customer Cancellation Request: Resolved (Rejected)
                </span>
                {order.cancellationRejectionReason && (
                  <p className="text-white/60 text-[11px]">
                    Rejection note: "{order.cancellationRejectionReason}"
                  </p>
                )}
              </div>
            )}

            {/* Unpaid Online Order Warning */}
            {isUnpaidOnline && order.status !== 'CANCELLED' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                <Alert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Online payment status is currently <span className="font-semibold text-amber-300">{order.paymentStatus}</span>. Payment must be completed before advancing past order review.
                </span>
              </div>
            )}

            {/* Error Message */}
            {fulfilmentError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <Alert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{fulfilmentError}</span>
              </div>
            )}

            {/* Success Message */}
            {fulfilmentFeedback && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{fulfilmentFeedback}</span>
              </div>
            )}

            {/* Action Row */}
            <div className="pt-2 border-t border-white/5">
              {order.status === 'CANCELLED' ? (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <XCircle2 className="w-4 h-4 text-rose-400" />
                  <span>Order is cancelled. Fulfilment lifecycle is terminated.</span>
                </div>
              ) : order.status === 'DELIVERED' || order.shippingStatus === 'DELIVERED' ? (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Fulfilment completed — order successfully delivered to customer.</span>
                  </span>
                  {order.deliveredAt && (
                    <span className="text-[11px] text-emerald-400/80">
                      {new Date(order.deliveredAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    {nextStageMeta ? (
                      <>
                        <span className="text-white/40 block text-[10px] uppercase font-semibold">
                          Next Stage: {nextStageMeta.label}
                        </span>
                        <span className="text-white/70">{nextStageMeta.description}</span>
                      </>
                    ) : (
                      <span className="text-white/40">No further stage transitions available</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteAdvanceFulfilment}
                    disabled={!canAdvanceStage || isAdvancingFulfilment}
                    className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 shrink-0 ${
                      canAdvanceStage && !isAdvancingFulfilment
                        ? 'bg-gradient-to-r from-[#D6B878] to-[#C49B45] hover:from-[#E2C78D] hover:to-[#D6B878] text-[#180F20] shadow-md shadow-[#D6B878]/20 cursor-pointer'
                        : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {isAdvancingFulfilment ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-[#180F20]/30 border-t-[#180F20] rounded-full animate-spin" />
                        <span>Updating Stage...</span>
                      </>
                    ) : (
                      <>
                        <span>{stageMeta?.actionButtonLabel || (nextStageMeta ? `Advance to ${nextStageMeta.label}` : 'Advance Stage')}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              )}
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

                {!discountBreakdown.regularDiscountAmount &&
                !discountBreakdown.prepaid5DiscountAmount &&
                order.discountTotal > 0 ? (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount</span>
                    <span>-₹{order.discountTotal.toLocaleString('en-IN')}</span>
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
            {canAdvanceStage && nextStageMeta && (
              <button
                type="button"
                onClick={handleExecuteAdvanceFulfilment}
                disabled={isAdvancingFulfilment}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#D6B878] to-[#C49B45] hover:from-[#E2C78D] hover:to-[#D6B878] text-[#180F20] text-xs font-bold shadow-md shadow-[#D6B878]/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAdvancingFulfilment ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#180F20]/30 border-t-[#180F20] rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>{stageMeta?.actionButtonLabel || `Advance: ${nextStageMeta.label}`}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#180F20]" />
                  </>
                )}
              </button>
            )}
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
                disabled={isRetryingRefund || isReconcilingRefund}
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
            {isRefundReconcilable && (
              <button
                type="button"
                onClick={handleExecuteRefundReconcile}
                disabled={isReconcilingRefund || isRetryingRefund}
                className="px-3.5 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Verify refund status against Razorpay gateway records without issuing duplicate refunds"
              >
                {isReconcilingRefund ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Reconciling...</span>
                  </>
                ) : (
                  <>
                    <Refresh className="w-3.5 h-3.5 text-sky-400" />
                    <span>Reconcile Refund</span>
                  </>
                )}
              </button>
            )}
            {!isCancellable && !isRefundRetryable && !isRefundReconcilable && (
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
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#07030A]/90 backdrop-blur-md"
          onClick={(e) => {
            e.stopPropagation();
            if (!isCancelling && !isResolvingCancellation && !isApprovingCancellation) {
              setIsConfirmCancelOpen(false);
              setCancelError(null);
            }
          }}
        >
          <div
            className="relative w-full max-w-md bg-[#180F20] border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-[#EDE4D5]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            onClick={(e) => e.stopPropagation()}
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
                  if (!isCancelling && !isResolvingCancellation && !isApprovingCancellation) {
                    setIsConfirmCancelOpen(false);
                    setCancelError(null);
                  }
                }}
                disabled={isCancelling || isResolvingCancellation || isApprovingCancellation}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={isCancellationPending ? () => handleResolveCancellation('APPROVE') : handleExecuteCancellation}
                disabled={isCancelling || isResolvingCancellation || isApprovingCancellation}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isCancelling || isResolvingCancellation || isApprovingCancellation ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{isCancellationPending ? 'Approve Cancellation' : 'Confirm Cancellation'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Cancellation Request Confirmation Dialog Overlay */}
      {isConfirmRejectOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#07030A]/90 backdrop-blur-md"
          onClick={(e) => {
            e.stopPropagation();
            if (!isResolvingCancellation && !isApprovingCancellation) {
              setIsConfirmRejectOpen(false);
              setCancelError(null);
            }
          }}
        >
          <div
            className="relative w-full max-w-md bg-[#180F20] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-[#EDE4D5]"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reject-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Alert className="w-5 h-5" />
              </div>
              <div>
                <h3 id="reject-dialog-title" className="font-serif text-lg font-bold text-[#F8F4EC]">
                  Reject Cancellation Request?
                </h3>
                <p className="text-xs text-white/60 mt-0.5">
                  Order #{order.orderNumber} will be unblocked and will proceed with packaging and delivery.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label htmlFor="admin-rejection-reason" className="block text-white/60 font-medium">
                Reason for rejection (Optional):
              </label>
              <textarea
                id="admin-rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Order has already been prepared and packaged for handover..."
                rows={3}
                maxLength={500}
                className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-[#EDE4D5] placeholder:text-white/30 focus:outline-none focus:border-amber-500/50 resize-none transition-colors"
              />
            </div>

            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <Alert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (!isResolvingCancellation && !isApprovingCancellation) {
                    setIsConfirmRejectOpen(false);
                    setCancelError(null);
                  }
                }}
                disabled={isResolvingCancellation || isApprovingCancellation}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handleResolveCancellation('REJECT')}
                disabled={isResolvingCancellation || isApprovingCancellation}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isResolvingCancellation || isApprovingCancellation ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Reject Request</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

