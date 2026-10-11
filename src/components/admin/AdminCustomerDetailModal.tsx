import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import {
  X,
  Users,
  ShoppingBag,
  Sparkles,
  MapPoint,
  Copy,
  Check,
  Alert,
  Refresh,
} from 'reicon-react';
import type { AdminCustomerDetail } from '../../types';
import { fetchAdminCustomerDetail } from '../../services/customerApi';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getPaymentMethodBadgeInfo,
} from '../../lib/order-status';

// Module-scoped state for body scroll locking with reference counting
let activeScrollLockCount = 0;
let preservedScrollY = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';
let previousPaddingRight = '';

const acquireBodyScrollLock = (): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  if (activeScrollLockCount === 0) {
    preservedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    previousPaddingRight = document.body.style.paddingRight;

    // Compensate scrollbar width to prevent background layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Pause Lenis smooth scrolling if active on window
    const globalLenis = (window as unknown as { __lenis?: { stop: () => void } }).__lenis;
    if (globalLenis && typeof globalLenis.stop === 'function') {
      try {
        globalLenis.stop();
      } catch (e) {
        console.warn('Failed to stop Lenis:', e);
      }
    }
  }

  activeScrollLockCount++;
  let hasReleased = false;

  return () => {
    if (hasReleased) return;
    hasReleased = true;
    activeScrollLockCount = Math.max(0, activeScrollLockCount - 1);

    if (activeScrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.paddingRight = previousPaddingRight;

      const globalLenis = (
        window as unknown as {
          __lenis?: {
            start: () => void;
            scrollTo: (pos: number, opts?: { immediate: boolean }) => void;
          };
        }
      ).__lenis;

      if (globalLenis && typeof globalLenis.start === 'function') {
        try {
          globalLenis.start();
          if (typeof globalLenis.scrollTo === 'function') {
            globalLenis.scrollTo(preservedScrollY, { immediate: true });
          }
        } catch (e) {
          console.warn('Failed to restart Lenis:', e);
        }
      }

      window.scrollTo(0, preservedScrollY);
    }
  };
};

interface AdminCustomerDetailModalProps {
  isOpen: boolean;
  customerId: string | null;
  onClose: () => void;
}

