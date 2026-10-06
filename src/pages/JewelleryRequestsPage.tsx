import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, SignInButton } from '@clerk/react';
import {
  Sparkles,
  Refresh,
  Eye,
  Alert,
  Plus,
  Login,
  Package,
  Calendar,
  Layers,
  ArrowRight,
} from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { Button } from '../components/ui/Button';
import { getOptimizedImageUrl, IMAGE_PRESETS } from '../lib/image';
import {
  CustomerRequestDetailModal,
  type CustomerJewelleryRequest,
} from '../components/request/CustomerRequestDetailModal';
import { getStatusBadgeInfo } from '../lib/jewellery-request-status';

export const JewelleryRequestsPage: React.FC = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  const [requests, setRequests] = useState<CustomerJewelleryRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal inspection
  const [selectedRequest, setSelectedRequest] = useState<CustomerJewelleryRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Fetch Requests from GET /api/jewellery-requests
  const fetchRequests = useCallback(async () => {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/jewellery-requests', {
        headers,
      });

      if (res.status === 401) {
        throw new Error('Please sign in to view your jewellery requests.');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch requests (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
      } else {
        setRequests([]);
      }
    } catch (err: any) {
      console.error('Error fetching customer jewellery requests:', err);
      setError("We couldn't load your jewellery requests. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (isLoaded) {
      fetchRequests();
    }
  }, [isLoaded, fetchRequests]);

  const handleOpenDetail = (req: CustomerJewelleryRequest) => {
    setSelectedRequest(req);
    setIsDetailModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <StorefrontLayout>
      <main className="bg-[#FFFDF8] min-h-[75vh] py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Page Heading & Header Description */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E8C98A]/30">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#8C6C38] font-bold">
                <Sparkles size={14} />
                <span>ALONGKAR ATELIER SERVICES</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#28040B] tracking-tight">
                Jewellery Requests
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 max-w-2xl leading-relaxed">
                Track the progress and sourcing status of your custom jewellery requests.
              </p>
            </div>

            {/* Quick Action Button */}
            {isSignedIn && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={fetchRequests}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF6F0] text-gray-700 text-xs font-semibold border border-[#E8C98A]/40 transition shadow-2xs cursor-pointer disabled:opacity-50"
                  aria-label="Refresh requests"
                >
                  <Refresh
                    size={14}
                    className={`text-[#8C6C38] ${isLoading ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">Refresh</span>
                </button>

                <Link to="/request-jewellery">
                  <Button
                    variant="gold"
                    size="sm"
                    className="gap-2 text-xs shadow-xs cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>NEW REQUEST</span>
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Unauthenticated View */}
          {isLoaded && !isSignedIn && (
            <div className="max-w-xl mx-auto py-16 px-6 text-center rounded-2xl bg-white border border-[#E8C98A]/40 shadow-sm space-y-5">
              <div className="w-14 h-14 bg-[#E8C98A]/20 rounded-full flex items-center justify-center mx-auto text-[#8C6C38]">
                <Login size={26} />
              </div>
              <div className="space-y-2">
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#28040B]">
                  Sign In to Track Your Requests
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                  Please log in with your Alongkar customer account to view your custom jewellery submissions, quotation progress, and sourcing status.
                </p>
              </div>
              <div className="pt-2">
                <SignInButton mode="modal">
                  <Button variant="gold" size="md" className="gap-2 cursor-pointer shadow-sm">
                    <Login size={16} />
                    <span>SIGN IN TO YOUR ACCOUNT</span>
                  </Button>
                </SignInButton>
              </div>
            </div>
          )}

          {/* Authenticated Content Area */}
          {isSignedIn && (
            <div className="space-y-6">
              {/* Error State Banner */}
              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Alert size={18} className="text-red-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchRequests}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition cursor-pointer shrink-0"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Loading State: Skeletons */}
              {isLoading && (
                <div className="bg-white border border-[#E8C98A]/30 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-16 bg-[#FAF6F0]/80 rounded-xl animate-pulse border border-[#E8C98A]/20"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && !error && requests.length === 0 && (
                <div className="max-w-xl mx-auto py-16 px-6 text-center rounded-2xl bg-white border border-[#E8C98A]/40 shadow-sm space-y-6">
                  <div className="w-16 h-16 bg-[#E8C98A]/20 rounded-full flex items-center justify-center mx-auto text-[#8C6C38]">
                    <Sparkles size={30} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-serif text-2xl font-bold text-[#28040B]">
                      No Jewellery Requests Yet
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                      You haven't submitted any custom jewellery requests yet.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link to="/request-jewellery">
                      <Button variant="gold" size="md" className="gap-2 cursor-pointer shadow-sm">
                        <Plus size={16} />
                        <span>REQUEST JEWELLERY</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Customer Jewellery Requests Table */}
              {!isLoading && !error && requests.length > 0 && (
                <div className="bg-white border border-[#E8C98A]/40 rounded-2xl overflow-hidden shadow-sm">
                  {/* Table Header Section Title */}
                  <div className="px-6 py-4 border-b border-[#E8C98A]/30 bg-gradient-to-r from-[#FAF6F0] to-[#FFFDF8] flex items-center justify-between">
                    <div>
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-[#28040B]">
                        Your Jewellery Requests
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Showing {requests.length} custom design request
                        {requests.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Desktop & Tablet Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E8C98A]/20 bg-[#FAF6F0]/60 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                          <th className="py-4 px-4 text-center w-16">Sl. No.</th>
                          <th className="py-4 px-4 min-w-[240px]">Jewellery</th>
                          <th className="py-4 px-4 min-w-[140px]">Category</th>
                          <th className="py-4 px-4 whitespace-nowrap min-w-[130px]">Requested On</th>
                          <th className="py-4 px-4 whitespace-nowrap min-w-[140px]">Status</th>
                          <th className="py-4 px-4 text-right min-w-[100px]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8C98A]/15 text-xs text-[#211A17]">
                        {requests.map((req, index) => {
                          const statusInfo = getStatusBadgeInfo(req.status);
                          const StatusIcon = statusInfo.icon;
                          const serialNumber = index + 1;

                          return (
                            <tr
                              key={req.id}
                              className="hover:bg-[#FAF6F0]/50 transition-colors group cursor-pointer"
                              onClick={() => handleOpenDetail(req)}
                            >
                              {/* 1. Sl. No. */}
                              <td className="py-4 px-4 text-center font-serif font-bold text-gray-500">
                                {serialNumber}
                              </td>

                              {/* 2. Jewellery (Name / Description preview + optional thumbnail) */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  {req.inspirationImageUrl ? (
                                    <div className="w-11 h-11 rounded-lg bg-[#FAF6F0] border border-[#E8C98A]/30 overflow-hidden shrink-0 shadow-2xs group-hover:border-[#8C6C38] transition">
                                      <img
                                        src={getOptimizedImageUrl(req.inspirationImageUrl, IMAGE_PRESETS.THUMB_SM)}
                                        alt={req.jewelleryType}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-11 h-11 rounded-lg bg-[#FAF6F0] border border-[#E8C98A]/30 flex items-center justify-center text-[#8C6C38] shrink-0">
                                      <Package size={18} />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-serif font-bold text-sm text-[#28040B] truncate group-hover:text-[#8C6C38] transition-colors">
                                      {req.description.length > 55
                                        ? `${req.description.slice(0, 55)}...`
                                        : req.description}
                                    </p>
                                    <span className="text-[11px] font-mono text-gray-500 block mt-0.5">
                                      {req.requestNumber}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* 3. Category */}
                              <td className="py-4 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#E8C98A]/30 text-xs font-semibold text-[#28040B]">
                                  <Layers size={12} className="text-[#8C6C38]" />
                                  {req.jewelleryType}
                                </span>
                              </td>

                              {/* 4. Requested On */}
                              <td className="py-4 px-4 whitespace-nowrap text-gray-600 font-medium">
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={13} className="text-gray-400" />
                                  <span>{formatDate(req.createdAt)}</span>
                                </div>
                              </td>

                              {/* 5. Status Badge */}
                              <td className="py-4 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bgClass}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`}
                                  />
                                  <StatusIcon size={12} />
                                  <span>{statusInfo.label}</span>
                                </span>
                              </td>

                              {/* 6. Action */}
                              <td className="py-4 px-4 whitespace-nowrap text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDetail(req);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#28040B] text-[#28040B] hover:text-[#FFE3C7] border border-[#E8C98A]/60 hover:border-[#28040B] text-xs font-semibold transition-all duration-150 shadow-2xs cursor-pointer"
                                  aria-label={`View details for request ${req.requestNumber}`}
                                >
                                  <Eye size={13} className="text-[#8C6C38] group-hover:text-[#FFE3C7]" />
                                  <span>View</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View (Optimized for small screens) */}
                  <div className="md:hidden divide-y divide-[#E8C98A]/20">
                    {requests.map((req, index) => {
                      const statusInfo = getStatusBadgeInfo(req.status);
                      const StatusIcon = statusInfo.icon;
                      const serialNumber = index + 1;

                      return (
                        <div
                          key={req.id}
                          onClick={() => handleOpenDetail(req)}
                          className="p-4 space-y-3 hover:bg-[#FAF6F0]/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-[#FAF6F0] border border-[#E8C98A]/40 flex items-center justify-center font-serif text-xs font-bold text-gray-600">
                                {serialNumber}
                              </span>
                              <span className="font-mono text-xs font-semibold text-gray-500">
                                {req.requestNumber}
                              </span>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.bgClass}`}
                            >
                              <StatusIcon size={11} />
                              <span>{statusInfo.label}</span>
                            </span>
                          </div>

                          <div className="flex items-start gap-3">
                            {req.inspirationImageUrl ? (
                              <div className="w-14 h-14 rounded-lg bg-[#FAF6F0] border border-[#E8C98A]/30 overflow-hidden shrink-0">
                                <img
                                  src={req.inspirationImageUrl}
                                  alt={req.jewelleryType}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : null}

                            <div className="flex-1 min-w-0">
                              <p className="font-serif font-bold text-sm text-[#28040B] line-clamp-2">
                                {req.description}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500">
                                <span className="inline-flex items-center gap-1 font-semibold text-[#8C6C38]">
                                  <Layers size={11} />
                                  {req.jewelleryType}
                                </span>
                                <span>•</span>
                                <span>{formatDate(req.createdAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(req);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C6C38] hover:text-[#28040B] transition"
                            >
                              <span>View Details</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Customer Request Detail Modal */}
      <CustomerRequestDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedRequest(null);
        }}
        request={selectedRequest}
      />
    </StorefrontLayout>
  );
};
