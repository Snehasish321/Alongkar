import type {
  Order,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResponse,
  ReconcileRazorpayPaymentInput,
  ReconcileRazorpayPaymentResponse,
} from '../types';

export interface CustomerOrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CustomerSingleOrderResponse {
  order: Order;
}

/**
 * Fetches the authenticated customer's order history from GET /api/orders.
 * Respects pagination (page, limit) and sorts in descending creation order.
 */
export async function fetchCustomerOrders(
  token: string | null,
  page: number = 1,
  limit: number = 10
): Promise<CustomerOrdersResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await fetch(`/api/orders?${queryParams.toString()}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Please sign in to view your orders.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch orders (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    pagination: data.pagination || {
      page,
      limit,
      total: Array.isArray(data.orders) ? data.orders.length : 0,
      totalPages: 1,
    },
  };
}

/**
 * Fetches a single customer order by Order Number or ID from GET /api/orders.
 */
export async function fetchCustomerOrder(
  token: string | null,
  orderNumberOrId: string
): Promise<Order> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams(
    orderNumberOrId.startsWith('ORD-')
      ? { orderNumber: orderNumberOrId }
      : { id: orderNumberOrId }
  );

  const response = await fetch(`/api/orders?${queryParams.toString()}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    throw new Error('Please sign in to view this order.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch order (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.order) {
    throw new Error('Order not found');
  }

  return data.order;
}

/**
 * Sends captured Razorpay Checkout payment tokens to POST /api/payments/razorpay/verify
 * for server-side cryptographic and gateway state verification.
 */
export async function verifyRazorpayPayment(
  token: string | null,
  input: VerifyRazorpayPaymentInput
): Promise<VerifyRazorpayPaymentResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/payments/razorpay/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (response.status === 401) {
    throw new Error('Authentication required to verify payment.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Payment verification failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    success: Boolean(data.success),
    alreadyPaid: data.alreadyPaid,
    order: data.order,
    message: data.message,
  };
}

/**
 * Reconciles an existing Razorpay order server-side via POST /api/payments/razorpay?action=reconcile.
 * Checks the gateway directly for captured payment status without needing browser signature.
 */
export async function reconcileRazorpayPayment(
  token: string | null,
  input: ReconcileRazorpayPaymentInput
): Promise<ReconcileRazorpayPaymentResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/payments/razorpay?action=reconcile', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (response.status === 401) {
    throw new Error('Authentication required to reconcile payment.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Payment reconciliation failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    success: Boolean(data.success),
    reconciled: Boolean(data.reconciled),
    alreadyPaid: Boolean(data.alreadyPaid),
    order: data.order,
    message: data.message,
  };
}

export interface FetchAdminOrdersParams {
  page?: number;
  limit?: number;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  search?: string;
}

/**
 * Fetches all-customer orders for authenticated admins from GET /api/admin/orders.
 */
export async function fetchAdminOrders(
  token: string | null,
  params: FetchAdminOrdersParams = {}
): Promise<{
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: {
    total: number;
    pendingPayment: number;
    confirmed: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', String(params.page));
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
  if (params.paymentStatus && params.paymentStatus !== 'ALL') queryParams.set('paymentStatus', params.paymentStatus);
  if (params.paymentMethod && params.paymentMethod !== 'ALL') queryParams.set('paymentMethod', params.paymentMethod);
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());

  const response = await fetch(`/api/admin/orders?${queryParams.toString()}`, {
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
    throw new Error(errorData.error || `Failed to fetch admin orders (HTTP ${response.status})`);
  }

  const data = await response.json();
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    pagination: data.pagination || {
      page: params.page || 1,
      limit: params.limit || 20,
      total: Array.isArray(data.orders) ? data.orders.length : 0,
      totalPages: 1,
    },
    stats: data.stats,
  };
}

/**
 * Fetches a single order's complete details for admins from GET /api/admin/orders.
 */
export async function fetchAdminOrder(
  token: string | null,
  orderNumberOrId: string
): Promise<Order> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const queryParams = new URLSearchParams(
    orderNumberOrId.startsWith('ORD-')
      ? { orderNumber: orderNumberOrId }
      : { id: orderNumberOrId }
  );

  const response = await fetch(`/api/admin/orders?${queryParams.toString()}`, {
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
    throw new Error('Order not found.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch order details (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.order) {
    throw new Error('Order data is missing from server response.');
  }

  return data.order;
}

export interface CancelAdminOrderResponse {
  success: boolean;
  order: Order;
  inventoryRestored: boolean;
  restoredItems?: Array<{ productId: string; quantity: number }>;
  refundStatus?: 'NOT_APPLICABLE' | 'REFUNDED' | 'REFUND_FAILED' | 'PENDING_RETRY';
  refundId?: string;
  message: string;
}

/**
 * Initiates an authorized server-authoritative order cancellation workflow
 * via POST /api/admin/orders with action: 'cancel_order'.
 */
export async function cancelAdminOrder(
  token: string | null,
  payload: {
    orderId?: string;
    orderNumber?: string;
    cancelReason?: string;
  }
): Promise<CancelAdminOrderResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/admin/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'cancel_order',
      ...payload,
    }),
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to cancel order (HTTP ${response.status})`);
  }

  return {
    success: Boolean(data.success),
    order: data.order,
    inventoryRestored: Boolean(data.inventoryRestored),
    restoredItems: data.restoredItems,
    refundStatus: data.refundStatus,
    refundId: data.refundId,
    message: data.message || 'Order successfully cancelled.',
  };
}

export async function retryAdminRefund(
  token: string | null,
  payload: {
    orderId?: string;
    orderNumber?: string;
  }
): Promise<{
  success: boolean;
  order?: Order;
  refundStatus: 'REFUNDED' | 'REFUND_FAILED' | 'ALREADY_REFUNDED' | 'NOT_APPLICABLE';
  refundId?: string;
  message: string;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/admin/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'retry_refund',
      ...payload,
    }),
  });

  if (response.status === 401) {
    throw new Error('Unauthorized. Please sign in as an admin.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. Administrator privileges required.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to process refund (HTTP ${response.status})`);
  }

  return {
    success: Boolean(data.success),
    order: data.order,
    refundStatus: data.refundStatus,
    refundId: data.refundId,
    message: data.message || 'Refund successfully processed.',
  };
}