export const AdminCustomerDetailModal: React.FC<AdminCustomerDetailModalProps> = ({
  isOpen,
  customerId,
  onClose,
}) => {
  const { getToken } = useAuth();
  const [customer, setCustomer] = useState<AdminCustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'addresses' | 'requests'>('overview');

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleCopy = (text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadCustomerDetail = useCallback(async () => {
    if (!customerId) return;
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in as an admin.');
      }
      const data = await fetchAdminCustomerDetail(token, customerId);
      setCustomer(data);
    } catch (err: any) {
      console.error('Failed to fetch customer detail:', err);
      setError(err.message || 'Unable to load customer details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [customerId, getToken]);

  useEffect(() => {
    if (isOpen && customerId) {
      loadCustomerDetail();
    } else {
      setCustomer(null);
      setError(null);
    }
  }, [isOpen, customerId, loadCustomerDetail]);

  // Lock body scroll when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const releaseLock = acquireBodyScrollLock();
    return () => {
      releaseLock();
    };
  }, [isOpen]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
      data-lenis-prevent
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#07030A]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Container */}
      <div
        className="relative w-full max-w-4xl bg-[#140B1A] border border-[#D6B878]/30 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] [max-height:90dvh] min-h-0 min-w-0 text-[#EDE4D5]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-customer-modal-title"
        data-lenis-prevent
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#180F20] border-b border-[#D6B878]/20 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="admin-customer-modal-title"
                  className="font-serif text-lg sm:text-xl font-bold text-[#F8F4EC] tracking-wide truncate"
                >
                  {customer?.displayName || (isLoading ? 'Loading customer...' : 'Unspecified Customer Name')}
                </h2>
                {customer && (
                  <>
                    {customer.metrics.totalOrders === 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-white/60">
                        New Account • No Orders Yet
                      </span>
                    ) : customer.metrics.repeatBuyer ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#B08D57]/20 border border-[#D6B878]/40 text-[#D6B878]">
                        Repeat Buyer
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-300">
                        Single Order Buyer
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-white/50 truncate">
                {customer?.registeredEmail || (customer ? 'No registered email' : 'Customer Account Inspector')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadCustomerDetail}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-[#D6B878]/40 text-white/70 hover:text-white transition-all disabled:opacity-50"
              title="Refresh Customer Details"
            >
              <Refresh className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-all"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        {customer && (
          <div className="flex items-center gap-1 px-5 sm:px-6 pt-3 pb-2 bg-[#180F20]/60 border-b border-white/5 shrink-0 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-[#40000D] border border-[#D6B878]/40 text-[#D6B878]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Overview & KPIs
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'orders'
                  ? 'bg-[#40000D] border border-[#D6B878]/40 text-[#D6B878]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Orders ({customer.orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addresses')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'addresses'
                  ? 'bg-[#40000D] border border-[#D6B878]/40 text-[#D6B878]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <MapPoint className="w-3.5 h-3.5" />
              Shipping Addresses ({customer.shippingAddresses.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'requests'
                  ? 'bg-[#40000D] border border-[#D6B878]/40 text-[#D6B878]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Bespoke Requests ({customer.jewelleryRequests.length})
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Customer details content"
          className="flex-1 overflow-y-auto overscroll-y-contain p-5 sm:p-6 space-y-6 focus:outline-none [scrollbar-width:thin] [scrollbar-color:#D6B878/30_transparent]"
          style={{ overscrollBehaviorY: 'contain' }}
          data-lenis-prevent
        >
          {error ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
                <Alert className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-base font-semibold text-rose-300">{error}</h3>
              <button
                type="button"
                onClick={loadCustomerDetail}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
              >
                Retry
              </button>
            </div>
          ) : isLoading || !customer ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-28 bg-white/5 rounded-2xl border border-white/5" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-white/5 rounded-xl border border-white/5" />
                ))}
              </div>
              <div className="h-44 bg-white/5 rounded-2xl border border-white/5" />
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Account Identity Card */}
                  <div className="bg-[#180F20] border border-[#D6B878]/20 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#D6B878]">
                        Account Identity & Profile Snapshots
                      </span>
                      <span className="text-[10px] text-white/40">Read-Only View</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      {/* Internal ID */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Internal Database User ID
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80 font-mono text-[11px] break-all">
                            {customer.id}
                          </code>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(customer.id, 'user_id', e)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
                            title="Copy user ID"
                          >
                            {copiedId === 'user_id' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Clerk ID */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Clerk Authentication ID
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80 font-mono text-[11px] break-all">
                            {customer.clerkUserId}
                          </code>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(customer.clerkUserId, 'clerk_id', e)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
                            title="Copy Clerk ID"
                          >
                            {copiedId === 'clerk_id' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Display Name Snapshot */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Latest Customer Name
                        </span>
                        <p className="font-semibold text-[#F8F4EC]">
                          {customer.displayName || <span className="text-white/30 italic">Not provided</span>}
                        </p>
                        <p className="text-[10px] text-white/40">
                          Derived from the latest order checkout snapshot
                        </p>
                      </div>

                      {/* Phone Snapshot */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Latest Contact Phone
                        </span>
                        <p className="font-semibold text-[#F8F4EC]">
                          {customer.phone || <span className="text-white/30 italic">Not provided</span>}
                        </p>
                        <p className="text-[10px] text-white/40">
                          Derived from order snapshot or custom jewellery request
                        </p>
                      </div>

                      {/* Registered Email */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Registered Email
                        </span>
                        <p className="font-medium text-white/90">
                          {customer.registeredEmail || <span className="text-white/30 italic">No email on record</span>}
                        </p>
                      </div>

                      {/* Timestamps */}
                      <div className="space-y-1">
                        <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">
                          Account Activity Timestamps
                        </span>
                        <div className="flex items-center gap-3 text-white/70">
                          <span>Joined: {formatDate(customer.createdAt)}</span>
                          <span>•</span>
                          <span>Last Order: {formatDate(customer.metrics.lastOrderDate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financial & Order KPI Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Gross Order Value */}
                    <div className="bg-[#180F20] border border-[#D6B878]/20 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">
                        Gross Order Value
                      </span>
                      <div className="my-1.5">
                        <p className="font-serif text-xl sm:text-2xl font-bold text-[#F8F4EC]">
                          ₹{customer.metrics.grossOrderValue.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-white/40 mt-0.5">Non-cancelled orders sum</p>
                      </div>
                    </div>

                    {/* Realized Spend */}
                    <div className="bg-[#180F20] border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/80">
                        Realized Spend
                      </span>
                      <div className="my-1.5">
                        <p className="font-serif text-xl sm:text-2xl font-bold text-emerald-300">
                          ₹{customer.metrics.realizedSpend.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-emerald-400/60 mt-0.5">Paid prepaid + delivered COD</p>
                      </div>
                    </div>

                    {/* Total Orders Breakdown */}
                    <div className="bg-[#180F20] border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400/80">
                        Order Count
                      </span>
                      <div className="my-1.5">
                        <p className="font-serif text-xl sm:text-2xl font-bold text-blue-300">
                          {customer.metrics.totalOrders}
                        </p>
                        <p className="text-[10px] text-blue-400/60 mt-0.5">
                          {customer.metrics.activeOrders} active • {customer.metrics.cancelledOrders} cancelled
                        </p>
                      </div>
                    </div>

                    {/* Associated Refund Value */}
                    <div className="bg-[#180F20] border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400/80">
                        Refunded Value
                      </span>
                      <div className="my-1.5">
                        <p className="font-serif text-xl sm:text-2xl font-bold text-purple-300">
                          ₹{customer.metrics.refundedValue.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-purple-400/60 mt-0.5">
                          {customer.jewelleryRequests.length} custom jewellery requests
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Activity Preview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Latest Order Preview */}
                    <div className="bg-[#180F20] border border-white/10 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-[#D6B878]" />
                          Latest Order
                        </span>
                        {customer.orders.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('orders')}
                            className="text-[11px] text-[#D6B878] hover:underline font-medium"
                          >
                            View all ({customer.orders.length}) →
                          </button>
                        )}
                      </div>

                      {customer.orders.length === 0 ? (
                        <p className="text-xs text-white/40 italic py-3">No orders placed yet.</p>
                      ) : (
                        <div className="space-y-2 text-xs">
                          {(() => {
                            const latest = customer.orders[0];
                            const orderBadge = getOrderStatusBadgeInfo(latest.status);
                            const payBadge = getPaymentStatusBadgeInfo(latest.paymentStatus);
                            return (
                              <div className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-[#F8F4EC]">
                                    #{latest.orderNumber}
                                  </span>
                                  <span className="font-serif font-bold text-[#D6B878]">
                                    ₹{latest.grandTotal.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                  <span className={`px-2 py-0.5 rounded-full border ${orderBadge.bgClass}`}>
                                    {orderBadge.label}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full border ${payBadge.bgClass}`}>
                                    {payBadge.label}
                                  </span>
                                  <span className="text-white/40">{formatDateTime(latest.createdAt)}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Latest Custom Jewellery Request Preview */}
                    <div className="bg-[#180F20] border border-white/10 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#D6B878]" />
                          Bespoke Requests
                        </span>
                        {customer.jewelleryRequests.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('requests')}
                            className="text-[11px] text-[#D6B878] hover:underline font-medium"
                          >
                            View all ({customer.jewelleryRequests.length}) →
                          </button>
                        )}
                      </div>

                      {customer.jewelleryRequests.length === 0 ? (
                        <p className="text-xs text-white/40 italic py-3">No bespoke requests submitted.</p>
                      ) : (
                        <div className="space-y-2 text-xs">
                          {(() => {
                            const latestReq = customer.jewelleryRequests[0];
                            return (
                              <div className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-semibold text-white/90">
                                    #{latestReq.requestNumber}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 border border-purple-500/30 text-purple-300">
                                    {latestReq.status}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/70">
                                  Type: <span className="font-medium text-white/90">{latestReq.jewelleryType}</span>
                                </p>
                                <p className="text-[10px] text-white/40">{formatDateTime(latestReq.createdAt)}</p>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ORDER HISTORY */}
              {activeTab === 'orders' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base font-bold text-[#F8F4EC] flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[#D6B878]" />
                      Order History ({customer.orders.length})
                    </h3>
                    <span className="text-xs text-white/40">Newest first</span>
                  </div>

                  {customer.orders.length === 0 ? (
                    <div className="p-12 text-center bg-[#180F20] border border-white/5 rounded-2xl space-y-2">
                      <ShoppingBag className="w-8 h-8 text-white/20 mx-auto" />
                      <p className="font-medium text-white/70">No orders on record</p>
                      <p className="text-xs text-white/40">This customer has not placed any orders yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customer.orders.map((ord) => {
                        const orderBadge = getOrderStatusBadgeInfo(ord.status);
                        const payBadge = getPaymentStatusBadgeInfo(ord.paymentStatus);
                        const methodBadge = getPaymentMethodBadgeInfo(ord.paymentProvider || 'COD');

                        return (
                          <div
                            key={ord.id}
                            className="bg-[#180F20] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3 hover:border-[#D6B878]/30 transition-colors"
                          >
                            {/* Order Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono text-sm font-bold text-[#F8F4EC]">
                                  #{ord.orderNumber}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(ord.orderNumber, `ord_${ord.id}`, e)}
                                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
                                  title="Copy order number"
                                >
                                  {copiedId === `ord_${ord.id}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <span className="text-xs text-white/40">
                                  {formatDateTime(ord.createdAt)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${methodBadge.bgClass}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${methodBadge.dotClass}`} />
                                  {methodBadge.detail}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${payBadge.bgClass}`}
                                >
                                  {payBadge.label}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${orderBadge.bgClass}`}
                                >
                                  {orderBadge.label}
                                </span>
                              </div>
                            </div>

                            {/* Order Items & Total */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                              {/* Items summary */}
                              <div className="sm:col-span-2 space-y-1.5">
                                <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                  Purchased Items ({ord.items.length})
                                </span>
                                <div className="space-y-1">
                                  {ord.items.map((it) => (
                                    <div
                                      key={it.id}
                                      className="flex items-center justify-between py-1 border-b border-white/[0.03] text-white/80"
                                    >
                                      <span className="truncate pr-2">
                                        {it.productName} × {it.quantity}
                                        {it.productSku && (
                                          <span className="text-white/40 text-[10px] ml-1.5">
                                            ({it.productSku})
                                          </span>
                                        )}
                                      </span>
                                      <span className="font-serif text-[#EDE4D5] shrink-0">
                                        ₹{it.lineTotal.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Amount Breakdown */}
                              <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col justify-between">
                                <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-2">
                                  Financial Breakdown
                                </span>
                                <div className="space-y-1 text-[11px] text-white/70">
                                  <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span>₹{ord.subtotal.toLocaleString('en-IN')}</span>
                                  </div>
                                  {ord.discountTotal > 0 && (
                                    <div className="flex justify-between text-emerald-400">
                                      <span>Discount:</span>
                                      <span>-₹{ord.discountTotal.toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span>Shipping:</span>
                                    <span>₹{ord.shippingFee.toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex justify-between pt-1 border-t border-white/10 font-bold text-sm text-[#F8F4EC]">
                                    <span>Grand Total:</span>
                                    <span className="font-serif text-[#D6B878]">
                                      ₹{ord.grandTotal.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Shipping snapshot for this order */}
                            {ord.shippingAddress && (
                              <div className="text-[11px] text-white/50 pt-2 border-t border-white/5 flex items-start gap-1.5">
                                <MapPoint className="w-3.5 h-3.5 text-[#D6B878] shrink-0 mt-0.5" />
                                <span>
                                  Shipped to: {ord.shippingAddress.line1}
                                  {ord.shippingAddress.line2 ? `, ${ord.shippingAddress.line2}` : ''},{' '}
                                  {ord.shippingAddress.city}, {ord.shippingAddress.state} -{' '}
                                  {ord.shippingAddress.pincode}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SHIPPING ADDRESSES */}
              {activeTab === 'addresses' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base font-bold text-[#F8F4EC] flex items-center gap-2">
                      <MapPoint className="w-4 h-4 text-[#D6B878]" />
                      Historical Shipping Addresses ({customer.shippingAddresses.length})
                    </h3>
                    <span className="text-xs text-white/40">Deduplicated order snapshots</span>
                  </div>

                  {customer.shippingAddresses.length === 0 ? (
                    <div className="p-12 text-center bg-[#180F20] border border-white/5 rounded-2xl space-y-2">
                      <MapPoint className="w-8 h-8 text-white/20 mx-auto" />
                      <p className="font-medium text-white/70">No addresses on record</p>
                      <p className="text-xs text-white/40">
                        This customer has not saved or used any shipping addresses during checkout.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {customer.shippingAddresses.map((addr, idx) => (
                        <div
                          key={idx}
                          className="bg-[#180F20] border border-white/10 rounded-2xl p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[11px] font-bold text-[#D6B878] flex items-center gap-1.5">
                              <MapPoint className="w-3.5 h-3.5" />
                              Address #{idx + 1}
                            </span>
                            <span className="text-[10px] text-white/40">
                              Order #{addr.orderNumber}
                            </span>
                          </div>
                          <div className="text-xs text-white/80 space-y-0.5">
                            <p className="font-medium">{addr.line1}</p>
                            {addr.line2 && <p className="text-white/60">{addr.line2}</p>}
                            <p className="text-white/70">
                              {addr.city}, {addr.state} - {addr.pincode}
                            </p>
                            <p className="text-white/50 text-[11px]">{addr.country || 'India'}</p>
                          </div>
                          <div className="pt-2 border-t border-white/5 text-[10px] text-white/40">
                            Recorded: {formatDateTime(addr.usedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: BESPOKE REQUESTS */}
              {activeTab === 'requests' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base font-bold text-[#F8F4EC] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#D6B878]" />
                      Bespoke Jewellery Requests ({customer.jewelleryRequests.length})
                    </h3>
                    <span className="text-xs text-white/40">Custom designs & inquiries</span>
                  </div>

                  {customer.jewelleryRequests.length === 0 ? (
                    <div className="p-12 text-center bg-[#180F20] border border-white/5 rounded-2xl space-y-2">
                      <Sparkles className="w-8 h-8 text-white/20 mx-auto" />
                      <p className="font-medium text-white/70">No bespoke requests on record</p>
                      <p className="text-xs text-white/40">
                        This customer has not submitted custom jewellery requests.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customer.jewelleryRequests.map((req) => (
                        <div
                          key={req.id}
                          className="bg-[#180F20] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#F8F4EC]">
                                #{req.requestNumber}
                              </span>
                              <span className="text-[11px] text-white/40">
                                {formatDateTime(req.createdAt)}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 border border-purple-500/30 text-purple-300">
                              {req.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Jewellery Type
                              </span>
                              <p className="font-medium text-white/90">{req.jewelleryType}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Contact Phone
                              </span>
                              <p className="font-medium text-white/90">{req.phone || '—'}</p>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Budget / Quoted Price
                              </span>
                              <p className="font-serif text-[#D6B878]">
                                {req.quotedPrice !== null
                                  ? `Quoted: ₹${req.quotedPrice.toLocaleString('en-IN')}`
                                  : req.budget !== null
                                    ? `Budget: ₹${req.budget.toLocaleString('en-IN')}`
                                    : 'Not specified'}
                              </p>
                            </div>
                          </div>

                          {req.description && (
                            <div className="text-xs bg-black/30 border border-white/5 rounded-xl p-3 text-white/80">
                              <span className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                                Client Description
                              </span>
                              <p className="whitespace-pre-line text-[11px]">{req.description}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 bg-[#180F20] border-t border-[#D6B878]/20 shrink-0 z-20">
          <div className="text-[11px] text-white/40">
            {customer && (
              <span>
                Registered Account Identity: <code className="text-white/60 font-mono">{customer.id}</code>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
