import type {
  AdminCustomerSummary,
  AdminCustomerKPISummary,
  AdminCustomerPagination,
  AdminCustomerDetail,
  AnalyticsTimeRange,
  AdminCustomerAnalyticsResponse,
  CustomerSegmentId,
  CustomerSegmentSortOption,
  AdminCustomerSegmentsResponse,
} from '../types';

export interface FetchAdminCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
  orderFilter?: 'all' | 'with_orders' | 'repeat_buyers' | 'custom_requests';
  sortBy?: 'newest' | 'oldest' | 'most_orders' | 'highest_gross_spend' | 'highest_realized_spend';
}

export interface FetchAdminCustomersResponse {
  success: boolean;
  customers: AdminCustomerSummary[];
  summary: AdminCustomerKPISummary;
  pagination: AdminCustomerPagination;
}

export interface FetchAdminCustomerDetailResponse {
  success: boolean;
  customer: AdminCustomerDetail;
}

/**
 * Fetches the paginated list of registered customers for authenticated admins from GET /api/admin/customers.
 * Supports search, orderFilter, sortBy, and server-side pagination.
 */
export async function fetchAdminCustomers(
  token: string | null,
  params: FetchAdminCustomersParams = {}
): Promise<FetchAdminCustomersResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());
  if (params.orderFilter && params.orderFilter !== 'all') {
    queryParams.set('orderFilter', params.orderFilter);
  }
  if (params.sortBy && params.sortBy !== 'newest') {
    queryParams.set('sortBy', params.sortBy);
  }

  const url = queryParams.toString()
    ? `/api/admin/customers?${queryParams.toString()}`
    : '/api/admin/customers';

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch customers (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    success: Boolean(data.success),
    customers: Array.isArray(data.customers) ? data.customers : [],
    summary: data.summary || {
      totalCustomers: 0,
      customersWithOrders: 0,
      totalRepeatCustomers: 0,
      customersWithCustomRequests: 0,
      totalGrossOrderValue: 0,
      totalRealizedSpend: 0,
    },
    pagination: data.pagination || {
      page: params.page || 1,
      limit: params.limit || 20,
      total: Array.isArray(data.customers) ? data.customers.length : 0,
      totalPages: 1,
    },
  };
}

/**
 * Fetches single customer read-only details by internal User ID from GET /api/admin/customers?id=<userId>.
 */
export async function fetchAdminCustomerDetail(
  token: string | null,
  customerId: string
): Promise<AdminCustomerDetail> {
  if (!customerId || !customerId.trim()) {
    throw new Error('Valid customer ID is required.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams({ id: customerId.trim() });
  const response = await fetch(`/api/admin/customers?${queryParams.toString()}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  if (response.status === 404) {
    throw new Error('Customer account not found.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch customer details (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.customer) {
    throw new Error('Customer details not found in API response.');
  }

  return data.customer;
}

export interface FetchAdminCustomerAnalyticsParams {
  timeRange?: AnalyticsTimeRange;
}

/**
 * Fetches aggregate customer analytics for authenticated admins from GET /api/admin/customers/analytics.
 */
export async function fetchAdminCustomerAnalytics(
  token: string | null,
  params: FetchAdminCustomerAnalyticsParams = {}
): Promise<AdminCustomerAnalyticsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams();
  if (params.timeRange) {
    queryParams.set('timeRange', params.timeRange);
  }

  const url = queryParams.toString()
    ? `/api/admin/customers/analytics?${queryParams.toString()}`
    : '/api/admin/customers/analytics';

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch customer analytics (HTTP ${response.status})`);
  }

  return await response.json();
}

export interface FetchAdminCustomerSegmentsParams {
  segment?: CustomerSegmentId;
  page?: number;
  limit?: number;
  sortBy?: CustomerSegmentSortOption;
  search?: string;
}

/**
 * Fetches segmented customer lists and cohort metrics for authenticated admins from GET /api/admin/customers/segments.
 */
export async function fetchAdminCustomerSegments(
  token: string | null,
  params: FetchAdminCustomerSegmentsParams = {}
): Promise<AdminCustomerSegmentsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams();
  if (params.segment) {
    queryParams.set('segment', params.segment);
  }
  if (params.page && params.page > 1) {
    queryParams.set('page', String(params.page));
  }
  if (params.limit) {
    queryParams.set('limit', String(params.limit));
  }
  if (params.sortBy && params.sortBy !== 'newest') {
    queryParams.set('sortBy', params.sortBy);
  }
  if (params.search && params.search.trim()) {
    queryParams.set('search', params.search.trim());
  }

  const url = queryParams.toString()
    ? `/api/admin/customers/segments?${queryParams.toString()}`
    : '/api/admin/customers/segments';

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch customer segments (HTTP ${response.status})`);
  }

  return await response.json();
}
