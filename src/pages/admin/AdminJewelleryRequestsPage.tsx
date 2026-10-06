import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import {
  Search,
  Sparkles,
  Refresh,
  Clock,
  Alert,
  TickCircle,
  XCircle2,
  Eye,
  Send,
  Diamonds,
  Inbox,
  Image as ImageIcon,
} from 'reicon-react';
import {
  JewelleryRequestDetailModal,
  type AdminJewelleryRequest,
} from '../../components/admin/JewelleryRequestDetailModal';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../../lib/image';

export const AdminJewelleryRequestsPage: React.FC = () => {
  const { getToken } = useAuth();

  const [requests, setRequests] = useState<AdminJewelleryRequest[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    underReview: 0,
    quoteSent: 0,
    notSourceable: 0,
    active: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal inspection
  const [selectedRequest, setSelectedRequest] = useState<AdminJewelleryRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Requests from GET /api/admin/jewellery-requests
  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Unauthorized. Please sign in as an admin.');
      }

      const queryParams = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        queryParams.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        queryParams.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/admin/jewellery-requests?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch requests (HTTP ${res.status})`);
      }

      const data = await res.json();
      setRequests(data.requests || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      console.error('Error fetching admin jewellery requests:', err);
      setError(err.message || 'Unable to connect to the Admin Jewellery Requests API');
    } finally {
      setIsLoading(false);
    }
  }, [getToken, statusFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300">
            <Clock className="w-3 h-3 text-amber-400" />
            Pending Review
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-500/15 border border-blue-500/30 text-blue-300">
            <Sparkles className="w-3 h-3 text-blue-400" />
            Under Review
          </span>
        );
      case 'QUOTE_SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-500/15 border border-purple-500/30 text-purple-300">
            <Send className="w-3 h-3 text-purple-400" />
            QuoteDown Sent
          </span>
        );
      case 'NOT_SOURCEABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-500/15 border border-red-500/30 text-red-300">
            <XCircle2 className="w-3 h-3 text-red-400" />
            Not Sourceable
          </span>
        );
      case 'ADVANCE_PAID':
      case 'SOURCING_IN_PROGRESS':
      case 'PRODUCT_RECEIVED':
      case 'BALANCE_PAID':
      case 'SHIPPED':
      case 'DELIVERED':
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
            <TickCircle className="w-3 h-3 text-emerald-400" />
            {status.replace(/_/g, ' ')}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-zinc-500/15 border border-zinc-500/30 text-zinc-400">
            <XCircle2 className="w-3 h-3 text-zinc-400" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/10 text-white/70">
            {status}
          </span>
        );
    }
  };

  // Status update handler
  const handleStatusUpdate = async (requestId: string, newStatus: string, adminNote?: string) => {
    const token = await getToken();
    if (!token) throw new Error('Unauthorized. Please sign in as an admin.');

    const res = await fetch(`/api/admin/jewellery-requests?id=${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: newStatus,
        adminNote: adminNote !== undefined ? adminNote : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed to update status (HTTP ${res.status})`);
    }

    // Update local state
    setRequests((prev) =>
      prev.map((item) => (item.id === requestId ? { ...item, ...data.request } : item))
    );
    if (selectedRequest && selectedRequest.id === requestId) {
      setSelectedRequest((prev) => (prev ? { ...prev, ...data.request } : null));
    }

    showToast(`Status successfully updated to ${newStatus.replace(/_/g, ' ')}`);
    fetchRequests();
  };

  // Note update handler
  const handleNoteUpdate = async (requestId: string, adminNote: string) => {
    const token = await getToken();
    if (!token) throw new Error('Unauthorized. Please sign in as an admin.');

    const res = await fetch(`/api/admin/jewellery-requests?id=${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ adminNote }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Failed to update admin note (HTTP ${res.status})`);
    }

    // Update local state
    setRequests((prev) =>
      prev.map((item) => (item.id === requestId ? { ...item, ...data.request } : item))
    );
    if (selectedRequest && selectedRequest.id === requestId) {
      setSelectedRequest((prev) => (prev ? { ...prev, ...data.request } : null));
    }

    showToast('Admin note saved successfully');
  };

  const handleOpenDetail = (req: AdminJewelleryRequest) => {
    setSelectedRequest(req);
    setIsDetailModalOpen(true);
  };

  const statusTabs = [
    { key: 'ALL', label: 'All Requests', count: stats.total },
    { key: 'PENDING', label: 'Pending Review', count: stats.pending },
    { key: 'UNDER_REVIEW', label: 'Under Review', count: stats.underReview },
    { key: 'QUOTE_SENT', label: 'QuoteDown Sent', count: stats.quoteSent },
    { key: 'NOT_SOURCEABLE', label: 'Not Sourceable', count: stats.notSourceable },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold tracking-wide border transition-all animate-in fade-in slide-in-from-bottom-5 ${
            toastMessage.type === 'error'
              ? 'bg-red-950/90 border-red-500/50 text-red-200'
              : 'bg-[#180F20] border-[#D6B878]/60 text-[#FFE3C7]'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <Alert className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <TickCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#1E0D25] via-[#140B1A] to-[#1E0D25] p-6 rounded-2xl border border-[#D6B878]/25 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#D6B878]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest bg-[#40000D] border border-[#D6B878]/30 text-[#D6B878]">
              Concierge Sourcing
            </span>
            <span className="text-white/40 text-xs">•</span>
            <span className="text-xs text-[#D6B878] font-medium flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Request Dashboard
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#F8F4EC] tracking-tight">
            Jewellery Sourcing Requests
          </h1>
          <p className="text-xs sm:text-sm text-[#EDE4D5]/70 mt-1 max-w-xl">
            Inspect customer jewellery design requests, review inspiration photographs, assess procurement feasibility, and manage sourcing decisions.
          </p>
        </div>

        <button
          onClick={fetchRequests}
          disabled={isLoading}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#EDE4D5] border border-white/10 transition active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Refresh className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-[#180F20]/80 border border-white/10 shadow-sm">
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Total Requests</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold font-serif text-[#F8F4EC]">{stats.total}</span>
            <Diamonds className="w-4 h-4 text-white/30" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#180F20]/80 border border-amber-500/20 shadow-sm">
          <p className="text-[11px] font-medium text-amber-300/70 uppercase tracking-wider">Pending Review</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold font-serif text-amber-300">{stats.pending}</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#180F20]/80 border border-blue-500/20 shadow-sm">
          <p className="text-[11px] font-medium text-blue-300/70 uppercase tracking-wider">Under Review</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold font-serif text-blue-300">{stats.underReview}</span>
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#180F20]/80 border border-purple-500/20 shadow-sm">
          <p className="text-[11px] font-medium text-purple-300/70 uppercase tracking-wider">QuoteDown Sent</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold font-serif text-purple-300">{stats.quoteSent}</span>
            <Send className="w-4 h-4 text-purple-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#180F20]/80 border border-red-500/20 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[11px] font-medium text-red-300/70 uppercase tracking-wider">Not Sourceable</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold font-serif text-red-300">{stats.notSourceable}</span>
            <XCircle2 className="w-4 h-4 text-red-400" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                statusFilter === tab.key
                  ? 'bg-gradient-to-r from-[#40000D] to-[#2A0008] text-[#FFE3C7] border border-[#D6B878]/50 shadow-md'
                  : 'bg-[#180F20] text-white/60 hover:text-white hover:bg-white/5 border border-white/10'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  statusFilter === tab.key
                    ? 'bg-[#D6B878]/20 text-[#FFE3C7]'
                    : 'bg-white/10 text-white/40'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by Request #, Customer Email, Phone, Jewellery Type, Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#180F20] border border-white/10 rounded-xl text-xs sm:text-sm text-[#F8F4EC] placeholder:text-white/30 focus:outline-none focus:border-[#D6B878]/60 transition"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Alert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchRequests}
            className="px-3 py-1 rounded-lg bg-red-900/50 hover:bg-red-900 border border-red-500/30 text-white font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table & List View */}
      <div className="bg-[#180F20] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Refresh className="w-6 h-6 animate-spin text-[#D6B878]" />
            <p className="text-xs text-white/50 tracking-wider uppercase font-medium">
              Loading Jewellery Sourcing Requests...
            </p>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
              <Inbox className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#F8F4EC]">No Jewellery Requests Found</h3>
            <p className="text-xs text-white/50 max-w-sm">
              {searchQuery || statusFilter !== 'ALL'
                ? 'No requests match your current filters. Try changing or clearing your search criteria.'
                : 'There are currently no customer jewellery sourcing requests in the system.'}
            </p>
            {(searchQuery || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="mt-2 text-xs font-semibold text-[#D6B878] hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#140B1A]/70 text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Request #</th>
                  <th className="py-3.5 px-4">Preview & Item</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Budget & Qty</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-[#EDE4D5]">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => handleOpenDetail(req)}
                  >
                    {/* Request Number */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#D6B878] bg-[#D6B878]/10 px-2 py-0.5 rounded border border-[#D6B878]/20 text-[11px]">
                          {req.requestNumber}
                        </span>
                      </div>
                    </td>

                    {/* Preview & Item Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3 min-w-[200px] max-w-[280px]">
                        <div className="w-11 h-11 rounded-lg bg-[#0F0814] border border-white/10 overflow-hidden shrink-0 relative group-hover:border-[#D6B878]/40 transition">
                          {req.inspirationImageUrl ? (
                            <img
                              src={getOptimizedImageUrl(req.inspirationImageUrl, IMAGE_PRESETS.THUMB_SM)}
                              alt={req.jewelleryType}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#F8F4EC] truncate">{req.jewelleryType}</p>
                          <p className="text-[11px] text-white/50 line-clamp-1 mt-0.5">
                            {req.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Customer Info */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-[#F8F4EC] truncate max-w-[150px]">
                          {req.customerEmail || 'Customer'}
                        </span>
                        <span className="text-[10px] text-white/40 font-mono">{req.phone}</span>
                      </div>
                    </td>

                    {/* Budget & Quantity */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#F8F4EC]">
                          {req.budget ? `₹${req.budget.toLocaleString('en-IN')}` : 'Flexible'}
                        </span>
                        <span className="text-[10px] text-white/40">Qty: {req.quantity}</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderStatusBadge(req.status)}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-white/50 text-[11px]">
                      {new Date(req.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(req);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#D6B878]/20 text-[#EDE4D5] hover:text-[#FFE3C7] border border-white/10 hover:border-[#D6B878]/40 transition text-xs font-semibold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D6B878]" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Inspection Modal */}
      <JewelleryRequestDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRequest(null);
        }}
        request={selectedRequest}
        onStatusUpdate={handleStatusUpdate}
        onNoteUpdate={handleNoteUpdate}
      />
    </div>
  );
};
