import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  Users,
  Search,
  Refresh,
  ShoppingBag,
  Sparkles,
  TickCircle,
  Eye,
  Copy,
  Check,
  Filter,
  XCircle2,
  ChevronLeft,
  ChevronRight,
  Alert,
  Chart3,
} from 'reicon-react';
import type {
  AdminCustomerSummary,
  AdminCustomerKPISummary,
  AdminCustomerPagination,
} from '../../types';
import { fetchAdminCustomers } from '../../services/customerApi';
import { AdminCustomerDetailModal } from '../../components/admin/AdminCustomerDetailModal';
import { AdminCustomerAnalyticsView } from '../../components/admin/AdminCustomerAnalyticsView';
import { AdminCustomerSegmentsView } from '../../components/admin/AdminCustomerSegmentsView';

export const AdminCustomersPage: React.FC = () => {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const currentView: 'directory' | 'analytics' | 'segments' =
    viewParam === 'segments'
      ? 'segments'
      : viewParam === 'analytics'
      ? 'analytics'
      : 'directory';
  const activeRequestIdRef = useRef(0);

  const [customers, setCustomers] = useState<AdminCustomerSummary[]>([]);
  const [summary, setSummary] = useState<AdminCustomerKPISummary>({
    totalCustomers: 0,
    customersWithOrders: 0,
    totalRepeatCustomers: 0,
    customersWithCustomRequests: 0,
    totalGrossOrderValue: 0,
    totalRealizedSpend: 0,
  });
  const [pagination, setPagination] = useState<AdminCustomerPagination>({
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
  const [orderFilter, setOrderFilter] = useState<'all' | 'with_orders' | 'repeat_buyers' | 'custom_requests'>('all');
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'most_orders' | 'highest_gross_spend' | 'highest_realized_spend'
  >('newest');
  const [pageSize, setPageSize] = useState(20);

  // Detail Modal inspection
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
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

  // Fetch Customers from GET /api/admin/customers
  const loadCustomers = useCallback(
    async (pageToLoad: number = 1) => {
      const requestId = ++activeRequestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Unauthorized. Please sign in as an admin.');
        }

        const data = await fetchAdminCustomers(token, {
          page: pageToLoad,
          limit: pageSize,
          search: debouncedSearch,
          orderFilter,
          sortBy,
        });

        if (requestId !== activeRequestIdRef.current) return;

        setCustomers(data.customers);
        setPagination(data.pagination);
        if (data.summary) {
          setSummary(data.summary);
        }
      } catch (err: any) {
        if (requestId !== activeRequestIdRef.current) return;
        console.error('Error fetching admin customers:', err);
        setError(err.message || 'Unable to load customers. Please try again.');
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [getToken, pageSize, orderFilter, sortBy, debouncedSearch]
  );

  // Reload when filters, search, or page size changes (resets to page 1)
  useEffect(() => {
    if (currentView === 'directory') {
      loadCustomers(1);
    }
  }, [loadCustomers, currentView]);

  // Auto-refresh when window tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentView === 'directory') {
        loadCustomers(pagination.page);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadCustomers, pagination.page, currentView]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadCustomers(newPage);
    }
  };

  const hasActiveFilters = useMemo(() => {
    return (
      orderFilter !== 'all' ||
      sortBy !== 'newest' ||
      debouncedSearch.trim().length > 0
    );
  }, [orderFilter, sortBy, debouncedSearch]);

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setOrderFilter('all');
    setSortBy('newest');
  };

  const handleOpenDetail = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIsDetailModalOpen(true);
  };

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#F8F4EC] tracking-wide flex items-center gap-2.5">
            {currentView === 'segments' ? (
              <>
                <Filter className="w-7 h-7 text-[#D6B878]" />
                Customer Segmentation
              </>
            ) : currentView === 'analytics' ? (
              <>
                <Chart3 className="w-7 h-7 text-[#D6B878]" />
                Customer Analytics & Insights
              </>
            ) : (
              <>
                <Users className="w-7 h-7 text-[#D6B878]" />
                Customers Directory
              </>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-white/50 mt-1">
            {currentView === 'segments'
              ? 'Targeted customer cohorts across acquisition recency, purchase counts, high-value spend, and custom requests.'
              : currentView === 'analytics'
              ? 'Aggregated retention metrics, repeat buyer rates, and acquisition trends.'
              : 'Read-only registry of all customer accounts, transaction histories, and bespoke requests.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Switcher Tabs */}
          <div className="inline-flex p-1 bg-[#140B1A] border border-[#D6B878]/20 rounded-xl">
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'directory'
                  ? 'bg-[#B08D57] text-[#140B1A] shadow-sm font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Directory</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ view: 'analytics' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'analytics'
                  ? 'bg-[#B08D57] text-[#140B1A] shadow-sm font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Chart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ view: 'segments' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'segments'
                  ? 'bg-[#B08D57] text-[#140B1A] shadow-sm font-bold'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Segments</span>
            </button>
          </div>

          {currentView === 'directory' && (
            <button
              onClick={() => loadCustomers(pagination.page)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#140B1A] border border-[#D6B878]/30 hover:border-[#D6B878]/60 text-xs font-semibold text-[#EDE4D5] hover:text-white transition-all disabled:opacity-50"
              title="Refresh customer records"
            >
              <Refresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {currentView === 'segments' ? (
        <AdminCustomerSegmentsView
          onOpenCustomerDetail={handleOpenDetail}
          onNavigateToDirectory={() => setSearchParams({})}
        />
      ) : currentView === 'analytics' ? (
        <AdminCustomerAnalyticsView onNavigateToDirectory={() => setSearchParams({})} />
      ) : (
        <>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Total Registered Customers */}
        <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-[#D6B878]/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">
              Total Registered Customers
            </span>
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#D6B878]">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-[#F8F4EC]">{summary.totalCustomers}</p>
          <span className="text-[10px] text-white/40 mt-1">Includes all registered accounts</span>
        </div>

        {/* Customers With Orders */}
        <div className="bg-[#140B1A] border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400/80">
              Customers With Orders
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-blue-300">{summary.customersWithOrders}</p>
          <span className="text-[10px] text-blue-400/60 mt-1">Accounts with ≥1 order placed</span>
        </div>

        {/* Repeat Buyers */}
        <div className="bg-[#140B1A] border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/80">
              Repeat Buyers
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TickCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-emerald-300">{summary.totalRepeatCustomers}</p>
          <span className="text-[10px] text-emerald-400/60 mt-1">Accounts with ≥2 orders</span>
        </div>

        {/* Customers With Jewellery Requests */}
        <div className="bg-[#140B1A] border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400/80">
              Customers With Jewellery Requests
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif text-2xl font-bold text-purple-300">{summary.customersWithCustomRequests}</p>
          <span className="text-[10px] text-purple-400/60 mt-1">Accounts with bespoke requests</span>
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
              placeholder="Search name, email, phone, or Clerk ID..."
              className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-[#EDE4D5] placeholder:text-white/30 focus:outline-none focus:border-[#D6B878]/60 transition-colors"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                title="Clear search"
              >
                <XCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Customer Activity Filter */}
          <div>
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value="all">All Registered Customers</option>
              <option value="with_orders">Customers With Orders</option>
              <option value="repeat_buyers">Repeat Buyers (≥2 Orders)</option>
              <option value="custom_requests">With Custom Requests</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="most_orders">Sort: Most Orders</option>
              <option value="highest_gross_spend">Sort: Highest Gross Spend</option>
              <option value="highest_realized_spend">Sort: Highest Realized Spend</option>
            </select>
          </div>

          {/* Page Size */}
          <div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#180F20] border border-white/10 rounded-xl text-xs text-[#EDE4D5] focus:outline-none focus:border-[#D6B878]/60 transition-colors cursor-pointer"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-white/40 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#D6B878]" />
              Active customer query filters applied
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

      {/* Customers Table Container */}
      <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <Alert className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-base font-semibold text-rose-300">{error}</h3>
            <button
              type="button"
              onClick={() => loadCustomers(pagination.page)}
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
        ) : customers.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878] mx-auto">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#F8F4EC]">No Customers Found</h3>
            <p className="text-xs text-white/50 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No customer records match your active search and filter criteria.'
                : 'There are no registered customers in the database yet.'}
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
            <table className="w-full text-left text-xs">
              <thead className="bg-[#180F20] text-white/40 uppercase tracking-wider font-bold text-[10px] border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4">Gross Value</th>
                  <th className="py-3 px-4">Realized Spend</th>
                  <th className="py-3 px-4 text-center">Requests</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {customers.map((c) => {
                  const hasOrders = c.totalOrders > 0;
                  const isRepeat = c.repeatBuyer;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleOpenDetail(c.id)}
                      className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      {/* Customer Name */}
                      <td className="py-3.5 px-4">
                        <div className="min-w-0 max-w-[200px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-white/95 truncate">
                              {c.displayName || <span className="text-white/40 italic">Unspecified</span>}
                            </span>
                            {!hasOrders && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-white/5 text-white/50 border border-white/10 whitespace-nowrap">
                                New Account
                              </span>
                            )}
                            {isRepeat && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#B08D57]/20 text-[#D6B878] border border-[#D6B878]/40 whitespace-nowrap">
                                Repeat
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-white/30 font-mono truncate block">
                            ID: {c.id.slice(0, 10)}...
                          </span>
                        </div>
                      </td>

                      {/* Registered Email */}
                      <td className="py-3.5 px-4">
                        <div className="min-w-0 max-w-[200px] flex items-center gap-1.5">
                          <span className="text-white/80 truncate">
                            {c.registeredEmail || <span className="text-white/30 italic">No email</span>}
                          </span>
                          {c.registeredEmail && (
                            <button
                              type="button"
                              onClick={(e) => handleCopy(c.registeredEmail!, `em_${c.id}`, e)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/40 hover:text-white transition-opacity shrink-0"
                              title="Copy email"
                            >
                              {copiedId === `em_${c.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-white/70">
                          {c.phone || <span className="text-white/30 italic">—</span>}
                        </span>
                      </td>

                      {/* Total Orders */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            hasOrders
                              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                              : 'bg-white/5 text-white/40 border border-white/5'
                          }`}
                        >
                          {c.totalOrders}
                        </span>
                      </td>

                      {/* Gross Order Value */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-serif font-bold text-sm text-[#F8F4EC]">
                          ₹{c.grossOrderValue.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Realized Spend */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`font-serif font-bold text-sm ${
                            c.realizedSpend > 0 ? 'text-emerald-300' : 'text-white/40'
                          }`}
                        >
                          ₹{c.realizedSpend.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Jewellery Requests */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {c.customRequestsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <Sparkles className="w-3 h-3" />
                            {c.customRequestsCount}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-white/50 text-[11px]">
                        {formatDate(c.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(c.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#D6B878]/40 text-xs font-semibold text-white/80 hover:text-white transition-all"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#D6B878]" />
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

        {/* Pagination Bar */}
        {!error && customers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 bg-[#180F20] border-t border-white/10 text-xs text-white/60">
            <div>
              Showing page <span className="font-semibold text-white">{pagination.page}</span> of{' '}
              <span className="font-semibold text-white">{pagination.totalPages}</span> (
              <span className="font-semibold text-[#D6B878]">{pagination.total}</span> total customers)
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || isLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="px-2 font-mono text-xs text-white/40">
                {pagination.page} / {pagination.totalPages}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || isLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {/* Detail Modal */}
      <AdminCustomerDetailModal
        key={selectedCustomerId || 'none'}
        isOpen={isDetailModalOpen}
        customerId={selectedCustomerId}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedCustomerId(null);
        }}
      />
    </div>
  );
};
