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
} from '../../lib/order-status';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';
import { loadRazorpayScript, openRazorpayCheckout } from '../../lib/razorpay';
import { verifyRazorpayPayment, reconcileRazorpayPayment } from '../../services/orderApi';
import { Button } from '../ui/Button';

interface CustomerOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onPaymentSuccess?: () => void;
}

export const CustomerOrderDetailModal: React.FC<CustomerOrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  onPaymentSuccess,
}) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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

  if (!isOpen || !order) return null;

  const orderBadge = getOrderStatusBadgeInfo(order.status);
  const paymentBadge = getPaymentStatusBadgeInfo(order.paymentStatus);
  const shippingBadge = getShippingStatusBadgeInfo(order.shippingStatus);

  const OrderIcon = orderBadge.icon;
  const PaymentIcon = paymentBadge.icon;
  const ShippingIcon = shippingBadge.icon;

  const isPendingPayment = order.status === 'PENDING_PAYMENT' || order.paymentStatus === 'PENDING';

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

        {/* Scrollable Body (scrollbar hidden, overscroll contained) */}
        <div
          className="flex-1 overflow-y-auto overscroll-y-contain p-5 sm:p-6 space-y-6 text-gray-800 text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            overscrollBehavior: 'contain',
          }}
          data-lenis-prevent
        >
          {/* Status Badges Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Order Status */}
            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/20 shadow-xs flex flex-col items-start gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Order Status</span>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${orderBadge.bgClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${orderBadge.dotClass}`} />
                <OrderIcon size={13} />
                <span>{orderBadge.label}</span>
              </div>
            </div>

            {/* Payment Status */}
            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/20 shadow-xs flex flex-col items-start gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Payment Status</span>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${paymentBadge.bgClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${paymentBadge.dotClass}`} />
                <PaymentIcon size={13} />
                <span>{paymentBadge.label}</span>
              </div>
            </div>

            {/* Shipping Status */}
            <div className="p-3 rounded-xl bg-white border border-[#E8C98A]/20 shadow-xs flex flex-col items-start gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Shipping Status</span>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${shippingBadge.bgClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${shippingBadge.dotClass}`} />
                <ShippingIcon size={13} />
                <span>{shippingBadge.label}</span>
              </div>
            </div>
          </div>

          {/* Payment Notice / Error */}
          {paymentNotice && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-center gap-2">
              <ShieldCheck size={16} className="text-amber-700 shrink-0" />
              <span>{paymentNotice}</span>
            </div>
          )}

          {paymentError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 text-xs flex items-center gap-2">
              <Alert size={16} className="text-rose-600 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          {/* Ordered Items */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
              <ShoppingBag size={15} />
              <span>Purchased Items ({order.items?.length || 0})</span>
            </div>

            <div className="divide-y divide-[#E8C98A]/20 bg-white rounded-xl border border-[#E8C98A]/30 overflow-hidden">
              {order.items && order.items.length > 0 ? (
                order.items.map((item) => (
                  <div key={item.id} className="p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-[#FFFDF8] transition-colors">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-[#FAF8F5] border border-[#E8C98A]/30 overflow-hidden shrink-0">
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
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
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
                <div className="p-4 text-center text-xs text-gray-500">
                  No item breakdown details recorded for this order.
                </div>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
                <Truck size={15} />
                <span>Delivery Address</span>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed pl-6">
                <p className="font-bold text-[#28040B]">{order.customerName}</p>
                <p>{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
                </p>
                <p>{order.shippingAddress.country}</p>
                <p className="text-gray-500 mt-1">Phone: {order.customerPhone}</p>
              </div>
            </div>
          )}

          {/* Payment & Financial Breakdown */}
          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8C98A]/30 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8C6C38]">
              <Layers size={15} />
              <span>Payment Summary</span>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Shipping Fee</span>
                <span>{order.shippingFee === 0 ? 'Complimentary' : formatCurrency(order.shippingFee)}</span>
              </div>
              {order.taxTotal > 0 && (
                <div className="flex justify-between">
                  <span>Estimated Taxes</span>
                  <span>{formatCurrency(order.taxTotal)}</span>
                </div>
              )}
              <div className="border-t border-[#E8C98A]/40 pt-2 flex justify-between font-serif font-bold text-base text-[#28040B]">
                <span>Grand Total</span>
                <span className="text-[#8C6C38]">{formatCurrency(order.grandTotal)}</span>
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
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={onClose}
            className="w-full sm:w-auto text-xs cursor-pointer"
          >
            CLOSE
          </Button>

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
    </div>
  );
};
