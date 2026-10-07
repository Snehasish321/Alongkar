import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ShieldCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useAuth, useUser, useClerk } from '@clerk/react';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../lib/utils';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';
import { loadRazorpayScript, openRazorpayCheckout } from '../../lib/razorpay';
import { verifyRazorpayPayment, reconcileRazorpayPayment } from '../../services/orderApi';
import { Button } from '../ui/Button';
import type {
  RazorpayPaymentOrderResponse,
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
} from '../../types';

interface ActiveOrderSnapshot {
  id: string;
  orderNumber: string;
  grandTotal: number;
  subtotal?: number;
  shippingFee?: number;
  itemCount: number;
  items?: Array<{
    id: string;
    productName: string;
    productImage?: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

export const CartDrawer: React.FC = () => {
  const navigate = useNavigate();
  const { cart, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, totalAmount, totalItems, clearCart } = useCart();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSnapshot | null>(null);
  const [, setCapturedPayment] = useState<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    alongkarOrderId: string;
  } | null>(null);

  const freeShippingThreshold = 499;
  const displayAmount = cart.length > 0 ? totalAmount : (activeOrder?.grandTotal || 0);
  const displayItemCount = cart.length > 0 ? totalItems : (activeOrder?.itemCount || 0);
  const progressToFreeShipping = Math.min(100, (displayAmount / freeShippingThreshold) * 100);
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - displayAmount);

