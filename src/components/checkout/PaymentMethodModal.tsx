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

  // Calculate discount dynamically based on selected payment method
  const isPrepaid5 = appliedCoupon?.code === 'PREPAID5';
  let discountAmount = 0;

  if (appliedCoupon) {
    if (isPrepaid5) {
      // PREPAID5 only applies when RAZORPAY (online) is selected
      discountAmount = selectedMethod === 'RAZORPAY' ? Math.round((subtotal * 5) / 100) : 0;
    } else if (appliedCoupon.discountPercent) {
      discountAmount = Math.round((subtotal * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.flatDiscount) {
      discountAmount = Math.min(subtotal, appliedCoupon.flatDiscount);
    }
  }

  const finalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

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
        <div className="flex items-start justify-between p-5 sm:p-6 bg-gradient-to-r from-[#28040B] to-[#3D0A13] text-[#F8F1E3] border-b border-[#E8C98A]/30">
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
            <p className="text-xs text-[#F8F1E3]/70 font-sans">
              Select how you'd like to pay for your order.
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
          <div className="space-y-3">
            {/* Option 1: Razorpay Online */}
            <div
              onClick={() => handleSelectMethod('RAZORPAY')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedMethod === 'RAZORPAY'
                  ? 'bg-[#FAF0DC]/70 border-[#8C6C38] ring-1 ring-[#8C6C38]/40 shadow-xs'
                  : 'bg-white border-[#E8C98A]/30 hover:border-[#8C6C38]/50 hover:bg-[#FAF8F5]'
              }`}
            >
              <div className="pt-0.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    selectedMethod === 'RAZORPAY'
                      ? 'border-[#8C6C38] bg-[#8C6C38]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'RAZORPAY' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-[#8C6C38]" />
                    <span className="font-serif font-bold text-sm text-[#28040B]">
                      Pay Online with Razorpay
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 font-sans">
                  UPI • Credit/Debit Cards • Net Banking
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium">
                  <Sparkles size={11} className="text-amber-700" />
                  <span>Get 5% extra off with PREPAID5</span>
                </div>
              </div>
            </div>

            {/* Option 2: Cash on Delivery */}
            <div
              onClick={() => handleSelectMethod('COD')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                selectedMethod === 'COD'
                  ? 'bg-[#FAF0DC]/70 border-[#8C6C38] ring-1 ring-[#8C6C38]/40 shadow-xs'
                  : 'bg-white border-[#E8C98A]/30 hover:border-[#8C6C38]/50 hover:bg-[#FAF8F5]'
              }`}
            >
              <div className="pt-0.5">
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    selectedMethod === 'COD'
                      ? 'border-[#8C6C38] bg-[#8C6C38]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedMethod === 'COD' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-[#8C6C38]" />
                    <span className="font-serif font-bold text-sm text-[#28040B]">
                      Cash on Delivery
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                    COD
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 font-sans">
                  Pay when your order is delivered at your doorstep.
                </p>
                {isPrepaid5 && (
                  <p className="mt-1.5 text-[11px] text-amber-800/90 font-sans italic">
                    Note: PREPAID5 discount is not available for COD.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Order Total Breakdown */}
          <div className="p-4 rounded-xl bg-white border border-[#E8C98A]/30 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Items Subtotal</span>
              <span className="font-semibold text-gray-900 font-mono">{formatPrice(subtotal)}</span>
            </div>

            {appliedCoupon && (
              <div className="flex justify-between items-center text-emerald-700">
                <span className="flex items-center gap-1 font-medium">
                  <Tag size={12} />
                  <span>Promo ({appliedCoupon.code})</span>
                  {isPrepaid5 && selectedMethod === 'COD' && (
                    <span className="text-[10px] text-gray-400 font-normal italic ml-1">
                      (Online only)
                    </span>
                  )}
                </span>
                <span className="font-semibold font-mono">
                  {discountAmount > 0 ? `−${formatPrice(discountAmount)}` : '₹0'}
                </span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Standard Delivery</span>
              <span className="font-semibold text-gray-900 font-mono">
                {isFreeShipping || shippingFee === 0 ? 'FREE' : formatPrice(shippingFee)}
              </span>
            </div>

            <div className="border-t border-[#E8C98A]/30 pt-2 flex justify-between items-baseline text-sm">
              <span className="font-serif font-bold text-[#28040B]">Final Amount</span>
              <span className="font-serif text-lg font-bold text-[#28040B] font-mono">
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
                <span>Pay Online ({formatPrice(finalAmount)})</span>
                <ArrowRight size={14} />
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="text-[#E8C98A]" />
                <span>Place COD Order ({formatPrice(finalAmount)})</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
