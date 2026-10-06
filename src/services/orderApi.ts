import type {
  Order,
  VerifyRazorpayPaymentInput,
  VerifyRazorpayPaymentResponse,
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
  };
}
