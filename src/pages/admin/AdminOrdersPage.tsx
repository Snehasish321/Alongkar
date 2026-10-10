import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/react';
import {
  Search,
  Refresh,
  Clock,
  TickCircle,
  Sparkles,
  ShoppingBag,
  Eye,
  Copy,
  Check,
  Filter,
  XCircle2,
  ChevronLeft,
  ChevronRight,
  Alert,
} from 'reicon-react';
import type { Order, AdminOrderStats } from '../../types';
import {
  getOrderStatusBadgeInfo,
  getPaymentStatusBadgeInfo,
  getPaymentMethodBadgeInfo,
} from '../../lib/order-status';
import { fetchAdminOrders } from '../../services/orderApi';
import { AdminOrderDetailModal } from '../../components/admin/AdminOrderDetailModal';

export const AdminOrdersPage: React.FC = () => {
  const { getToken } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<AdminOrderStats>({
    total: 0,
    pendingPayment: 0,
    confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [pageSize, setPageSize] = useState(20);

  // Modal inspection
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch Orders from GET /api/admin/orders
  const loadOrders = useCallback(
    async (pageToLoad: number = 1) => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Unauthorized. Please sign in as an admin.');
        }

        const data = await fetchAdminOrders(token, {
          page: pageToLoad,
          limit: pageSize,
          status: statusFilter,
          paymentStatus: paymentStatusFilter,
          paymentMethod: paymentMethodFilter,
          search: debouncedSearch,
        });

        setOrders(data.orders);
        setPagination(data.pagination);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (err: any) {
        console.error('Error fetching admin orders:', err);
        setError(err.message || 'Unable to load orders. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, pageSize, statusFilter, paymentStatusFilter, paymentMethodFilter, debouncedSearch]
  );

  // Reload when filters, search, or page size changes (resets to page 1)
  useEffect(() => {
    loadOrders(1);
  }, [loadOrders]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadOrders(newPage);
    }
  };

  const hasActiveFilters = useMemo(() => {
    return (
      statusFilter !== 'ALL' ||
      paymentStatusFilter !== 'ALL' ||
      paymentMethodFilter !== 'ALL' ||
      debouncedSearch.trim().length > 0
    );
  }, [statusFilter, paymentStatusFilter, paymentMethodFilter, debouncedSearch]);

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('ALL');
    setPaymentStatusFilter('ALL');
    setPaymentMethodFilter('ALL');
  };

  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#F8F4EC] tracking-wide flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-[#D6B878]" />
            Orders Management
          </h1>
          <p className="text-xs sm:text-sm text-white/50 mt-1">
            Real-time customer orders, immutable snapshot records, and transaction inspection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadOrders(pagination.page)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#140B1A] border border-[#D6B878]/30 hover:border-[#D6B878]/60 text-xs font-semibold text-[#EDE4D5] hover:text-white transition-all disabled:opacity-50"
            title="Refresh order records"
          >
            <Refresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* Total Orders */}
        <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-[#D6B878]/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">
              Total Orders
            </span>
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#D6B878]">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-[#F8F4EC]">{stats.total}</p>
        </div>

        {/* Pending Payment */}
        <div className="bg-[#140B1A] border border-amber-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/80">
              Pending Payment
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-amber-300">{stats.pendingPayment}</p>
        </div>

        {/* Confirmed */}
        <div className="bg-[#140B1A] border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/80">
              Confirmed
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TickCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-emerald-300">{stats.confirmed}</p>
        </div>

        {/* Processing */}
        <div className="bg-[#140B1A] border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400/80">
              Processing
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-blue-300">{stats.processing}</p>
        </div>

        {/* Delivered */}
        <div className="bg-[#140B1A] border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-purple-500/40 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400/80">
              Delivered
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TickCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-purple-300">{stats.delivered}</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search order ID, customer name, email or phone..."
              className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-[#EDE4D5] placeholder:text-white/30 focus:outline-none focus:border-[#D6B878]/60 transition-colors"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <XCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Order Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value="ALL">All Order Statuses</option>
              <option value="PENDING_PAYMENT">Pending Payment</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PROCESSING">Processing</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value="ALL">All Payment Methods</option>
              <option value="RAZORPAY">Razorpay (Online)</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>
          </div>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-white/40 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#D6B878]" />
              Filtering active orders
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[#D6B878] hover:underline text-xs font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Orders Table Container */}
      <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <Alert className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-base font-semibold text-rose-300">{error}</h3>
            <button
              type="button"
              onClick={() => loadOrders(pagination.page)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            <div className="h-10 bg-white/5 rounded-xl" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.02] border border-white/5 rounded-xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878] mx-auto">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#F8F4EC]">No Orders Found</h3>
            <p className="text-xs text-white/50 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No customer orders match your active search and filter criteria.'
                : 'There are no customer orders recorded in the system yet.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-[#40000D] border border-[#D6B878]/30 hover:border-[#D6B878]/60 text-xs font-semibold text-[#D6B878] transition-all"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-[10px] uppercase tracking-wider font-semibold text-white/50">
                  <th className="py-3.5 px-4">Order ID</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Items</th>
                  <th className="py-3.5 px-4">Total</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Payment Status</th>
                  <th className="py-3.5 px-4">Order Status</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-white/80">
                {orders.map((order) => {
                  const orderBadge = getOrderStatusBadgeInfo(order.status);
                  const paymentBadge = getPaymentStatusBadgeInfo(order.paymentStatus);
                  const paymentMethodBadge = getPaymentMethodBadgeInfo(order.paymentProvider);
                  const OrderIcon = orderBadge.icon;
                  const PaymentIcon = paymentBadge.icon;

                  const totalItemsQty = order.items?.reduce((sum, it) => sum + it.quantity, 0) || 0;
                  const firstItemName = order.items?.[0]?.productName || 'Jewellery Item';
                  const extraItemsCount = (order.items?.length || 0) - 1;

                  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenDetail(order)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    >
                      {/* Order Number */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-[#D6B878] group-hover:underline">
                            {order.orderNumber}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(order.orderNumber, order.id, e)}
                            className="p-1 rounded text-white/30 hover:text-[#D6B878] transition-colors opacity-0 group-hover:opacity-100"
                            title="Copy Order Number"
                          >
                            {copiedId === order.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="min-w-0 max-w-[180px]">
                          <p className="font-medium text-white/90 truncate">{order.customerName}</p>
                          <p className="text-[11px] text-white/40 truncate">{order.customerEmail}</p>
                        </div>
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4">
                        <div className="min-w-0 max-w-[160px]">
                          <span className="font-semibold text-white/90">{totalItemsQty} pcs</span>
                          <p className="text-[11px] text-white/40 truncate">
                            {firstItemName}
                            {extraItemsCount > 0 ? ` +${extraItemsCount} more` : ''}
                          </p>
                        </div>
                      </td>

                      {/* Grand Total */}
                      <td className="py-3.5 px-4">
                        <span className="font-serif font-bold text-sm text-[#F8F4EC]">
                          ₹{order.grandTotal.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${paymentMethodBadge.bgClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${paymentMethodBadge.dotClass}`} />
                          {paymentMethodBadge.detail}
                        </span>
                      </td>

                      {/* Payment Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${paymentBadge.bgClass}`}
                        >
                          <PaymentIcon className="w-3 h-3" />
                          {paymentBadge.label}
                        </span>
                      </td>

                      {/* Order Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${orderBadge.bgClass}`}
                        >
                          <OrderIcon className="w-3 h-3" />
                          {orderBadge.label}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4">
                        <span className="text-white/60 text-xs">{formattedDate}</span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(order);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-[#D6B878] border border-white/10 transition-colors text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {orders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-5 py-4 border-t border-white/10 bg-white/[0.01]">
            <div className="flex items-center gap-4 text-xs text-white/50">
              <span>
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} orders
              </span>

              {/* Page size selector */}
              <div className="flex items-center gap-1.5">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-[#180F20] border border-white/10 rounded-lg px-2 py-1 text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 cursor-pointer"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || isLoading}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-[#D6B878]">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || isLoading}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Order Detail Modal */}
      <AdminOrderDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        order={selectedOrder}
        onOrderUpdated={(updatedOrder) => {
          setSelectedOrder(updatedOrder);
          loadOrders(pagination.page);
        }}
      />
    </div>
  );
};
