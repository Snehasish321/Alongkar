import React, { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import {
  X,
  Sparkles,
  Calendar,
  Layers,
  ShoppingBag,
  Truck,
  ShieldCheck,
  Lock,
  Alert,
  Refresh,
  Clock,
  CloseCircle,
} from 'reicon-react';
import type {
  Order,
  RazorpayPaymentOrderResponse,
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
} from '../../types';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getShippingStatusBadgeInfo,
  getPaymentMethodBadgeInfo,
  parseOrderDiscounts,
  hasPendingCancellationRequest,
  isOrderCancellationEligible,
} from '../../lib/order-status';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';
import { loadRazorpayScript, openRazorpayCheckout } from '../../lib/razorpay';
import {
  verifyRazorpayPayment,
  reconcileRazorpayPayment,
  requestCustomerOrderCancellation,
} from '../../services/orderApi';
import { Button } from '../ui/Button';

interface CustomerOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onPaymentSuccess?: () => void;
  onOrderUpdated?: (updatedOrder: Order) => void;
}

export const CustomerOrderDetailModal: React.FC<CustomerOrderDetailModalProps> = ({
  isOpen,
  onClose,
  order: initialOrder,
  onPaymentSuccess,
  onOrderUpdated,
}) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [currentOrder, setCurrentOrder] = useState<Order | null>(initialOrder);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Customer Cancellation Request State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentOrder(initialOrder);
    setIsCancelModalOpen(false);
    setCancellationReason('');
    setCancelFeedback(null);
    setCancelError(null);
  }, [initialOrder, isOpen]);

  // Lock body scroll when modal is open and restore on close
  useEffect(() => {
    if (!isOpen) {
      setPaymentNotice(null);
      setPaymentError(null);
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCancelModalOpen) {
          setIsCancelModalOpen(false);
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
  }, [isOpen, onClose, isCancelModalOpen]);

  if (!isOpen || !currentOrder) return null;
  const order = currentOrder;

  const orderBadge = getOrderStatusBadgeInfo(order.status);
  const paymentBadge = getPaymentStatusBadgeInfo(order.paymentStatus);
  const shippingBadge = getShippingStatusBadgeInfo(order.shippingStatus);
  const paymentMethodBadge = getPaymentMethodBadgeInfo(order.paymentProvider);
  const discountBreakdown = parseOrderDiscounts(order);

  const OrderIcon = orderBadge.icon;
  const PaymentIcon = paymentBadge.icon;
  const ShippingIcon = shippingBadge.icon;

  const isPendingPayment =
    (order.status === 'PENDING_PAYMENT' || order.paymentStatus === 'PENDING') &&
    order.paymentProvider !== 'COD' &&
    order.status !== 'CANCELLED' &&
    order.paymentStatus !== 'PAID' &&
    order.paymentStatus !== 'REFUNDED' &&
    order.paymentStatus !== 'PARTIALLY_REFUNDED';

  // Cancellation status evaluations
  const isCancellable = isOrderCancellationEligible(order);
  const isPendingReview = order.cancellationRequestStatus === 'PENDING' || hasPendingCancellationRequest(order);
  const isRejected = order.cancellationRequestStatus === 'REJECTED';

  const formatDate = (dateValue: string | Date | undefined) => {
    if (!dateValue) return 'N/A';
    try {
      const date = new Date(dateValue);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateValue);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleRequestCancellation = async () => {
    if (!order || isSubmittingCancellation) return;
    setIsSubmittingCancellation(true);
    setCancelError(null);
    setCancelFeedback(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      const res = await requestCustomerOrderCancellation(token, {
        orderId: order.id,
        reason: cancellationReason.trim() || undefined,
      });

      setCurrentOrder(res.order);
      setIsCancelModalOpen(false);
      setCancelFeedback(res.message || 'Cancellation request submitted successfully. Our team will review your request.');
      if (onOrderUpdated) {
        onOrderUpdated(res.order);
      }
    } catch (err: any) {
      setCancelError(err.message || 'Failed to submit cancellation request. Please try again.');
    } finally {
      setIsSubmittingCancellation(false);
    }
  };

  const handlePayNow = async () => {
    if (isProcessingPayment) return;

    setIsProcessingPayment(true);
    setPaymentError(null);
    setPaymentNotice(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required to complete payment.');
      }

      // Step 1: Request Razorpay payment order initiation
      const paymentOrderRes = await fetch('/api/payments/razorpay/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
        }),
      });

      if (!paymentOrderRes.ok) {
        const errPayload = await paymentOrderRes.json().catch(() => ({}));
        throw new Error(errPayload?.error || 'Unable to initialize secure payment.');
      }

      const paymentData: RazorpayPaymentOrderResponse = await paymentOrderRes.json();

      // If server confirmed order was already paid on gateway, reconcile without reopening checkout
      if (paymentData.alreadyPaid) {
        setPaymentNotice(paymentData.message || `Payment verified & Order #${order.orderNumber} confirmed!`);
        if (onPaymentSuccess) {
          onPaymentSuccess();
        }
        setIsProcessingPayment(false);
        return;
      }

      if (!paymentData.razorpayKeyId || !paymentData.razorpayOrderId) {
        throw new Error('Invalid payment configuration received from server.');
      }

      // Step 2: Load Razorpay Checkout.js
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) {
        throw new Error('Unable to load payment gateway script.');
      }

      const prefillName = user?.fullName || user?.firstName || order.customerName || undefined;
      const prefillEmail = user?.primaryEmailAddress?.emailAddress || order.customerEmail || undefined;
      const prefillPhone = user?.primaryPhoneNumber?.phoneNumber
        ? user.primaryPhoneNumber.phoneNumber.replace(/[^0-9]/g, '').slice(-10)
        : order.customerPhone;

      const checkoutOptions: RazorpayCheckoutOptions = {
        key: paymentData.razorpayKeyId,
        amount: paymentData.amount || 0,
        currency: paymentData.currency || 'INR',
        name: 'Alongkar',
        description: `Order ${paymentData.orderNumber || order.orderNumber}`,
        order_id: paymentData.razorpayOrderId,
        prefill: {
          name: prefillName,
          email: prefillEmail,
          contact: prefillPhone,
        },
        theme: {
          color: '#8C6C38',
        },
        modal: {
          ondismiss: () => {
            setIsProcessingPayment(false);
            setPaymentNotice('Payment window closed. You can complete payment anytime.');
          },
        },
        handler: async (response: RazorpayPaymentSuccessResponse) => {
          setPaymentNotice('Verifying payment with secure server...');
          try {
            const verifyResult = await verifyRazorpayPayment(token, {
              orderId: order.id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyResult.success) {
              setPaymentNotice(`Payment verified & Order #${order.orderNumber} confirmed!`);
              if (onPaymentSuccess) {
                onPaymentSuccess();
              }
            }
          } catch (verifyErr: any) {
            // Attempt server-side reconciliation recovery before displaying permanent error
            try {
              const reconcileResult = await reconcileRazorpayPayment(token, { orderId: order.id });
              if (reconcileResult.success && (reconcileResult.reconciled || reconcileResult.alreadyPaid)) {
                setPaymentNotice(`Payment verified & Order #${order.orderNumber} confirmed!`);
                if (onPaymentSuccess) {
                  onPaymentSuccess();
                }
                return;
              }
            } catch {
              // Ignore fallback error
            }
            setPaymentError(verifyErr.message || 'Payment verification failed. Please try again.');
          } finally {
            setIsProcessingPayment(false);
          }
        },
      };

      await openRazorpayCheckout(checkoutOptions, (failedResponse) => {
        setIsProcessingPayment(false);
        const failDescription = failedResponse?.error?.description || 'Payment was unsuccessful. Please try again.';
        setPaymentError(failDescription);
      });
    } catch (err: any) {
      setIsProcessingPayment(false);
      setPaymentError(err.message || 'Payment initiation failed.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-order-title"
      data-lenis-prevent
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#FFFDF8] rounded-2xl border border-[#E8C98A]/40 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 bg-gradient-to-r from-[#28040B] to-[#3D0A13] text-[#F8F1E3] border-b border-[#E8C98A]/30">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-[#E8C98A] font-bold">
              <Sparkles size={14} />
              <span>ALONGKAR ORDER DETAILS</span>
            </div>
            <h2 id="modal-order-title" className="font-serif text-xl sm:text-2xl font-bold text-[#FFE3C7] tracking-tight">
              {order.orderNumber}
            </h2>
            <div className="flex items-center gap-2 text-xs text-[#F8F1E3]/70 font-sans">
              <Calendar size={13} className="text-[#E8C98A]" />
              <span>Placed on {formatDate(order.createdAt)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-[#F8F1E3]/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body (overscroll contained) */}
        <div
          className="flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-5 space-y-3.5 text-gray-800 text-sm"
          style={{
            overscrollBehavior: 'contain',
          }}
          data-lenis-prevent
        >
          {/* Cancellation Request Feedback Cards / Alerts */}
          {isPendingReview && order.status !== 'CANCELLED' && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 space-y-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-amber-800">
                <Clock size={15} className="text-amber-700 shrink-0" />
                <span>Cancellation Request Under Review</span>
              </div>
              <p className="text-xs text-amber-900/80 leading-relaxed pl-5">
                Your request to cancel this order
                {order.cancellationRequestReason ? ` ("${order.cancellationRequestReason}")` : ''}
                {' '}has been recorded and is currently being reviewed by our store team prior to dispatch.
              </p>
            </div>
          )}

          {isRejected && order.status !== 'CANCELLED' && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-900 space-y-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-rose-800">
                <Alert size={15} className="text-rose-700 shrink-0" />
                <span>Cancellation Request Declined</span>
              </div>
              <p className="text-xs text-rose-900/80 leading-relaxed pl-5">
                Your request to cancel this order was reviewed and could not be approved
                {order.cancellationRejectionReason ? `: "${order.cancellationRejectionReason}"` : '.'}
                {' '}Your order is continuing towards courier handover and delivery as scheduled.
              </p>
            </div>
          )}

          {cancelFeedback && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 text-xs flex items-center gap-2 animate-in fade-in">
              <ShieldCheck size={15} className="text-emerald-700 shrink-0" />
              <span>{cancelFeedback}</span>
            </div>
          )}

          {/* Payment Notice / Error */}
          {paymentNotice && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-center gap-2">
              <ShieldCheck size={15} className="text-amber-700 shrink-0" />
              <span>{paymentNotice}</span>
            </div>
          )}

          {paymentError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 text-xs flex items-center gap-2">
              <Alert size={15} className="text-rose-600 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          {/* 2. Purchased Items */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
              <ShoppingBag size={14} />
              <span>Purchased Items ({order.items?.length || 0})</span>
            </div>

            <div className="divide-y divide-[#E8C98A]/20 bg-white rounded-xl border border-[#E8C98A]/30 overflow-hidden">
              {order.items && order.items.length > 0 ? (
                order.items.map((item) => (
                  <div key={item.id} className="p-3 sm:p-3.5 flex items-center gap-3 sm:gap-4 hover:bg-[#FFFDF8] transition-colors">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#FAF8F5] border border-[#E8C98A]/30 overflow-hidden shrink-0">
                      <img
                        src={getOptimizedImageUrl(item.productImage, IMAGE_PRESETS.THUMB_MD)}
                        alt={item.productName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif font-bold text-sm text-[#28040B] truncate">
                        {item.productName}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span>Qty: {item.quantity}</span>
                        <span>•</span>
                        <span>{formatCurrency(item.unitPrice)} each</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-serif font-bold text-sm sm:text-base text-[#28040B]">
                        {formatCurrency(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3.5 text-center text-xs text-gray-500">
                  No item breakdown details recorded for this order.
                </div>
              )}
            </div>
          </div>

          {/* 3. Order Status Cards: Compact 2-column by 2-row grid */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {/* Order Status */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-2xs flex flex-col justify-between gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8C6C38] block truncate">
                Order Status
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border leading-none max-w-full ${orderBadge.bgClass}`}
                title={`Order Status: ${orderBadge.label}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${orderBadge.dotClass}`} />
                <OrderIcon size={12} className="shrink-0" />
                <span className="truncate">{orderBadge.label}</span>
              </div>
            </div>

            {/* Payment Status */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-2xs flex flex-col justify-between gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8C6C38] block truncate">
                Payment Status
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border leading-none max-w-full ${paymentBadge.bgClass}`}
                title={`Payment Status: ${paymentBadge.label}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${paymentBadge.dotClass}`} />
                <PaymentIcon size={12} className="shrink-0" />
                <span className="truncate">{paymentBadge.label}</span>
              </div>
            </div>

            {/* Shipping Status */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-2xs flex flex-col justify-between gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8C6C38] block truncate">
                Shipping Status
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border leading-none max-w-full ${shippingBadge.bgClass}`}
                title={`Shipping Status: ${shippingBadge.label}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${shippingBadge.dotClass}`} />
                <ShippingIcon size={12} className="shrink-0" />
                <span className="truncate">{shippingBadge.label}</span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-white border border-[#E8C98A]/30 shadow-2xs flex flex-col justify-between gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8C6C38] block truncate">
                Payment Method
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border leading-none max-w-full ${paymentMethodBadge.bgClass}`}
                title={`Payment Method: ${paymentMethodBadge.fullLabel}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${paymentMethodBadge.dotClass}`} />
                <span className="truncate">{paymentMethodBadge.label}</span>
              </div>
            </div>
          </div>

          {/* 4. Delivery Address */}
          {order.shippingAddress && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E8C98A]/30 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
                <Truck size={14} />
                <span>Delivery Address</span>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed pl-5">
                <p className="font-bold text-[#28040B]">{order.customerName}</p>
                <p>{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
                </p>
                <p>{order.shippingAddress.country}</p>
                <p className="text-gray-500 mt-0.5">Phone: {order.customerPhone}</p>
              </div>
            </div>
          )}

          {/* 5. Order Summary */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF8F5] border border-[#E8C98A]/30 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
              <Layers size={14} />
              <span>Order Summary</span>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex justify-between items-center">
                <span>Payment Method</span>
                <span className="font-semibold text-[#28040B]">
                  {paymentMethodBadge.fullLabel}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span>Items Subtotal</span>
                <span className="font-medium text-gray-900">{formatCurrency(order.subtotal)}</span>
              </div>

              {/* Regular Promotional Coupon Discount if present */}
              {discountBreakdown.regularCouponCode &&
                discountBreakdown.regularDiscountAmount !== undefined &&
                discountBreakdown.regularDiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 font-medium">
                    <span>Promo ({discountBreakdown.regularCouponCode})</span>
                    <span>−{formatCurrency(discountBreakdown.regularDiscountAmount)}</span>
                  </div>
                )}

              {/* Online Payment Offer (PREPAID5) if present and not COD */}
              {!paymentMethodBadge.isCod &&
                discountBreakdown.prepaid5DiscountAmount !== undefined &&
                discountBreakdown.prepaid5DiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 font-medium">
                    <span>Online Payment Offer (PREPAID5)</span>
                    <span>−{formatCurrency(discountBreakdown.prepaid5DiscountAmount)}</span>
                  </div>
                )}

              {/* Fallback Total Discount if individual breakdown not parsed */}
              {!discountBreakdown.regularCouponCode &&
                !discountBreakdown.prepaid5DiscountAmount &&
                discountBreakdown.totalDiscount > 0 && (
                  <div className="flex justify-between items-center text-emerald-700 font-medium">
                    <span>Discount</span>
                    <span>−{formatCurrency(discountBreakdown.totalDiscount)}</span>
                  </div>
                )}

              <div className="flex justify-between items-center">
                <span>Shipping</span>
                <span className={order.shippingFee === 0 ? 'text-emerald-700 font-medium' : 'text-gray-900'}>
                  {order.shippingFee === 0 ? 'FREE' : formatCurrency(order.shippingFee)}
                </span>
              </div>

              {order.taxTotal > 0 && (
                <div className="flex justify-between items-center">
                  <span>Estimated Taxes</span>
                  <span className="text-gray-900">{formatCurrency(order.taxTotal)}</span>
                </div>
              )}

              <div className="border-t border-[#E8C98A]/40 pt-2 flex justify-between items-center">
                <span className="font-serif font-bold text-sm sm:text-base text-[#28040B]">Final Amount</span>
                <span className="font-serif font-bold text-base sm:text-lg text-[#8C6C38]">
                  {formatCurrency(order.grandTotal)}
                </span>
              </div>
            </div>

            {order.paymentOrderId && (
              <div className="pt-2 border-t border-[#E8C98A]/20 flex items-center justify-between text-[11px] text-gray-500 font-mono">
                <span>Gateway Ref:</span>
                <span>{order.paymentOrderId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#E8C98A]/30 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              className="w-full sm:w-auto text-xs cursor-pointer"
            >
              CLOSE
            </Button>

            {isCancellable && (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setCancelError(null);
                  setIsCancelModalOpen(true);
                }}
                className="w-full sm:w-auto text-xs text-rose-700 border-rose-300 hover:bg-rose-50 hover:text-rose-800 cursor-pointer"
              >
                REQUEST CANCELLATION
              </Button>
            )}
          </div>

          {isPendingPayment && (
            <Button
              type="button"
              variant="gold"
              size="md"
              onClick={handlePayNow}
              disabled={isProcessingPayment}
              className="w-full sm:w-auto gap-2 text-xs cursor-pointer"
            >
              {isProcessingPayment ? (
                <>
                  <Refresh size={15} className="animate-spin" />
                  <span>INITIALIZING GATEWAY...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>PAY NOW ({formatCurrency(order.grandTotal)})</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Customer Cancellation Request Confirmation Modal */}
      {isCancelModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-cancel-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingCancellation) {
              setIsCancelModalOpen(false);
            }
          }}
        >
          <div
            className="relative w-full max-w-md bg-[#FFFDF8] rounded-2xl border border-[#E8C98A]/50 shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-700 shrink-0">
                <CloseCircle size={20} />
              </div>
              <div className="space-y-1">
                <h3 id="customer-cancel-dialog-title" className="font-serif text-lg font-bold text-[#28040B]">
                  Request Cancellation
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Are you sure you want to request cancellation for Order <span className="font-semibold text-[#28040B] font-mono">#{order.orderNumber}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 text-xs leading-relaxed space-y-1">
              <p className="font-semibold">Important:</p>
              <p className="text-amber-900/80">
                Cancellation requests are subject to store approval before dispatch. If approved, prepaid orders will be refunded back to your original payment method.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="customer-cancellation-reason" className="block text-xs font-semibold text-gray-700">
                Reason for cancellation (Optional):
              </label>
              <textarea
                id="customer-cancellation-reason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Ordered by mistake, found another design, change of mind..."
                rows={3}
                maxLength={500}
                disabled={isSubmittingCancellation}
                className="w-full p-2.5 rounded-xl border border-[#E8C98A]/50 bg-white text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#8C6C38] resize-none"
              />
            </div>

            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 text-xs flex items-center gap-2">
                <Alert size={15} className="text-rose-600 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8C98A]/30">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  if (!isSubmittingCancellation) {
                    setIsCancelModalOpen(false);
                    setCancelError(null);
                  }
                }}
                disabled={isSubmittingCancellation}
                className="text-xs cursor-pointer"
              >
                KEEP ORDER
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleRequestCancellation}
                disabled={isSubmittingCancellation}
                className="text-xs text-rose-700 border-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer"
              >
                {isSubmittingCancellation ? (
                  <span className="flex items-center gap-1.5">
                    <Refresh size={14} className="animate-spin" />
                    <span>SUBMITTING...</span>
                  </span>
                ) : (
                  <span>CONFIRM REQUEST</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
