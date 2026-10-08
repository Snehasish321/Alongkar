import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Truck,
  Lock,
  ArrowRight,
  Tag,
  Loader2,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { formatPrice } from '../../lib/utils';
import type { PaymentMethod } from '../../types';

export interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  shippingFee: number;
  isFreeShipping: boolean;
  appliedCoupon: {
    code: string;
    label: string;
    discountPercent?: number;
    flatDiscount?: number;
    minOrder?: number;
  } | null;
  onConfirm: (paymentMethod: PaymentMethod) => Promise<void>;
  isProcessing: boolean;
}

export const PaymentMethodModal: React.FC<PaymentMethodModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  shippingFee,
  isFreeShipping,
  appliedCoupon,
  onConfirm,
  isProcessing,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('RAZORPAY');

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
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  // Calculate regular coupon discount and PREPAID5 incentive dynamically based on selected payment method
  const isPrepaid5Coupon = appliedCoupon?.code === 'PREPAID5';
  const hasRegularCoupon = Boolean(appliedCoupon && !isPrepaid5Coupon);

  let regularCouponDiscount = 0;
  if (hasRegularCoupon && appliedCoupon) {
    if (appliedCoupon.minOrder && subtotal < appliedCoupon.minOrder) {
      regularCouponDiscount = 0;
    } else if (appliedCoupon.discountPercent) {
      regularCouponDiscount = Math.round((subtotal * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.flatDiscount) {
      regularCouponDiscount = Math.min(subtotal, appliedCoupon.flatDiscount);
    }
    regularCouponDiscount = Math.max(0, Math.min(subtotal, regularCouponDiscount));
  }

  // Base amount eligible for PREPAID5 is (subtotal - regularCouponDiscount)
  const eligiblePrepaidBase = Math.max(0, subtotal - regularCouponDiscount);
  const prepaid5Discount =
    selectedMethod === 'RAZORPAY' ? Math.round((eligiblePrepaidBase * 5) / 100) : 0;

  const totalDiscount = regularCouponDiscount + prepaid5Discount;
  const finalAmount = Math.max(0, subtotal - totalDiscount + shippingFee);

  const handleSelectMethod = (method: PaymentMethod) => {
    if (isProcessing) return;
    setSelectedMethod(method);
  };

  const handleContinue = async () => {
    if (isProcessing) return;
    await onConfirm(selectedMethod);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-method-modal-title"
      data-lenis-prevent
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-lg flex flex-col bg-[#FFFDF8] rounded-2xl border border-[#E8C98A]/40 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 bg-gradient-to-r from-[#28040B] via-[#350610] to-[#28040B] text-[#F8F1E3] border-b border-[#E8C98A]/30">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs uppercase tracking-[0.25em] text-[#E8C98A] font-bold">
              <Sparkles size={13} />
              <span>SECURE ATELIER CHECKOUT</span>
            </div>
            <h2
              id="payment-method-modal-title"
              className="font-serif text-xl sm:text-2xl font-bold text-[#FFE3C7] tracking-tight"
            >
              Choose your payment method
            </h2>
            <p className="text-xs text-[#F8F1E3]/75 font-sans">
              Select your preferred payment option to complete your order.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-full text-[#F8F1E3]/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="flex-1 overflow-y-auto overscroll-y-contain p-5 sm:p-6 space-y-5 text-gray-800 text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            overscrollBehavior: 'contain',
          }}
          data-lenis-prevent
        >
          {/* Payment Method Cards */}
          <fieldset className="space-y-3 border-0 p-0 m-0">
            <legend className="sr-only">Payment options</legend>

            {/* Option 1: Razorpay Online */}
            <label
              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-start gap-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#8C6C38] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[#FFFDF8] ${
                selectedMethod === 'RAZORPAY'
                  ? 'bg-[#FAF0DC]/80 border-[#8C6C38] ring-1 ring-[#8C6C38]/40 shadow-xs'
                  : 'bg-white border-[#E8C98A]/30 hover:border-[#8C6C38]/50 hover:bg-[#FAF8F5]'
              }`}
            >
              <input
                type="radio"
                name="paymentMethodOption"
                value="RAZORPAY"
                checked={selectedMethod === 'RAZORPAY'}
                onChange={() => handleSelectMethod('RAZORPAY')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSelectMethod('RAZORPAY');
                  }
                }}
                className="sr-only"
              />

              <div className="pt-0.5 pointer-events-none">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    selectedMethod === 'RAZORPAY'
                      ? 'border-[#8C6C38] bg-[#8C6C38]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'RAZORPAY' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 pointer-events-none">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[#8C6C38] shrink-0" />
                    <span className="font-serif font-bold text-sm text-[#28040B]">
                      Pay Online with Razorpay
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 font-sans">
                  UPI · Credit/Debit Cards · Net Banking
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-[#63481A] bg-[#FAF0DC] border border-[#E8C98A]/60 px-2.5 py-0.5 rounded-md font-medium">
                  <Sparkles size={11} className="text-[#8C6C38]" />
                  <span>Get 5% extra off with PREPAID5</span>
                </div>
              </div>
            </label>

            {/* Option 2: Cash on Delivery */}
            <label
              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-start gap-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#8C6C38] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[#FFFDF8] ${
                selectedMethod === 'COD'
                  ? 'bg-[#FAF0DC]/80 border-[#8C6C38] ring-1 ring-[#8C6C38]/40 shadow-xs'
                  : 'bg-white border-[#E8C98A]/30 hover:border-[#8C6C38]/50 hover:bg-[#FAF8F5]'
              }`}
            >
              <input
                type="radio"
                name="paymentMethodOption"
                value="COD"
                checked={selectedMethod === 'COD'}
                onChange={() => handleSelectMethod('COD')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSelectMethod('COD');
                  }
                }}
                className="sr-only"
              />

              <div className="pt-0.5 pointer-events-none">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    selectedMethod === 'COD'
                      ? 'border-[#8C6C38] bg-[#8C6C38]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'COD' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 pointer-events-none">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-[#8C6C38] shrink-0" />
                    <span className="font-serif font-bold text-sm text-[#28040B]">
                      Cash on Delivery
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200/80">
                    COD
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 font-sans">
                  Pay when your order is delivered to your doorstep.
                </p>
                {selectedMethod === 'COD' && (
                  <p className="mt-1.5 text-[11px] text-[#8C6C38] font-sans">
                    Note: PREPAID5 discount is not available for COD.
                  </p>
                )}
              </div>
            </label>
          </fieldset>

          {/* Dynamic Order Total Breakdown */}
          <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 space-y-2 text-xs transition-all duration-200">
            <div className="flex justify-between text-gray-600">
              <span>Items Subtotal</span>
              <span className="font-semibold text-gray-900 font-mono">{formatPrice(subtotal)}</span>
            </div>

            {hasRegularCoupon && appliedCoupon && regularCouponDiscount > 0 && (
              <div className="flex justify-between items-center text-emerald-700">
                <span className="flex items-center gap-1 font-medium">
                  <Tag size={12} />
                  <span>Promo ({appliedCoupon.code})</span>
                </span>
                <span className="font-semibold font-mono">
                  −{formatPrice(regularCouponDiscount)}
                </span>
              </div>
            )}

            {selectedMethod === 'RAZORPAY' && prepaid5Discount > 0 && (
              <div className="flex justify-between items-center text-emerald-700 animate-in fade-in duration-150">
                <span className="flex items-center gap-1 font-medium">
                  <Sparkles size={12} className="text-emerald-600" />
                  <span>PREPAID5 / Online Payment Offer</span>
                </span>
                <span className="font-semibold font-mono">
                  −{formatPrice(prepaid5Discount)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Standard Delivery</span>
              <span className="font-semibold text-gray-900 font-mono">
                {isFreeShipping || shippingFee === 0 ? 'FREE' : formatPrice(shippingFee)}
              </span>
            </div>

            <div className="border-t border-[#E8C98A]/30 pt-2.5 flex justify-between items-baseline text-sm">
              <span className="font-serif font-bold text-[#28040B]">Final Amount</span>
              <span className="font-serif text-xl font-bold text-[#28040B] font-mono">
                {formatPrice(finalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#E8C98A]/30 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#E8C98A]/40 text-xs font-semibold uppercase tracking-wider text-gray-700 hover:bg-[#FAF8F5] transition-colors cursor-pointer disabled:opacity-50"
          >
            Back to Bag
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#28040B] text-[#FAF7F2] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#3D0A13] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin text-[#E8C98A]" />
                <span>Processing Order...</span>
              </>
            ) : selectedMethod === 'RAZORPAY' ? (
              <>
                <Lock size={14} className="text-[#E8C98A]" />
                <span>PAY ONLINE ({formatPrice(finalAmount)})</span>
                <ArrowRight size={14} />
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="text-[#E8C98A]" />
                <span>PLACE COD ORDER ({formatPrice(finalAmount)})</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

