import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Calendar,
  Clock,
  MoneySend,
  Star,
} from 'reicon-react';
import type {
  CustomerSegmentId,
  CustomerSegmentSortOption,
  AdminCustomerSegmentMeta,
  AdminCustomerSegmentMember,
  AdminCustomerSegmentsResponse,
} from '../../types';
import { fetchAdminCustomerSegments } from '../../services/customerApi';

interface AdminCustomerSegmentsViewProps {
  onOpenCustomerDetail: (customerId: string) => void;
  onNavigateToDirectory?: () => void;
}

export const AdminCustomerSegmentsView: React.FC<AdminCustomerSegmentsViewProps> = ({
  onOpenCustomerDetail,
}) => {
  const { getToken } = useAuth();
  const activeRequestIdRef = useRef(0);

  const [selectedSegment, setSelectedSegment] = useState<CustomerSegmentId>('new_customers');
  const [segments, setSegments] = useState<AdminCustomerSegmentMeta[]>([]);
  const [customers, setCustomers] = useState<AdminCustomerSegmentMember[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSegmentSortOption>('newest');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadSegmentData = useCallback(
    async (pageToLoad: number = 1) => {
      const requestId = ++activeRequestIdRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Unauthorized. Please sign in as an admin.');
        }

        const data: AdminCustomerSegmentsResponse = await fetchAdminCustomerSegments(token, {
          segment: selectedSegment,
          page: pageToLoad,
          limit: 20,
          sortBy,
          search: debouncedSearch,
        });

        if (requestId !== activeRequestIdRef.current) return;

        setSegments(data.segments);
        setCustomers(data.customers);
        setPagination(data.pagination);
      } catch (err: any) {
        if (requestId !== activeRequestIdRef.current) return;
        console.error('Error fetching customer segments:', err);
        setError(err.message || 'Unable to load customer segments. Please try again.');
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [getToken, selectedSegment, sortBy, debouncedSearch]
  );

  // Reload on segment, sort, or search change
  useEffect(() => {
    loadSegmentData(1);
  }, [loadSegmentData]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadSegmentData(newPage);
    }
  };

  const handleSegmentSelect = (segmentId: CustomerSegmentId) => {
    if (segmentId !== selectedSegment) {
      setSelectedSegment(segmentId);
      setSearchInput('');
      setDebouncedSearch('');
      setSortBy('newest');
    }
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

  const activeSegmentMeta = segments.find((s) => s.id === selectedSegment) || {
    id: selectedSegment,
    label: 'Segment',
    definition: 'Loading segment definition...',
    purpose: '',
    customerCount: 0,
    thresholdBadge: '',
  };

  // Helper icons for segment cards
  const getSegmentIcon = (id: CustomerSegmentId) => {
    switch (id) {
      case 'new_customers':
        return <Calendar className="w-4 h-4 text-amber-400" />;
      case 'first_time_buyers':
        return <ShoppingBag className="w-4 h-4 text-blue-400" />;
      case 'repeat_buyers':
        return <TickCircle className="w-4 h-4 text-emerald-400" />;
      case 'high_value_customers':
        return <MoneySend className="w-4 h-4 text-[#D6B878]" />;
      case 'jewellery_request_customers':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'inactive_customers':
        return <Clock className="w-4 h-4 text-rose-400" />;
      default:
        return <Users className="w-4 h-4 text-white/60" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Segment Selector Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {segments.map((seg) => {
          const isActive = seg.id === selectedSegment;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => handleSegmentSelect(seg.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between relative overflow-hidden group ${
                isActive
                  ? 'bg-[#180F20] border-[#D6B878] shadow-lg shadow-[#D6B878]/10'
                  : 'bg-[#140B1A] border-[#D6B878]/20 hover:border-[#D6B878]/40 hover:bg-[#180F20]/60'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-[#D6B878] rounded-bl" />
              )}
              <div className="flex items-center justify-between gap-1 mb-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider line-clamp-1 ${
                    isActive ? 'text-[#D6B878]' : 'text-white/60'
                  }`}
                >
                  {seg.label}
                </span>
                <div className="p-1.5 rounded-lg bg-white/5">{getSegmentIcon(seg.id)}</div>
              </div>
              <div>
                <p className="font-serif text-xl font-bold text-[#F8F4EC]">{seg.customerCount}</p>
                <p className="text-[10px] text-white/40 mt-0.5 line-clamp-1">{seg.thresholdBadge}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Segment Detail Card */}
      <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg sm:text-xl font-bold text-[#F8F4EC] flex items-center gap-2">
              {getSegmentIcon(activeSegmentMeta.id)}
              <span>{activeSegmentMeta.label}</span>
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#D6B878]/10 text-[#D6B878] border border-[#D6B878]/30">
              {activeSegmentMeta.thresholdBadge}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-white/70 max-w-2xl">{activeSegmentMeta.definition}</p>
          {activeSegmentMeta.purpose && (
            <p className="text-[11px] text-[#D6B878]/80 italic">Purpose: {activeSegmentMeta.purpose}</p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => loadSegmentData(pagination.page)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 text-xs font-semibold text-white transition-all disabled:opacity-50"
            title="Refresh members in segment"
          >
            <Refresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Sort Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-3.5">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search within segment by email, name, or phone..."
            className="w-full bg-[#180F20] border border-white/10 focus:border-[#D6B878]/50 rounded-xl pl-9 pr-8 py-2 text-xs text-[#F8F4EC] placeholder-white/30 focus:outline-none transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <XCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="shrink-0 text-[11px]">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as CustomerSegmentSortOption)}
            className="bg-[#180F20] border border-white/10 focus:border-[#D6B878]/50 rounded-xl px-2.5 py-1.5 text-xs text-[#EDE4D5] focus:outline-none"
          >
            <option value="newest">Newest Registration</option>
            <option value="oldest">Oldest Registration</option>
            <option value="most_purchases">Most Purchases</option>
            <option value="highest_spend">Highest Lifetime Spend</option>
            <option value="last_purchased">Most Recent Purchase</option>
          </select>
        </div>
      </div>

      {/* Members Table Container */}
      <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl overflow-hidden shadow-xl">
        {error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
              <Alert className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-base font-semibold text-rose-300">{error}</h3>
            <button
              type="button"
              onClick={() => loadSegmentData(pagination.page)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="p-8 space-y-4">
            <div className="h-4 bg-white/5 rounded w-1/4 animate-pulse" />
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-base font-semibold text-white/80">No Customers in Segment</h3>
            <p className="text-xs text-white/40 max-w-md mx-auto">
              {debouncedSearch
                ? `No customers in "${activeSegmentMeta.label}" matched your search filter.`
                : `Currently, no customer accounts meet the criteria for ${activeSegmentMeta.label} (${activeSegmentMeta.thresholdBadge}).`}
            </p>
            {debouncedSearch && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-[#180F20] text-white/50 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-center">Purchases</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4">Last Purchase</th>
                  <th className="py-3 px-4">Cohort Badges</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {customers.map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => onOpenCustomerDetail(cust.id)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                  >
                    {/* Customer Identity */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-[#EDE4D5] group-hover:text-[#D6B878] transition-colors">
                          {cust.displayName || 'No Name Provided'}
                        </span>
                        <span className="text-[11px] text-white/50">{cust.registeredEmail || 'No email registered'}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[9px] text-white/30 truncate max-w-[120px]">
                            {cust.id}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(cust.id, cust.id, e)}
                            className="text-white/30 hover:text-white"
                            title="Copy customer ID"
                          >
                            {copiedId === cust.id ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-4 text-white/70">
                      {cust.phone ? (
                        <span className="font-mono text-xs">{cust.phone}</span>
                      ) : (
                        <span className="text-white/30 italic">None</span>
                      )}
                    </td>

                    {/* Registration Date */}
                    <td className="py-3.5 px-4 text-white/60 whitespace-nowrap">
                      {formatDate(cust.createdAt)}
                    </td>

                    {/* Qualifying Purchases Count */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          cust.qualifyingPurchasesCount >= 2
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : cust.qualifyingPurchasesCount === 1
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-white/5 text-white/40'
                        }`}
                      >
                        {cust.qualifyingPurchasesCount}
                      </span>
                    </td>

                    {/* Lifetime Spend */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-mono font-medium ${
                          cust.lifetimeGrossPurchaseValue >= 3000
                            ? 'text-[#D6B878] font-bold'
                            : cust.lifetimeGrossPurchaseValue > 0
                            ? 'text-white/80'
                            : 'text-white/30'
                        }`}
                      >
                        ₹{cust.lifetimeGrossPurchaseValue.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Last Purchase Date */}
                    <td className="py-3.5 px-4 text-white/60 whitespace-nowrap">
                      {cust.lastQualifyingPurchaseDate ? (
                        formatDate(cust.lastQualifyingPurchaseDate)
                      ) : (
                        <span className="text-white/30 italic">Never</span>
                      )}
                    </td>

                    {/* Overlapping Tags */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {cust.segmentTags.map((tag) => (
                          <span
                            key={tag}
                            className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${
                              tag === 'High-Value'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : tag === 'Repeat Buyer'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : tag === 'First-Time Buyer'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : tag === 'Jewellery Request'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                : tag === 'Inactive'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                : 'bg-white/5 text-white/60 border-white/10'
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCustomerDetail(cust.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-[#D6B878]/15 border border-white/10 hover:border-[#D6B878]/40 text-[11px] font-semibold text-[#EDE4D5] hover:text-[#D6B878] transition-all"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
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
              <span className="font-semibold text-[#D6B878]">{pagination.total}</span> customers in{' '}
              <span className="text-white font-medium">{activeSegmentMeta.label}</span>)
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

      {/* Business Rules and Financial Limitations Disclosure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="bg-[#140B1A] border border-[#D6B878]/15 rounded-2xl p-4 text-xs space-y-1.5">
          <h4 className="font-serif font-bold text-[#D6B878] flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5" />
            <span>High-Value & Inactivity Thresholds</span>
          </h4>
          <p className="text-white/60 leading-relaxed">
            <strong>High-Value Threshold (₹3,000):</strong> Classifies accounts whose lifetime gross spend on qualifying purchases meets or exceeds ₹3,000. Represents gross order value before full order refund deductions.
          </p>
          <p className="text-white/60 leading-relaxed">
            <strong>Inactivity Definition (90 Days):</strong> Requires $\ge 1$ lifetime qualifying purchase with no qualifying purchase placed in the last 90 days. Customers with 0 lifetime orders are strictly excluded. Does not imply permanent churn.
          </p>
        </div>

        <div className="bg-[#140B1A] border border-[#D6B878]/15 rounded-2xl p-4 text-xs space-y-1.5">
          <h4 className="font-serif font-bold text-[#D6B878] flex items-center gap-1.5">
            <TickCircle className="w-3.5 h-3.5" />
            <span>Qualifying Purchases & Overlaps</span>
          </h4>
          <p className="text-white/60 leading-relaxed">
            <strong>Qualifying Purchase Rule:</strong> Non-cancelled prepaid orders with status PAID, and non-cancelled COD orders with status DELIVERED. Cancelled, failed, abandoned, and unpaid orders are excluded.
          </p>
          <p className="text-white/60 leading-relaxed">
            <strong>Segment Overlaps:</strong> Customers may belong to multiple segments concurrently (e.g., a customer who registered 10 days ago and made their first purchase is both a New Customer and a First-Time Buyer).
          </p>
        </div>
      </div>
    </div>
  );
};
