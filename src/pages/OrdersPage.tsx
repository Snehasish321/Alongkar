import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser, SignInButton } from '@clerk/react';
import {
  Sparkles,
  Refresh,
  Eye,
  Alert,
  Login,
  Package,
  Calendar,
  ArrowRight,
  Truck,
  Lock,
} from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { Button } from '../components/ui/Button';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../lib/image';
import type {
  Order,
  RazorpayPaymentOrderResponse,
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
} from '../types';
import { fetchCustomerOrders, verifyRazorpayPayment, reconcileRazorpayPayment } from '../services/orderApi';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getShippingStatusBadgeInfo,
} from '../lib/order-status';
import { CustomerOrderDetailModal } from '../components/orders/CustomerOrderDetailModal';
import { loadRazorpayScript, openRazorpayCheckout } from '../lib/razorpay';

export const OrdersPage: React.FC = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal inspection
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Quick Pay State
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Fetch Orders from GET /api/orders
  const loadOrders = useCallback(
    async (pageToLoad: number = 1) => {
      if (!isSignedIn) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const data = await fetchCustomerOrders(token, pageToLoad, 10);
        setOrders(data.orders);
        setPagination(data.pagination);
      } catch (err: any) {
        console.error('Error fetching customer orders:', err);
        setError("We couldn't load your order history. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, isSignedIn]
  );

  useEffect(() => {
    if (isLoaded) {
      loadOrders(1);
    }
  }, [isLoaded, loadOrders]);

  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  const handleQuickPay = async (order: Order) => {
    if (payingOrderId) return;

    setPayingOrderId(order.id);
    setPageError(null);
    setPageNotice(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required to complete payment.');
      }

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
        setPageNotice(paymentData.message || `Payment verified & Order #${order.orderNumber} confirmed!`);
        await loadOrders(pagination.page);
        setPayingOrderId(null);
        return;
      }

      if (!paymentData.razorpayKeyId || !paymentData.razorpayOrderId) {
        throw new Error('Invalid payment configuration received from server.');
      }

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
            setPayingOrderId(null);
            setPageNotice('Payment window closed. You can complete payment anytime with this order.');
          },
        },
        handler: async (response: RazorpayPaymentSuccessResponse) => {
          setPageNotice('Verifying payment with secure server...');
          try {
            const verifyResult = await verifyRazorpayPayment(token, {
              orderId: order.id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyResult.success) {
              setPageNotice(`Payment verified & Order #${order.orderNumber} confirmed!`);
              await loadOrders(pagination.page);
            }
          } catch (verifyErr: any) {
            // Attempt fallback server-side reconciliation before displaying error
            try {
              const reconcileResult = await reconcileRazorpayPayment(token, { orderId: order.id });
              if (reconcileResult.success && (reconcileResult.reconciled || reconcileResult.alreadyPaid)) {
                setPageNotice(`Payment confirmed & Order #${order.orderNumber} is complete!`);
                await loadOrders(pagination.page);
                return;
              }
            } catch {
              // Ignore fallback error and present verification error
            }
            setPageError(verifyErr.message || 'Payment verification failed. Please try again.');
          } finally {
            setPayingOrderId(null);
          }
        },
      };

      await openRazorpayCheckout(checkoutOptions, (failedResponse) => {
        setPayingOrderId(null);
        const failDescription = failedResponse?.error?.description || 'Payment was unsuccessful. Please try again.';
        setPageError(failDescription);
      });
    } catch (err: any) {
      setPayingOrderId(null);
      setPageError(err.message || 'Payment initiation failed.');
    }
  };

  const formatDate = (dateString: string | Date) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(dateString);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <StorefrontLayout>
      <main className="bg-[#FFFDF8] min-h-[75vh] py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Page Heading */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E8C98A]/30">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#8C6C38] font-bold">
                <Sparkles size={14} />
                <span>ALONGKAR ATELIER SERVICES</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#28040B] tracking-tight">
                My Orders
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-2xl leading-relaxed">
                Review your handcrafted jewellery orders, track shipment milestones, and view financial receipts.
              </p>
            </div>

            {isSignedIn && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadOrders(pagination.page)}
                disabled={isLoading}
                className="gap-2 self-start md:self-auto cursor-pointer text-xs"
              >
                <Refresh size={14} className={isLoading ? 'animate-spin' : ''} />
                <span>REFRESH</span>
              </Button>
            )}
          </div>

          {/* Notices */}
          {pageNotice && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-center justify-between">
              <span>{pageNotice}</span>
              <button
                type="button"
                onClick={() => setPageNotice(null)}
                className="text-amber-800 font-bold ml-4 cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          )}

          {pageError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Alert size={16} className="text-rose-600 shrink-0" />
                <span>{pageError}</span>
              </div>
              <button
                type="button"
                onClick={() => setPageError(null)}
                className="text-rose-800 font-bold ml-4 cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          )}

          {/* Unauthenticated View */}
          {!isSignedIn && isLoaded && (
            <div className="py-16 text-center space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#E8C98A]/20 rounded-full flex items-center justify-center mx-auto text-[#8C6C38]">
                <Package size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-bold text-[#28040B]">
                  Sign In to View Orders
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-light">
                  Please log in to your Alongkar client account to access your purchase history and tracking details.
                </p>
              </div>
              <SignInButton mode="modal">
                <Button variant="gold" size="md" className="gap-2 cursor-pointer mx-auto">
                  <Login size={16} />
                  <span>SIGN IN TO MY ACCOUNT</span>
                </Button>
              </SignInButton>
            </div>
          )}

          {/* Authenticated Loading Skeleton */}
          {isSignedIn && isLoading && (
            <div className="space-y-4" aria-busy="true">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-white p-6 rounded-2xl border border-[#E8C98A]/30 shadow-xs animate-pulse space-y-4"
                >
                  <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                    <div className="space-y-2">
                      <div className="h-5 w-40 bg-[#E8C98A]/20 rounded" />
                      <div className="h-3 w-28 bg-gray-100 rounded" />
                    </div>
                    <div className="h-6 w-24 bg-[#E8C98A]/20 rounded-full" />
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-1/3 bg-gray-200 rounded" />
                      <div className="h-3 w-1/4 bg-gray-100 rounded" />
                    </div>
                    <div className="h-6 w-20 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Authenticated Error State */}
          {isSignedIn && !isLoading && error && (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-600">
                <Alert size={28} />
              </div>
              <h2 className="font-serif text-xl font-bold text-gray-900">
                Unable to Load Orders
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">{error}</p>
              <Button
                variant="gold"
                size="sm"
                onClick={() => loadOrders(pagination.page)}
                className="gap-2 cursor-pointer mx-auto"
              >
                <Refresh size={14} />
                <span>TRY AGAIN</span>
              </Button>
            </div>
          )}

          {/* Authenticated Empty State */}
          {isSignedIn && !isLoading && !error && orders.length === 0 && (
            <div className="py-16 text-center space-y-6 max-w-md mx-auto">
              <div className="w-16 h-16 bg-[#E8C98A]/20 rounded-full flex items-center justify-center mx-auto text-[#8C6C38]">
                <Package size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-bold text-[#28040B]">
                  No Orders Yet
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-light">
                  You haven't placed any jewellery orders yet. Discover our latest collection of 24K city gold necklaces, bangles, and earrings.
                </p>
              </div>
              <Link to="/shop">
                <Button variant="gold" size="md" className="gap-2 cursor-pointer mx-auto">
                  <span>EXPLORE COLLECTION</span>
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          )}

          {/* Authenticated Order Cards List */}
          {isSignedIn && !isLoading && !error && orders.length > 0 && (
            <div className="space-y-5">
              {orders.map((order) => {
                const orderBadge = getOrderStatusBadgeInfo(order.status);
                const paymentBadge = getPaymentStatusBadgeInfo(order.paymentStatus);
                const shippingBadge = getShippingStatusBadgeInfo(order.shippingStatus);
                const OrderIcon = orderBadge.icon;
                const PaymentIcon = paymentBadge.icon;
                const ShippingIcon = shippingBadge.icon;
                const isPendingPayment =
                  order.status === 'PENDING_PAYMENT' || order.paymentStatus === 'PENDING';
                const isPayingThisOrder = payingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-[#E8C98A]/30 shadow-xs hover:border-[#E8C98A]/60 transition-all duration-200 overflow-hidden"
                  >
                    {/* Order Card Header */}
                    <div className="p-4 sm:p-5 bg-gradient-to-r from-[#FAF8F5] to-[#FFFDF8] border-b border-[#E8C98A]/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-bold text-base sm:text-lg text-[#28040B]">
                            {order.orderNumber}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500 font-sans flex items-center gap-1">
                            <Calendar size={12} className="text-[#8C6C38]" />
                            {formatDate(order.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-light">
                          {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? '' : 's'} • Total: {formatCurrency(order.grandTotal)}
                        </p>
                      </div>

                      {/* Status Badges Group */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Order Status */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${orderBadge.bgClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${orderBadge.dotClass}`} />
                          <OrderIcon size={12} />
                          <span>{orderBadge.label}</span>
                        </span>

                        {/* Payment Status */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${paymentBadge.bgClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${paymentBadge.dotClass}`} />
                          <PaymentIcon size={12} />
                          <span>{paymentBadge.label}</span>
                        </span>

                        {/* Shipping Status */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${shippingBadge.bgClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${shippingBadge.dotClass}`} />
                          <ShippingIcon size={12} />
                          <span>{shippingBadge.label}</span>
                        </span>
                      </div>
                    </div>

                    {/* Order Card Body: Items Preview */}
                    <div className="p-4 sm:p-5 divide-y divide-[#E8C98A]/15">
                      {order.items && order.items.length > 0 ? (
                        order.items.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="py-3 first:pt-0 last:pb-0 flex items-center gap-3 sm:gap-4"
                          >
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#FAF8F5] border border-[#E8C98A]/25 overflow-hidden shrink-0">
                              <img
                                src={getOptimizedImageUrl(
                                  item.productImage,
                                  IMAGE_PRESETS.THUMB_MD
                                )}
                                alt={item.productName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-serif font-bold text-xs sm:text-sm text-[#28040B] truncate">
                                {item.productName}
                              </h4>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                Qty: {item.quantity} × {formatCurrency(item.unitPrice)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-serif font-bold text-xs sm:text-sm text-[#28040B]">
                                {formatCurrency(item.lineTotal)}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-2 text-xs text-gray-400">No item details available.</div>
                      )}

                      {order.items && order.items.length > 3 && (
                        <div className="pt-2 text-[11px] text-[#8C6C38] font-medium">
                          +{order.items.length - 3} more item
                          {order.items.length - 3 > 1 ? 's' : ''} in this order
                        </div>
                      )}
                    </div>

                    {/* Order Card Footer */}
                    <div className="p-4 sm:p-5 bg-[#FAF8F5]/60 border-t border-[#E8C98A]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600 font-sans">
                        <Truck size={14} className="text-[#8C6C38]" />
                        <span>
                          Ship to: {order.shippingAddress?.city}, {order.shippingAddress?.state} ({order.shippingAddress?.pincode})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetail(order)}
                          className="gap-1.5 text-xs cursor-pointer flex-1 sm:flex-initial"
                        >
                          <Eye size={14} />
                          <span>VIEW DETAILS</span>
                        </Button>

                        {isPendingPayment && (
                          <Button
                            type="button"
                            variant="gold"
                            size="sm"
                            onClick={() => handleQuickPay(order)}
                            disabled={isPayingThisOrder}
                            className="gap-1.5 text-xs cursor-pointer flex-1 sm:flex-initial"
                          >
                            {isPayingThisOrder ? (
                              <>
                                <Refresh size={14} className="animate-spin" />
                                <span>INITIALIZING...</span>
                              </>
                            ) : (
                              <>
                                <Lock size={14} />
                                <span>PAY NOW ({formatCurrency(order.grandTotal)})</span>
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="pt-6 flex items-center justify-between border-t border-[#E8C98A]/30 text-xs">
                  <span className="text-gray-500">
                    Showing Page {pagination.page} of {pagination.totalPages} ({pagination.total} orders total)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadOrders(pagination.page - 1)}
                      disabled={pagination.page <= 1 || isLoading}
                      className="cursor-pointer"
                    >
                      PREVIOUS
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadOrders(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages || isLoading}
                      className="cursor-pointer"
                    >
                      NEXT
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Customer Order Detail Modal */}
      <CustomerOrderDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        order={selectedOrder}
      />
    </StorefrontLayout>
  );
};