  // Close drawer on Escape key
  useEffect(() => {
    if (!isCartOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCartOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCartOpen, setIsCartOpen]);

  const handleRemoveItem = (productId: string) => {
    setActiveOrderId(null);
    setActiveOrder(null);
    removeFromCart(productId);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setActiveOrderId(null);
    setActiveOrder(null);
    updateQuantity(productId, quantity);
  };

  const handleProceedToCheckout = async () => {
    if (isProcessingCheckout) return;

    if (!isSignedIn) {
      setCheckoutNotice('Please sign in to complete your secure checkout.');
      clerk.openSignIn();
      return;
    }

    // Step A: Determine if we are continuing an active pending order or creating a new order from cart.
    let orderIdToPay = activeOrderId;

    if (!orderIdToPay && (cart.length === 0 || totalAmount <= 0)) {
      setCheckoutError('Your bag is currently empty.');
      return;
    }

    setIsProcessingCheckout(true);
    setCheckoutError(null);
    setCheckoutNotice(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session expired. Please sign in again.');
      }

      // Step B: Ensure an Alongkar PENDING_PAYMENT order exists (create if not already active in session)
      if (!orderIdToPay) {
        const idempotencyKey = `chk_${user?.id || 'usr'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const customerName = user?.fullName || user?.firstName || 'Alongkar Client';
        const rawPhone = user?.primaryPhoneNumber?.phoneNumber || '9876543210';
        const customerPhone = rawPhone.replace(/[^0-9]/g, '').slice(-10) || '9876543210';
        const customerEmail = user?.primaryEmailAddress?.emailAddress || undefined;

        const orderCreateRes = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customerName,
            customerPhone,
            customerEmail,
            shippingAddress: {
              line1: 'Alongkar Registered Client Address',
              city: 'Kolkata',
              state: 'West Bengal',
              pincode: '700001',
              country: 'India',
            },
            idempotencyKey,
          }),
        });

        if (!orderCreateRes.ok) {
          const errPayload = await orderCreateRes.json().catch(() => ({}));
          throw new Error(errPayload?.error || 'Unable to create order. Please try again.');
        }

        const orderData = await orderCreateRes.json();
        const createdOrder = orderData?.order;
        orderIdToPay = createdOrder?.id;
        if (!orderIdToPay) {
          throw new Error('Server did not return a valid order ID.');
        }

        // Store active order snapshot so subsequent retries or renders recognize the pending order
        setActiveOrderId(orderIdToPay);
        setActiveOrder({
          id: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          grandTotal: createdOrder.grandTotal,
          subtotal: createdOrder.subtotal,
          shippingFee: createdOrder.shippingFee,
          itemCount: createdOrder.items?.reduce((acc: number, it: any) => acc + it.quantity, 0) || totalItems,
          items: createdOrder.items?.map((it: any) => ({
            id: it.id,
            productName: it.productName,
            productImage: it.productImage,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            lineTotal: it.lineTotal,
          })),
        });
      }

      // Step C: Request Razorpay payment order initiation from server
      const paymentOrderRes = await fetch('/api/payments/razorpay/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: orderIdToPay,
        }),
      });

      if (!paymentOrderRes.ok) {
        const errPayload = await paymentOrderRes.json().catch(() => ({}));
        throw new Error(errPayload?.error || 'Unable to initialize secure payment. Please try again.');
      }

      const paymentData: RazorpayPaymentOrderResponse = await paymentOrderRes.json();

      // If server confirmed order was already paid on gateway, reconcile without reopening checkout
      if (paymentData.alreadyPaid) {
        const confirmedNum = paymentData.order?.orderNumber || paymentData.orderNumber || 'Confirmed';
        setActiveOrderId(null);
        setActiveOrder(null);
        clearCart();
        setIsCartOpen(false);
        setIsProcessingCheckout(false);
        navigate(`/cart?confirmedOrder=${encodeURIComponent(confirmedNum)}`);
        return;
      }

      if (!paymentData.razorpayKeyId || !paymentData.razorpayOrderId) {
        throw new Error('Invalid payment configuration received from server.');
      }

      // Step D: Load Razorpay script dynamically & open Standard Checkout modal
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) {
        throw new Error('Unable to load payment gateway script. Please check your network connection.');
      }

      const prefillName = user?.fullName || user?.firstName || undefined;
      const prefillEmail = user?.primaryEmailAddress?.emailAddress || undefined;
      const prefillPhone = user?.primaryPhoneNumber?.phoneNumber
        ? user.primaryPhoneNumber.phoneNumber.replace(/[^0-9]/g, '').slice(-10)
        : undefined;

      const checkoutOptions: RazorpayCheckoutOptions = {
        key: paymentData.razorpayKeyId,
        amount: paymentData.amount || 0,
        currency: paymentData.currency || 'INR',
        name: 'Alongkar',
        description: `Order ${paymentData.orderNumber || 'Checkout'}`,
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
            setIsProcessingCheckout(false);
            setCheckoutNotice('Payment window closed. You can complete payment anytime with this order.');
          },
        },
        handler: async (response: RazorpayPaymentSuccessResponse) => {
          setIsProcessingCheckout(true);
          setCheckoutError(null);
          setCheckoutNotice('Verifying payment with secure server...');

          try {
            const targetOrderId = paymentData.alongkarOrderId || orderIdToPay || '';
            const verifyResult = await verifyRazorpayPayment(token, {
              orderId: targetOrderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyResult.success) {
              setCapturedPayment({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                alongkarOrderId: targetOrderId,
              });
              const confirmedNum = verifyResult.order?.orderNumber || paymentData.orderNumber || 'Confirmed';
              setActiveOrderId(null);
              setActiveOrder(null);
              clearCart();
              setIsCartOpen(false);
              navigate(`/cart?confirmedOrder=${encodeURIComponent(confirmedNum)}`);
            }
          } catch (verifyErr: any) {
            // Attempt fallback reconciliation before displaying permanent error
            try {
              const targetOrderId = paymentData.alongkarOrderId || orderIdToPay;
              if (targetOrderId) {
                const reconcileResult = await reconcileRazorpayPayment(token, { orderId: targetOrderId });
                if (reconcileResult.success && (reconcileResult.reconciled || reconcileResult.alreadyPaid)) {
                  const confirmedNum = reconcileResult.order?.orderNumber || paymentData.orderNumber || 'Confirmed';
                  setActiveOrderId(null);
                  setActiveOrder(null);
                  clearCart();
                  setIsCartOpen(false);
                  navigate(`/cart?confirmedOrder=${encodeURIComponent(confirmedNum)}`);
                  return;
                }
              }
            } catch {
              // Ignore fallback error
            }
            setCheckoutError(verifyErr.message || 'Payment verification failed. Please try again.');
          } finally {
            setIsProcessingCheckout(false);
          }
        },
      };

      await openRazorpayCheckout(checkoutOptions, (failedResponse) => {
        setIsProcessingCheckout(false);
        const failDescription = failedResponse?.error?.description || 'Payment was unsuccessful. Please try again.';
        setCheckoutError(failDescription);
      });
    } catch (err: any) {
      setIsProcessingCheckout(false);
      setCheckoutError(err.message || 'Payment initiation failed. Please try again.');
    }
  };

  if (!isCartOpen) return null;

  // Distinguish between:
  // 1. Has active cart items
  // 2. Cart was cleared because an Alongkar PENDING_PAYMENT order was created (active pending order)
  // 3. Truly empty cart with no pending order
  const hasActiveCart = cart.length > 0;
  const hasPendingOrder = !hasActiveCart && Boolean(activeOrderId && activeOrder);
  const isTrulyEmpty = !hasActiveCart && !hasPendingOrder;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsCartOpen(false)}
        className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50 animate-fade-in"
      />

      {/* Slide-over Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-ivory text-espresso z-50 flex flex-col justify-between shadow-2xl border-l border-gold/20 animate-drawer-slide-right"
        data-lenis-prevent
      >
        {/* Header */}
        <div className="p-5 border-b border-gold/20 flex items-center justify-between bg-ivory-pearl">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-gold" />
            <h3 className="font-serif text-lg font-semibold tracking-wide">
              {hasPendingOrder ? `Checkout (${activeOrder?.orderNumber})` : `Your Shopping Bag (${displayItemCount})`}
            </h3>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-1.5 text-espresso hover:text-gold transition-colors rounded-full"
            aria-label="Close bag"
          >
            <X size={20} />
          </button>
        </div>

        {/* Free Shipping Progress Indicator */}
        {hasActiveCart && (
          <div className="bg-ivory-soft p-3.5 border-b border-gold/10 px-5">
            <div className="flex justify-between text-xs mb-1.5 font-medium">
              {remainingForFreeShipping === 0 ? (
                <span className="text-gold font-semibold flex items-center gap-1">
                  ✨ Congratulations! You unlocked Free Delivery!
                </span>
              ) : (
                <span>
                  Add <strong className="text-gold">{formatPrice(remainingForFreeShipping)}</strong> more for FREE Shipping!
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold transition-all duration-500 rounded-full"
                style={{ width: `${progressToFreeShipping}%` }}
              />
            </div>
          </div>
        )}

        {/* Pending Order Notice Banner */}
        {hasPendingOrder && (
          <div className="bg-amber-950/10 border-b border-gold/20 p-3.5 px-5 flex items-center gap-2.5 text-xs text-espresso">
            <Clock size={16} className="text-gold shrink-0" />
            <div>
              <p className="font-semibold text-gold-dark font-serif">Order #{activeOrder?.orderNumber}</p>
              <p className="text-[11px] text-gray-600">Order created & reserved. Complete payment to confirm.</p>
            </div>
          </div>
        )}

        {/* Cart / Order Items List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-gold/10">
          {isTrulyEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-espresso/60 space-y-3">
              <ShoppingBag size={48} className="text-gold/40 stroke-1" />
              <p className="font-serif text-lg text-espresso">Your bag is currently empty</p>
              <p className="text-xs text-gray-500 max-w-xs">
                Explore our exquisite city gold collections and add timeless adornments to your bag.
              </p>
              <Button
                variant="gold"
                size="sm"
                className="mt-2"
                onClick={() => setIsCartOpen(false)}
              >
                Explore Shop
              </Button>
            </div>
          ) : hasPendingOrder ? (
            <div className="space-y-3">
              {activeOrder?.items && activeOrder.items.length > 0 ? (
                activeOrder.items.map((item) => (
                  <div key={item.id} className="pt-3 first:pt-0 flex gap-4">
                    {item.productImage && (
                      <img
                        src={getOptimizedImageUrl(item.productImage, IMAGE_PRESETS.THUMB_MD)}
                        alt={item.productName}
                        className="w-16 h-20 object-cover rounded-brand border border-gold/20 flex-shrink-0 bg-ivory-soft"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div className="flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <h4 className="text-xs sm:text-sm font-medium text-espresso font-serif line-clamp-2">
                          {item.productName}
                        </h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-bold text-espresso">
                          {formatPrice(item.lineTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-lg bg-ivory-pearl border border-gold/20 text-xs space-y-1">
                  <p className="font-medium text-espresso">Order Items Reserved</p>
                  <p className="text-gray-500">{activeOrder?.itemCount} item(s) awaiting payment completion.</p>
                </div>
              )}
            </div>
          ) : (
            cart.map(({ product, quantity }) => (
              <div key={product.id} className="pt-4 first:pt-0 flex gap-4">
                <img
                  src={getOptimizedImageUrl(product.image, IMAGE_PRESETS.THUMB_MD)}
                  alt={product.name}
                  className="w-20 h-24 object-cover rounded-brand border border-gold/20 flex-shrink-0 bg-ivory-soft"
                  loading="lazy"
                  decoding="async"
                />

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs sm:text-sm font-medium text-espresso font-serif line-clamp-2">
                        {product.name}
                      </h4>
                      <button
                        onClick={() => handleRemoveItem(product.id)}
                        className="text-gray-400 hover:text-burgundy transition-colors p-1"
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <p className="text-[11px] text-gold font-medium mt-1">
                      {product.details.finish}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    {/* Quantity Counter */}
                    <div className="flex items-center border border-espresso/20 rounded-brand bg-ivory-pearl">
                      <button
                        onClick={() => handleUpdateQuantity(product.id, quantity - 1)}
                        className="p-1 hover:bg-gold/10 text-espresso transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="px-2.5 text-xs font-semibold">{quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(product.id, quantity + 1)}
                        className="p-1 hover:bg-gold/10 text-espresso transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <span className="text-xs sm:text-sm font-bold text-espresso">
                        {formatPrice(product.price * quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        {(hasActiveCart || hasPendingOrder) && (
          <div className="p-5 bg-ivory-pearl border-t border-gold/20 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-espresso-light">
                <span>Subtotal</span>
                <span className="font-semibold text-espresso">{formatPrice(displayAmount)}</span>
              </div>
              <div className="flex justify-between text-espresso-light">
                <span>Shipping</span>
                <span className="text-gold font-semibold">
                  {remainingForFreeShipping === 0 ? 'FREE' : formatPrice(60)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-gold/10 text-espresso">
                <span>Total Amount</span>
                <span className="text-gold-dark font-serif text-base">{formatPrice(displayAmount)}</span>
              </div>
            </div>

            {/* Error Feedback */}
            {checkoutError && (
              <div className="p-2.5 rounded-lg bg-red-950/10 border border-red-500/30 text-red-700 text-xs flex items-start gap-2 animate-fade-in">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1 font-sans">{checkoutError}</div>
              </div>
            )}

            {/* Status / Notice Feedback */}
            {checkoutNotice && (
              <div className="p-2.5 rounded-lg bg-amber-950/10 border border-gold/30 text-espresso text-xs flex items-start gap-2 animate-fade-in">
                <CheckCircle size={14} className="mt-0.5 shrink-0 text-gold" />
                <div className="flex-1 font-sans">{checkoutNotice}</div>
              </div>
            )}

            <Button
              variant="gold"
              fullWidth
              size="lg"
              className="mt-2 group"
              disabled={isProcessingCheckout}
              onClick={handleProceedToCheckout}
            >
              <span className="flex items-center justify-center gap-2">
                {isProcessingCheckout ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>SECURING PAYMENT...</span>
                  </>
                ) : !isSignedIn ? (
                  <>
                    <span>SIGN IN & PROCEED TO CHECKOUT</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </>
                ) : hasPendingOrder ? (
                  <>
                    <span>PAY NOW ({formatPrice(displayAmount)})</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </>
                ) : (
                  <>
                    <span>PROCEED TO CHECKOUT</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </Button>

            <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500 pt-1">
              <ShieldCheck size={14} className="text-gold" />
              <span>100% Secure Razorpay Checkout • Quality Guaranteed</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
