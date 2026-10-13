import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import {
  Users,
  ShoppingBag,
  Sparkles,
  TickCircle,
  Refresh,
  Alert,
  Calendar,
} from 'reicon-react';
import type {
  AnalyticsTimeRange,
  AdminCustomerAnalyticsResponse,
} from '../../types';
import { fetchAdminCustomerAnalytics } from '../../services/customerApi';

interface AdminCustomerAnalyticsViewProps {
  onNavigateToDirectory?: () => void;
}

export const AdminCustomerAnalyticsView: React.FC<AdminCustomerAnalyticsViewProps> = ({
  onNavigateToDirectory,
}) => {
  const { getToken } = useAuth();
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('30d');
  const [data, setData] = useState<AdminCustomerAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ label: string; count: number } | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Unauthorized. Please sign in as an admin.');
      }
      const res = await fetchAdminCustomerAnalytics(token, { timeRange });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load customer analytics:', err);
      setError(err.message || 'Unable to load customer analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [getToken, timeRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const summary = data?.summary;
  const limitations = data?.limitations;
  const acquisitionTrend = data?.acquisitionTrend || [];
  const orderFreq = data?.orderFrequencyDistribution || [];
  const recency = data?.purchaseRecencyDistribution || [];
  const requests = data?.jewelleryRequestBreakdown || [];

  // Determine chart maximum for relative bar heights
  const maxAcquisitionCount = Math.max(1, ...acquisitionTrend.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Analytics Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#140B1A] border border-[#D6B878]/20">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#40000D] border border-[#D6B878]/30 flex items-center justify-center text-[#D6B878] shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#F8F4EC]">Analysis Period</h2>
            <p className="text-[11px] text-white/40">
              Aggregated across registered customer accounts & qualifying orders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Range Pills */}
          <div className="flex items-center p-1 rounded-xl bg-[#180F20] border border-white/10 text-xs">
            {(
              [
                { key: '30d', label: '30 Days' },
                { key: '90d', label: '90 Days' },
                { key: '1y', label: '1 Year' },
                { key: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTimeRange(opt.key)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  timeRange === opt.key
                    ? 'bg-[#40000D] border border-[#D6B878]/50 text-[#D6B878] shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadAnalytics}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-[#D6B878]/40 text-xs font-semibold text-white/80 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
            title="Refresh analytics data"
          >
            <Refresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D6B878]' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-12 text-center rounded-2xl bg-[#140B1A] border border-rose-500/20 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto">
            <Alert className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-base font-semibold text-rose-300">{error}</h3>
          <p className="text-xs text-white/50 max-w-md mx-auto">
            Unable to compute customer analytics aggregates. Please check server status or retry.
          </p>
          <button
            type="button"
            onClick={loadAnalytics}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : isLoading || !summary ? (
        /* Loading Skeletons */
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-28 bg-[#140B1A] border border-white/5 rounded-2xl" />
            ))}
          </div>
          <div className="h-64 bg-[#140B1A] border border-white/5 rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-60 bg-[#140B1A] border border-white/5 rounded-2xl" />
            <div className="h-60 bg-[#140B1A] border border-white/5 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* Section 1: Executive KPI Metrics Ribbon */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Core Customer & Financial Performance
              </span>
              <span className="text-[10px] text-[#D6B878] font-mono">
                Updated: {new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* Total Registered Customers */}
              <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-4 flex flex-col justify-between group hover:border-[#D6B878]/40 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">
                    Total Registered
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#D6B878]">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-[#F8F4EC]">
                    {summary.totalRegisteredCustomers.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                    <span>+{summary.newCustomersInPeriod} in selected period</span>
                  </p>
                </div>
              </div>

              {/* Lifetime Buyers (First-time vs Repeat) */}
              <div className="bg-[#140B1A] border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between group hover:border-blue-500/40 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400/80">
                    Qualifying Buyers
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-blue-300">
                    {summary.customersWithQualifyingPurchases.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-white/50 mt-1">
                    {summary.firstTimeBuyers} first-time • {summary.repeatBuyers} repeat
                  </p>
                </div>
              </div>

              {/* Lifetime Repeat Purchase Rate */}
              <div className="bg-[#140B1A] border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between group hover:border-emerald-500/40 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400/80">
                    Repeat Rate
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <TickCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-emerald-300">
                    {summary.repeatPurchaseRate}%
                  </p>
                  <p className="text-[10px] text-emerald-400/70 mt-1 truncate" title="Repeat buyers divided by customers with qualifying purchases">
                    {summary.repeatBuyers} / {summary.customersWithQualifyingPurchases} buying customers
                  </p>
                </div>
              </div>

              {/* Gross Average Order Value (Period) */}
              <div className="bg-[#140B1A] border border-[#D6B878]/30 rounded-2xl p-4 flex flex-col justify-between group hover:border-[#D6B878]/50 transition-all">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#D6B878]">
                    Gross AOV ({timeRange})
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-[#40000D] flex items-center justify-center text-[#D6B878]">
                    <span className="font-serif font-bold text-xs">₹</span>
                  </div>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-[#F8F4EC]">
                    {summary.grossAov !== null ? `₹${summary.grossAov.toLocaleString('en-IN')}` : '—'}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">
                    {summary.periodQualifyingOrdersCount} qualifying orders
                  </p>
                </div>
              </div>

              {/* Realized Cash Spend vs GOV (Period) */}
              <div className="bg-[#140B1A] border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between group hover:border-purple-500/40 transition-all col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400/80">
                    Realized Spend
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-300">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="font-serif text-2xl font-bold text-purple-300">
                    ₹{summary.realizedSpend.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">
                    GOV: ₹{summary.grossOrderValue.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Customer Acquisition Trends Chart */}
          <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-[#F8F4EC] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#D6B878]" />
                  Customer Acquisition Trend ({timeRange})
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  New customer accounts registered in Alongkar Atelier over time
                </p>
              </div>

              <div className="text-xs text-right">
                <span className="text-white/40">Total in period: </span>
                <span className="font-bold text-[#D6B878]">{summary.newCustomersInPeriod} registrations</span>
              </div>
            </div>

            {/* Custom Zero-Dependency SVG Bar Chart */}
            {acquisitionTrend.length === 0 || summary.newCustomersInPeriod === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-xl space-y-2">
                <Users className="w-6 h-6 text-white/30" />
                <p className="text-xs text-white/60">No new customer registrations in the selected time range.</p>
                <p className="text-[11px] text-white/40">Try switching to &quot;1 Year&quot; or &quot;All Time&quot;.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active Tooltip Banner */}
                <div className="h-6 text-xs text-white/70 flex items-center justify-between px-2">
                  {activeTooltip ? (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#D6B878]" />
                      <span className="font-medium text-white">{activeTooltip.label}:</span>
                      <span className="font-bold text-[#D6B878]">{activeTooltip.count} signups</span>
                    </span>
                  ) : (
                    <span className="text-white/40 text-[11px]">Hover over bars to inspect daily/weekly values</span>
                  )}
                  <span className="text-[10px] text-white/30 font-mono">
                    Peak: {maxAcquisitionCount} signups
                  </span>
                </div>

                {/* Bars Container */}
                <div
                  className="h-44 flex items-end gap-1.5 sm:gap-2 pt-4 px-1 pb-2 border-b border-white/10 overflow-x-auto no-scrollbar"
                  role="img"
                  aria-label="Customer acquisition trend bar chart"
                >
                  {acquisitionTrend.map((point) => {
                    const heightPercent = maxAcquisitionCount > 0
                      ? Math.max(4, Math.round((point.count / maxAcquisitionCount) * 100))
                      : 4;

                    const isHovered = activeTooltip?.label === point.label;

                    return (
                      <div
                        key={point.period}
                        onMouseEnter={() => setActiveTooltip({ label: point.label, count: point.count })}
                        onMouseLeave={() => setActiveTooltip(null)}
                        className="flex-1 min-w-[12px] sm:min-w-[16px] max-w-[32px] h-full flex flex-col justify-end items-center group cursor-pointer"
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-md transition-all duration-200 ${
                            point.count > 0
                              ? isHovered
                                ? 'bg-[#FFE3C7] shadow-lg shadow-[#D6B878]/30'
                                : 'bg-gradient-to-t from-[#B08D57] to-[#D6B878] group-hover:from-[#D6B878] group-hover:to-[#FFE3C7]'
                              : 'bg-white/5'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels */}
                <div className="flex justify-between text-[10px] text-white/40 px-1 pt-1 font-mono">
                  <span>{acquisitionTrend[0]?.label}</span>
                  {acquisitionTrend.length > 2 && (
                    <span>{acquisitionTrend[Math.floor(acquisitionTrend.length / 2)]?.label}</span>
                  )}
                  <span>{acquisitionTrend[acquisitionTrend.length - 1]?.label}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Dual Segmentation (Order Frequency & Purchase Recency) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Lifetime Customer Order-Frequency Distribution */}
            <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="border-b border-white/5 pb-3">
                  <h3 className="font-serif text-sm font-bold text-[#F8F4EC] flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-[#D6B878]" />
                    Lifetime Order-Frequency Distribution
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Breakdown of registered customers by qualifying order volume
                  </p>
                </div>

                <div className="space-y-3.5 mt-4">
                  {orderFreq.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white/80">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#F8F4EC]">{item.count.toLocaleString('en-IN')}</span>
                          <span className="text-[11px] text-white/40 font-mono w-12 text-right">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          style={{ width: `${item.percentage}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.key === 'zero_orders'
                              ? 'bg-white/20'
                              : item.key === 'one_order'
                              ? 'bg-blue-400'
                              : item.key === 'two_to_four'
                              ? 'bg-[#D6B878]'
                              : 'bg-emerald-400'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 text-[11px] text-white/40 flex items-center justify-between">
                <span>Qualifying Denominator: {summary.totalRegisteredCustomers} registered accounts</span>
                {onNavigateToDirectory && (
                  <button
                    type="button"
                    onClick={onNavigateToDirectory}
                    className="text-[#D6B878] hover:underline cursor-pointer"
                  >
                    View Directory →
                  </button>
                )}
              </div>
            </div>

            {/* Customer Purchase Recency Segments */}
            <div className="bg-[#140B1A] border border-[#D6B878]/20 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="border-b border-white/5 pb-3">
                  <h3 className="font-serif text-sm font-bold text-[#F8F4EC] flex items-center gap-2">
                    <TickCircle className="w-4 h-4 text-[#D6B878]" />
                    Customer Purchase-Recency Segments
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">
                    Elapsed days since customer&apos;s latest completed qualifying purchase
                  </p>
                </div>

                <div className="space-y-3.5 mt-4">
                  {recency.map((item) => (
                    <div key={item.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-white/80">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#F8F4EC]">{item.count.toLocaleString('en-IN')}</span>
                          <span className="text-[11px] text-white/40 font-mono w-12 text-right">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          style={{ width: `${item.percentage}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.key === 'under_30d'
                              ? 'bg-emerald-400'
                              : item.key === '30_to_90d'
                              ? 'bg-blue-400'
                              : item.key === '90_to_180d'
                              ? 'bg-amber-400'
                              : item.key === 'over_180d'
                              ? 'bg-rose-400/80'
                              : 'bg-white/20'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 text-[11px] text-white/40">
                <span>Dormancy cutoff: Accounts with no orders in &gt; 180 days categorized as dormant</span>
              </div>
            </div>
          </div>

          {/* Section 4: Bespoke Jewellery Requests Activity */}
          <div className="bg-[#140B1A] border border-purple-500/20 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div>
                <h3 className="font-serif text-sm font-bold text-[#F8F4EC] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-300" />
                  Bespoke Jewellery Requests Activity
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Customer custom sourcing inquiries and design requests
                </p>
              </div>

              <div className="text-xs text-right text-white/60">
                <span>{summary.periodJewelleryRequests} requests in period</span>
                <span className="text-white/30"> • </span>
                <span className="text-purple-300 font-semibold">{summary.totalJewelleryRequests} lifetime</span>
              </div>
            </div>

            {requests.length === 0 ? (
              <p className="text-xs text-white/40 italic py-2">No custom requests submitted in this period.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {requests.map((req) => (
                  <div
                    key={req.status}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#180F20] border border-white/10 text-xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span className="text-white/70 capitalize">{req.label}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 font-bold text-[11px]">
                      {req.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Financial Transparency & Audit Caveats */}
          {limitations && (
            <div className="bg-[#180F20] border border-[#D6B878]/30 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D6B878]">
                <Alert className="w-4 h-4 text-[#D6B878] shrink-0" />
                <span>Financial & Data Integrity Disclosures</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-white/70">
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="font-semibold text-white/90 block">Qualifying Purchase Rule</span>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {limitations.qualifyingPurchaseRule}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="font-semibold text-white/90 block">Refund Accounting Limitation</span>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {limitations.refundLimitation}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="font-semibold text-white/90 block">Realized AOV Scope</span>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {limitations.realizedAovLimitation}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                  <span className="font-semibold text-white/90 block">Bespoke Request Attribution</span>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    {limitations.requestAttributionLimitation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
