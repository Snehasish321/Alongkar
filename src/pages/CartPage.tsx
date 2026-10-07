import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Tag,
  Check,
  Truck,
  Sparkles,
  Lock,
  Gift,
  HelpCircle,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useAuth, useUser, useClerk } from '@clerk/react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/utils';
import { productsData } from '../data/products';
import { ProductCard } from '../components/products/ProductCard';
import { loadRazorpayScript, openRazorpayCheckout } from '../lib/razorpay';
import { verifyRazorpayPayment, reconcileRazorpayPayment } from '../services/orderApi';
import { PaymentMethodModal } from '../components/checkout/PaymentMethodModal';
import type {
  PaymentMethod,
  RazorpayPaymentOrderResponse,
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
} from '../types';

interface CouponInfo {
  code: string;
  label: string;
  discountPercent?: number;
  flatDiscount?: number;
  minOrder?: number;
}

const PROMO_CODES: Record<string, CouponInfo> = {
  ALONGKAR10: {
    code: 'ALONGKAR10',
    label: '10% Off Atelier Special',
    discountPercent: 10,
  },
  PREPAID5: {
    code: 'PREPAID5',
    label: '5% Extra Off on Prepaid',
    discountPercent: 5,
  },
  FESTIVE500: {
    code: 'FESTIVE500',
    label: '₹500 Off on orders above ₹2,500',
    flatDiscount: 500,
    minOrder: 2500,
  },
  WELCOME100: {
    code: 'WELCOME100',
    label: '₹100 Flat Welcome Benefit',
    flatDiscount: 100,
    minOrder: 999,
  },
};

export const CartPage: React.FC = () => {
  const { cart, removeFromCart, updateQuantity, clearCart, totalItems, totalAmount } = useCart();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponInfo | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);

  // Payment Selection Modal State
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);

  // Checkout states
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [, setCapturedPayment] = useState<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    alongkarOrderId: string;
  } | null>(null);

  // Free shipping calculations (Threshold: ₹499)
  const freeShippingThreshold = 499;
  const subtotal = totalAmount;
  const isFreeShipping = subtotal >= freeShippingThreshold;
  const shippingFee = cart.length === 0 ? 0 : isFreeShipping ? 0 : 60;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  // Total Retail MRP and Savings Calculation
  const totalMRP = cart.reduce(
    (acc, item) => acc + (item.product.originalPrice || item.product.price) * item.quantity,
    0
  );
  const mrpSavings = Math.max(0, totalMRP - subtotal);

  // Coupon discount calculation for display in cart
  let couponDiscount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.minOrder && subtotal < appliedCoupon.minOrder) {
      couponDiscount = 0;
    } else if (appliedCoupon.discountPercent) {
      couponDiscount = Math.round((subtotal * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.flatDiscount) {
      couponDiscount = Math.min(subtotal, appliedCoupon.flatDiscount);
    }
  }

  const finalPayable = Math.max(0, subtotal - couponDiscount + shippingFee);
  const totalSavings = mrpSavings + couponDiscount + (isFreeShipping && subtotal > 0 ? 60 : 0);

  const handleRemoveItem = (productId: string) => {
    setActiveOrderId(null);
    removeFromCart(productId);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setActiveOrderId(null);
    updateQuantity(productId, quantity);
  };

  const handleClearCart = () => {
    setActiveOrderId(null);
    clearCart();
  };

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);
    setCouponSuccess(null);

    const clean = couponInput.trim().toUpperCase();
    if (!clean) {
      setCouponError('Please enter a coupon code.');
      return;
    }

    const matched = PROMO_CODES[clean];
    if (!matched) {
      setCouponError(`Code "${clean}" is invalid or expired.`);
      return;
    }

    if (matched.minOrder && subtotal < matched.minOrder) {
      setCouponError(
        `Code "${clean}" requires a minimum order value of ${formatPrice(matched.minOrder)}.`
      );
      return;
    }

    setAppliedCoupon(matched);
    setActiveOrderId(null);
    setCouponSuccess(`Code "${matched.code}" applied! ${matched.label}`);
    setCouponInput('');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setActiveOrderId(null);
    setCouponSuccess(null);
    setCouponError(null);
  };

  const handleOpenCheckout = () => {
    if (!isSignedIn) {
      setCheckoutNotice('Please sign in to complete your secure checkout.');
      clerk.openSignIn();
      return;
    }

    if (cart.length === 0 || totalAmount <= 0) {
      setCheckoutError('Your bag is currently empty.');
      return;
    }

    setCheckoutError(null);
    setCheckoutNotice(null);
    setIsPaymentMethodModalOpen(true);
  };

  const handleConfirmPaymentMethod = async (selectedMethod: PaymentMethod) => {
    if (isProcessingCheckout) return;

    setIsProcessingCheckout(true);
    setCheckoutError(null);
    setCheckoutNotice(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication session expired. Please sign in again.');
      }

      const idempotencyKey = `chk_${user?.id || 'usr'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const customerName = user?.fullName || user?.firstName || 'Alongkar Client';
      const rawPhone = user?.primaryPhoneNumber?.phoneNumber || '9876543210';
      const customerPhone = rawPhone.replace(/[^0-9]/g, '').slice(-10) || '9876543210';
      const customerEmail = user?.primaryEmailAddress?.emailAddress || undefined;

      // Case A: Cash on Delivery
      if (selectedMethod === 'COD') {
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
            couponCode: appliedCoupon?.code || undefined,
            paymentMethod: 'COD',
          }),
        });

        if (!orderCreateRes.ok) {
          const errPayload = await orderCreateRes.json().catch(() => ({}));
          throw new Error(errPayload?.error || 'Unable to place Cash on Delivery order. Please try again.');
        }

        const orderData = await orderCreateRes.json();
        const createdOrder = orderData?.order;
        const confirmedNum = createdOrder?.orderNumber || 'Confirmed';

        setIsPaymentMethodModalOpen(false);
        setConfirmedOrderNumber(confirmedNum);
        setActiveOrderId(null);
        clearCart();
        setCheckoutNotice(
          `Your Cash on Delivery order #${confirmedNum} has been placed successfully! Our team will prepare your shipment.`
        );
        setIsProcessingCheckout(false);
        return;
      }

      // Case B: Razorpay Online Payment
      let orderIdToPay = activeOrderId;

      if (!orderIdToPay) {
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
            couponCode: appliedCoupon?.code || undefined,
            paymentMethod: 'RAZORPAY',
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

        setActiveOrderId(orderIdToPay);
      }

      // Request Razorpay payment order initiation
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

      if (paymentData.alreadyPaid) {
        const confirmedNum = paymentData.order?.orderNumber || paymentData.orderNumber || 'Confirmed';
        setIsPaymentMethodModalOpen(false);
        setConfirmedOrderNumber(confirmedNum);
        setActiveOrderId(null);
        clearCart();
        setCheckoutNotice(
          paymentData.message || `Payment has already been received and order #${confirmedNum} is confirmed!`
        );
        setIsProcessingCheckout(false);
        return;
      }

      if (!paymentData.razorpayKeyId || !paymentData.razorpayOrderId) {
        throw new Error('Invalid payment configuration received from server.');
      }

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
              setIsPaymentMethodModalOpen(false);
              setConfirmedOrderNumber(confirmedNum);
              setActiveOrderId(null);
              clearCart();
              setCheckoutNotice(`Payment verified & order #${confirmedNum} confirmed!`);
            }
          } catch (verifyErr: any) {
            try {
              const targetOrderId = paymentData.alongkarOrderId || orderIdToPay;
              if (targetOrderId) {
                const reconcileResult = await reconcileRazorpayPayment(token, { orderId: targetOrderId });
                if (reconcileResult.success && (reconcileResult.reconciled || reconcileResult.alreadyPaid)) {
                  const confirmedNum = reconcileResult.order?.orderNumber || paymentData.orderNumber || 'Confirmed';
                  setIsPaymentMethodModalOpen(false);
                  setConfirmedOrderNumber(confirmedNum);
                  setActiveOrderId(null);
                  clearCart();
                  setCheckoutNotice(`Payment verified & order #${confirmedNum} confirmed!`);
                  return;
                }
              }
            } catch {
              // Ignore fallback failure
            }
            setCheckoutError(verifyErr.message || 'Payment verification failed. Please try again.');
          } finally {
            setIsProcessingCheckout(false);
          }
        },
      };

      setIsPaymentMethodModalOpen(false);
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

  // Curated recommended items if bag is empty or for cross-sell
  const recommendedProducts = productsData.filter((p) => p.isBestSeller).slice(0, 4);

  return (
    <StorefrontLayout>
      <div className="min-h-screen bg-[#FFFDF8] text-[#211A17]">
        
        {/* ── Breadcrumb & Header ── */}
        <section className="border-b border-[#E8C98A]/25 bg-gradient-to-b from-[#F7F2EA]/60 to-[#FFFDF8] py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <nav className="flex items-center gap-2 text-xs text-[#8C6C38] mb-3">
              <Link to="/" className="hover:text-[#211A17] transition-colors">
                Home
              </Link>
              <span>/</span>
              <Link to="/shop" className="hover:text-[#211A17] transition-colors">
                Shop
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#211A17]">Shopping Bag</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal text-[#211A17] tracking-tight">
                Shopping Bag
                {totalItems > 0 && (
                  <span className="text-base sm:text-lg text-[#8C6C38] font-sans font-light ml-3">
                    ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                  </span>
                )}
              </h1>

              {cart.length > 0 && (
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#8C6C38] hover:text-[#211A17] transition-colors font-medium"
                >
                  <ArrowLeft size={13} />
                  <span>Continue Shopping</span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* ── Main Cart Content ── */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          
          {cart.length === 0 ? (
            /* ── Empty Cart State ── */
            <div className="py-12 sm:py-16 text-center max-w-xl mx-auto">
              {confirmedOrderNumber ? (
                <div className="mb-8 p-6 rounded-2xl bg-[#FAF0DC]/80 border border-[#E8C98A]/50 text-left text-[#211A17] animate-fade-in shadow-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <CheckCircle size={22} />
                    </div>
                    <div>
                      <h3 className="font-serif text-lg font-semibold text-[#211A17]">
                        Payment Verified & Order Confirmed!
                      </h3>
                      <p className="text-xs text-[#8C6C38] mt-1 font-light leading-relaxed">
                        Thank you for your atelier order <span className="font-semibold text-[#211A17]">#{confirmedOrderNumber}</span>. Your pieces are being carefully prepared.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                          to="/orders"
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#211A17] text-[#FAF7F2] text-xs font-semibold uppercase tracking-wider hover:bg-[#3D0010] transition-colors"
                        >
                          <span>View My Orders</span>
                          <ArrowRight size={13} />
                        </Link>
                        <Link
                          to="/shop"
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-[#8C6C38]/40 text-[#211A17] text-xs font-semibold uppercase tracking-wider hover:bg-[#FAF0DC] transition-colors"
                        >
                          <span>Continue Shopping</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#B08D57]">
                    <ShoppingBag size={34} strokeWidth={1.5} />
                  </div>
                  <h2 className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal mb-3">
                    Your Shopping Bag is Empty
                  </h2>
                  <p className="text-xs sm:text-sm text-[#8C6C38] leading-relaxed mb-8 max-w-md mx-auto font-light">
                    Discover our curated collections of 24K micron gold-plated necklaces, artisan jhumkas, and royal polki sets.
                  </p>
                  <Link
                    to="/shop"
                    className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#211A17] text-[#FAF7F2] text-xs font-semibold uppercase tracking-[0.2em] hover:bg-[#3D0010] transition-all shadow-md"
                  >
                    <span>Explore The Atelier</span>
                    <ArrowRight size={14} />
                  </Link>
                </>
              )}

              {/* Recommended Items */}
              <div className="mt-20 text-left pt-12 border-t border-[#E8C98A]/25">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block">
                      Curated For You
                    </span>
                    <h3 className="font-serif text-xl text-[#211A17]">Trending Atelier Masterpieces</h3>
                  </div>
                  <Link to="/shop" className="text-xs text-[#8C6C38] hover:text-[#211A17] font-medium">
                    View All →
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {recommendedProducts.map((prod) => (
                    <ProductCard key={prod.id} product={prod} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── Full Page Cart Layout (2 Column) ── */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
              
              {/* Left Column: Items List & Details (8 Cols) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                
                {/* Free Shipping Notification Banner */}
                <div className="bg-[#FAF7F2] border border-[#E8C98A]/40 rounded-2xl p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between text-xs sm:text-sm mb-2.5">
                    <div className="flex items-center gap-2">
                      <Truck size={17} className="text-[#B08D57]" />
                      {isFreeShipping ? (
                        <span className="font-semibold text-[#211A17]">
                          ✨ Congratulations! You unlocked <strong className="text-emerald-700">FREE Express Delivery</strong>.
                        </span>
                      ) : (
                        <span className="text-[#5C4A2A]">
                          Add <strong className="text-[#211A17] font-semibold">{formatPrice(remainingForFreeShipping)}</strong> more to enjoy <strong className="text-[#B08D57]">FREE Shipping</strong>.
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono text-[#8C6C38]">
                      {formatPrice(subtotal)} / {formatPrice(freeShippingThreshold)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1.5 bg-[#E8C98A]/25 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#C9A45D] to-[#8C6C38] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${freeShippingProgress}%` }}
                    />
                  </div>
                </div>

                {/* Items Container */}
                <div className="bg-white border border-[#E8C98A]/30 rounded-2xl shadow-xs divide-y divide-[#E8C98A]/15 overflow-hidden">
                  
                  {/* Table Header (Desktop) */}
                  <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3.5 bg-[#FAF7F2] text-[11px] font-bold uppercase tracking-wider text-[#8C6C38]">
                    <div className="col-span-6">Jewellery Piece</div>
                    <div className="col-span-2 text-center">Unit Price</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-right">Line Total</div>
                  </div>

                  {/* Item Rows */}
                  {cart.map(({ product, quantity }) => {
                    const unitPrice = product.price;
                    const itemTotal = unitPrice * quantity;
                    const itemMRP = (product.originalPrice || product.price) * quantity;
                    const itemSavings = Math.max(0, itemMRP - itemTotal);

                    return (
                      <div
                        key={product.id}
                        className="p-4 sm:px-6 sm:py-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center hover:bg-[#FFFDF8] transition-colors"
                      >
                        {/* Piece Info & Thumbnail (col-span-6) */}
                        <div className="sm:col-span-6 flex gap-4 items-start">
                          <Link
                            to={`/product/${product.slug || product.id}`}
                            className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden bg-[#FAF7F2] border border-[#E8C98A]/25 flex-shrink-0 group block"
                          >
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          </Link>

                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-[#B08D57] block mb-0.5">
                              {product.category}
                            </span>
                            
                            <Link
                              to={`/product/${product.slug || product.id}`}
                              className="font-serif text-sm sm:text-base font-medium text-[#211A17] hover:text-[#8C6C38] transition-colors line-clamp-2 leading-snug"
                            >
                              {product.name}
                            </Link>

                            {/* Finish / Stone attribute chips */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {product.details?.finish && (
                                <span className="text-[10px] px-2 py-0.5 rounded-sm bg-[#FAF0DC] text-[#63481A] font-medium border border-[#E8C98A]/30">
                                  {product.details.finish}
                                </span>
                              )}
                              {product.details?.stoneType && (
                                <span className="text-[10px] px-2 py-0.5 rounded-sm bg-white text-[#8C6C38] font-medium border border-[#E8C98A]/30">
                                  {product.details.stoneType}
                                </span>
                              )}
                            </div>

                            {/* Mobile Price View */}
                            <div className="sm:hidden flex items-baseline gap-2 mt-2">
                              <span className="font-bold text-sm text-[#211A17]">
                                {formatPrice(unitPrice)}
                              </span>
                              {product.originalPrice > product.price && (
                                <span className="text-xs text-neutral-400 line-through">
                                  {formatPrice(product.originalPrice)}
                                </span>
                              )}
                            </div>

                            {/* Action Buttons: Remove & View */}
                            <div className="flex items-center gap-4 mt-3 pt-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(product.id)}
                                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-700 transition-colors cursor-pointer"
                                aria-label={`Remove ${product.name} from bag`}
                              >
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Unit Price (Desktop, col-span-2) */}
                        <div className="hidden sm:flex sm:col-span-2 flex-col items-center justify-center">
                          <span className="text-sm font-semibold text-[#211A17]">
                            {formatPrice(unitPrice)}
                          </span>
                          {product.originalPrice > product.price && (
                            <span className="text-[11px] text-neutral-400 line-through">
                              {formatPrice(product.originalPrice)}
                            </span>
                          )}
                        </div>

                        {/* Quantity Counter (col-span-2) */}
                        <div className="sm:col-span-2 flex items-center justify-between sm:justify-center">
                          <span className="sm:hidden text-xs text-neutral-500 font-medium">Quantity:</span>
                          
                          <div className="inline-flex items-center border border-[#211A17]/20 rounded-lg bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.id, quantity - 1)}
                              className="w-8 h-8 flex items-center justify-center text-neutral-600 hover:bg-[#FAF7F2] hover:text-[#211A17] transition-colors cursor-pointer"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-xs font-semibold text-[#211A17] font-mono">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(product.id, quantity + 1)}
                              className="w-8 h-8 flex items-center justify-center text-neutral-600 hover:bg-[#FAF7F2] hover:text-[#211A17] transition-colors cursor-pointer"
                              aria-label="Increase quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Line Total (col-span-2) */}
                        <div className="sm:col-span-2 flex sm:flex-col items-center justify-between sm:items-end">
                          <span className="sm:hidden text-xs text-neutral-500 font-medium">Line Total:</span>
                          <span className="font-serif text-base sm:text-lg font-semibold text-[#211A17]">
                            {formatPrice(itemTotal)}
                          </span>
                          {itemSavings > 0 && (
                            <span className="text-[10px] text-emerald-700 font-medium sm:block hidden">
                              Save {formatPrice(itemSavings)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Bag Actions Footer */}
                  <div className="px-6 py-4 bg-[#FAF7F2]/60 flex items-center justify-between flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleClearCart}
                      className="text-xs text-neutral-500 hover:text-red-700 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 size={13} />
                      <span>Clear Entire Bag</span>
                    </button>

                    <Link
                      to="/shop"
                      className="text-xs font-medium text-[#8C6C38] hover:text-[#211A17] transition-colors flex items-center gap-1"
                    >
                      <span>Add More Jewellery Pieces</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>

                {/* Assurance & Quality Pillars */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    { title: '24K Micron Gold', subtitle: 'Long-lasting plating', icon: Sparkles },
                    { title: '6-Month Guarantee', subtitle: 'Complimentary polish', icon: ShieldCheck },
                    { title: 'Tamper-Proof Box', subtitle: 'Signature velvet vault', icon: Gift },
                    { title: 'Pan-India Transit', subtitle: '100% Insured courier', icon: Truck },
                  ].map(({ title, subtitle, icon: Icon }) => (
                    <div
                      key={title}
                      className="p-3.5 rounded-xl bg-white border border-[#E8C98A]/25 flex items-start gap-3 shadow-2xs"
                    >
                      <Icon size={18} className="text-[#B08D57] flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-[#211A17]">{title}</h4>
                        <p className="text-[10px] text-[#8C6C38] font-light mt-0.5">{subtitle}</p>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

              {/* Right Column: Order Summary & Checkout (4-5 Cols) */}
              <div className="lg:col-span-5 xl:col-span-4">
                <div className="sticky top-24 space-y-5">
                  
                  {/* Summary Card */}
                  <div className="bg-white border border-[#E8C98A]/35 rounded-2xl p-6 shadow-sm">
                    <h2 className="font-serif text-lg font-medium text-[#211A17] pb-4 border-b border-[#E8C98A]/20">
                      Order Summary
                    </h2>

                    {/* Cost Breakdown */}
                    <div className="py-4 space-y-3 text-xs sm:text-sm divide-y divide-[#E8C98A]/15">
                      
                      <div className="space-y-2.5 pb-3">
                        {/* Retail MRP */}
                        {mrpSavings > 0 && (
                          <div className="flex justify-between text-[#8C6C38]">
                            <span>Total Retail Value (MRP)</span>
                            <span className="line-through text-neutral-400 font-mono">{formatPrice(totalMRP)}</span>
                          </div>
                        )}

                        {/* Subtotal */}
                        <div className="flex justify-between text-[#211A17]">
                          <span>Items Subtotal</span>
                          <span className="font-semibold font-mono">{formatPrice(subtotal)}</span>
                        </div>

                        {/* Product Discount */}
                        {mrpSavings > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>Catalogue Savings</span>
                            <span className="font-semibold font-mono">−{formatPrice(mrpSavings)}</span>
                          </div>
                        )}

                        {/* Coupon Discount */}
                        {appliedCoupon && couponDiscount > 0 && (
                          <div className="flex justify-between text-emerald-700 font-medium">
                            <span className="flex items-center gap-1">
                              <Tag size={12} />
                              <span>Promo ({appliedCoupon.code})</span>
                            </span>
                            <span className="font-semibold font-mono">−{formatPrice(couponDiscount)}</span>
                          </div>
                        )}

                        {/* Shipping */}
                        <div className="flex justify-between text-[#211A17]">
                          <span className="flex items-center gap-1">
                            <span>Standard Delivery</span>
                            {isFreeShipping && (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-xs font-semibold">
                                FREE
                              </span>
                            )}
                          </span>
                          <span className="font-semibold font-mono">
                            {isFreeShipping ? 'FREE' : formatPrice(shippingFee)}
                          </span>
                        </div>

                        {/* Packaging */}
                        <div className="flex justify-between text-[#211A17]">
                          <span className="flex items-center gap-1">
                            <span>Signature Velvet Unboxing Box</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-xs font-semibold">
                              INCLUDED
                            </span>
                          </span>
                          <span className="font-mono text-emerald-700 font-semibold">₹0</span>
                        </div>
                      </div>

                      {/* Total Payable */}
                      <div className="pt-3 space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-base font-serif font-bold text-[#211A17]">Total Amount</span>
                          <span className="font-serif text-2xl font-bold text-[#211A17] font-mono">
                            {formatPrice(finalPayable)}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#8C6C38] text-right">
                          Inclusive of all applicable GST & taxes
                        </p>
                      </div>

                    </div>

                    {/* Total Saved Highlight Banner */}
                    {totalSavings > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl p-3 text-center mb-5">
                        <p className="text-xs text-emerald-900 font-medium">
                          🎉 You are saving <strong className="font-bold">{formatPrice(totalSavings)}</strong> on this order!
                        </p>
                      </div>
                    )}

                    {/* Promo Code Box */}
                    <div className="pt-2 pb-5 border-t border-[#E8C98A]/20">
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between bg-[#FAF0DC]/70 border border-[#E8C98A]/50 rounded-xl p-3">
                          <div className="flex items-center gap-2">
                            <Tag size={15} className="text-[#8C6C38]" />
                            <div>
                              <p className="text-xs font-bold text-[#211A17] font-mono">{appliedCoupon.code}</p>
                              <p className="text-[10px] text-[#8C6C38]">{appliedCoupon.label}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveCoupon}
                            className="text-xs text-neutral-400 hover:text-red-700 font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <form onSubmit={handleApplyCoupon} className="space-y-2">
                          <label htmlFor="coupon" className="text-xs font-semibold text-[#8C6C38] block">
                            Have an Atelier Promo Code?
                          </label>
                          <div className="flex gap-2">
                            <input
                              id="coupon"
                              type="text"
                              value={couponInput}
                              onChange={(e) => setCouponInput(e.target.value)}
                              placeholder="e.g. ALONGKAR10"
                              className="flex-1 uppercase bg-[#FAF7F2] border border-[#E8C98A]/40 rounded-xl px-3.5 py-2 text-xs font-mono tracking-wider focus:outline-none focus:border-[#211A17] transition-colors"
                            />
                            <button
                              type="submit"
                              className="px-4 py-2 rounded-xl bg-[#211A17] text-[#FAF7F2] text-xs font-semibold uppercase tracking-wider hover:bg-[#3D0010] transition-colors cursor-pointer"
                            >
                              Apply
                            </button>
                          </div>
                          {couponError && (
                            <p className="text-[11px] text-red-600 font-medium mt-1">{couponError}</p>
                          )}
                          {couponSuccess && (
                            <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                              <Check size={12} />
                              <span>{couponSuccess}</span>
                            </p>
                          )}
                        </form>
                      )}

                      {/* Quick Available Coupons Pill List */}
                      {!appliedCoupon && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] text-[#8C6C38]">Try:</span>
                          {Object.keys(PROMO_CODES).map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => {
                                setCouponInput(code);
                                setCouponError(null);
                              }}
                              className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#FAF0DC] text-[#63481A] hover:bg-[#E8C98A]/40 border border-[#E8C98A]/30 transition-colors cursor-pointer"
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Checkout Error Feedback */}
                    {checkoutError && (
                      <div className="mb-3 p-3 rounded-xl bg-red-950/10 border border-red-500/30 text-red-700 text-xs flex items-start gap-2 animate-fade-in">
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
                        <div className="flex-1 font-sans">{checkoutError}</div>
                      </div>
                    )}

                    {/* Checkout Notice Feedback */}
                    {checkoutNotice && (
                      <div className="mb-3 p-3 rounded-xl bg-[#FAF0DC] border border-[#E8C98A]/50 text-[#211A17] text-xs flex items-start gap-2 animate-fade-in">
                        <CheckCircle size={15} className="mt-0.5 shrink-0 text-[#8C6C38]" />
                        <div className="flex-1 font-sans">
                          {checkoutNotice}
                          {confirmedOrderNumber && (
                            <div className="mt-1.5">
                              <Link
                                to="/orders"
                                className="inline-flex items-center gap-1 font-semibold text-[#8C6C38] hover:text-[#211A17] underline"
                              >
                                View in My Orders →
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Primary Checkout Button */}
                    <button
                      type="button"
                      disabled={isProcessingCheckout}
                      onClick={handleOpenCheckout}
                      className="w-full py-4 px-6 rounded-xl bg-[#211A17] text-[#FAF7F2] text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] hover:bg-[#3D0010] active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-[#211A17]/10 cursor-pointer group disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      {isProcessingCheckout ? (
                        <>
                          <Loader2 size={15} className="animate-spin text-[#E8C98A]" />
                          <span>Securing Payment...</span>
                        </>
                      ) : !isSignedIn ? (
                        <>
                          <Lock size={15} className="text-[#E8C98A]" />
                          <span>Sign In & Proceed to Checkout</span>
                          <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                        </>
                      ) : (
                        <>
                          <Lock size={15} className="text-[#E8C98A]" />
                          <span>Proceed to Secure Checkout</span>
                          <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>

                    {/* Trust Footnote */}
                    <div className="mt-4 pt-4 border-t border-[#E8C98A]/20 flex items-center justify-center gap-2 text-[11px] text-[#8C6C38]">
                      <ShieldCheck size={14} className="text-[#B08D57]" />
                      <span>256-Bit SSL Encrypted Checkout • Pan-India COD</span>
                    </div>

                  </div>

                  {/* Customer Concierge Note */}
                  <div className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8C98A]/25 text-xs text-[#8C6C38] flex items-start gap-2.5">
                    <HelpCircle size={16} className="text-[#B08D57] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#211A17]">Need assistance with your order?</p>
                      <p className="text-[11px] mt-0.5">
                        Our atelier jewellery concierge is available daily for size queries and styling guidance.
                      </p>
                      <Link to="/contact" className="text-[#B08D57] hover:underline font-medium text-[11px] inline-block mt-1">
                        Contact Concierge →
                      </Link>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </main>

        {/* Dedicated Payment Method Selection Modal */}
        <PaymentMethodModal
          isOpen={isPaymentMethodModalOpen}
          onClose={() => setIsPaymentMethodModalOpen(false)}
          subtotal={subtotal}
          shippingFee={shippingFee}
          isFreeShipping={isFreeShipping}
          appliedCoupon={appliedCoupon}
          onConfirm={handleConfirmPaymentMethod}
          isProcessing={isProcessingCheckout}
        />
      </div>
    </StorefrontLayout>
  );
};
