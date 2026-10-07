import 'dotenv/config';
import prisma from '../../src/lib/prisma.js';
import { withTimeout, DEFAULT_DB_TIMEOUT_MS, isValidIdentifier, getSafeErrorMessage, logServerError } from './security.js';
import { checkOrderFulfillmentEligibility, type FulfillmentAuthCaller } from './fulfillment.js';

export const SHIPROCKET_API_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
export const SHIPROCKET_AUTH_ENDPOINT = `${SHIPROCKET_API_BASE_URL}/auth/login`;
export const SHIPROCKET_CREATE_ORDER_ENDPOINT = `${SHIPROCKET_API_BASE_URL}/orders/create/adhoc`;

export const SHIPROCKET_REQUEST_TIMEOUT_MS = 15000;
export const SHIPROCKET_TOKEN_TTL_MS = 230 * 60 * 60 * 1000; // ~9.5 days (Shiprocket tokens expire in 240 hours)

export const DEFAULT_JEWELLERY_PACKAGE_DIMENSIONS = {
  length: 10, // cm (standard jewellery tamper-proof box)
  breadth: 10, // cm
  height: 5, // cm
  weight: 0.5, // kg
} as const;

export const DEFAULT_JEWELLERY_HSN = 711319; // Standard Indian HSN for imitation/gold jewellery

export interface ShiprocketCredentials {
  email: string;
  password: string;
  pickupLocation: string;
}

export interface ShiprocketOrderItemPayload {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount: number;
  tax: number;
  hsn: number;
}

export interface ShiprocketOrderCreatePayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  channel_id: string;
  comment: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_address_2: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  shipping_customer_name: string;
  shipping_last_name: string;
  shipping_address: string;
  shipping_address_2: string;
  shipping_city: string;
  shipping_pincode: string;
  shipping_country: string;
  shipping_state: string;
  shipping_email: string;
  shipping_phone: string;
  order_items: ShiprocketOrderItemPayload[];
  payment_method: 'Prepaid' | 'COD';
  shipping_charges: number;
  giftwrap_charges: number;
  transaction_charges: number;
  total_discount: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface NormalizedShiprocketResponse {
  success: boolean;
  status: number;
  provider: 'SHIPROCKET';
  alongkarOrderId: string;
  orderNumber?: string | null;
  providerOrderId?: string;
  providerShipmentId?: string;
  statusText?: string;
  message: string;
  isExisting?: boolean;
  error?: string;
  reasons?: string[];
}

// In-memory token cache (persists for the lifecycle of the serverless execution environment)
let tokenCache: { token: string; expiresAt: number } | null = null;
let authInFlightPromise: Promise<string> | null = null;

/**
 * Resets the in-memory token cache (useful during token invalidation or testing).
 */
export function invalidateShiprocketTokenCache(): void {
  tokenCache = null;
  authInFlightPromise = null;
}

/**
 * Validates and retrieves server-side Shiprocket credentials.
 * Never exposes credentials to client-facing code or logs.
 */
export function getShiprocketConfig(): ShiprocketCredentials {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD?.trim();
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Primary';

  if (!email || !password) {
    throw new Error('Shiprocket credentials are not configured on the server (missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD).');
  }

  return { email, password, pickupLocation };
}

/**
 * Authenticates against Shiprocket API and returns a Bearer access token.
 * Reuses cached token if valid; handles concurrent requests safely without stampedes.
 */
export async function getShiprocketToken(options?: {
  forceRefresh?: boolean;
  customFetch?: typeof fetch;
}): Promise<string> {
  const fetchFn = options?.customFetch || fetch;

  if (!options?.forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  if (authInFlightPromise) {
    return authInFlightPromise;
  }

  authInFlightPromise = (async () => {
    try {
      const config = getShiprocketConfig();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SHIPROCKET_REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetchFn(SHIPROCKET_AUTH_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: config.email,
            password: config.password,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const responseText = await response.text();
      let responseData: any = {};
      try {
        responseData = JSON.parse(responseText);
      } catch {
        throw new Error(`Malformed response received from Shiprocket authentication service (HTTP ${response.status}).`);
      }

      if (!response.ok || !responseData.token) {
        const errorMsg =
          responseData.message ||
          responseData.error ||
          (response.status === 401 ? 'Invalid Shiprocket API credentials.' : `Authentication failed (HTTP ${response.status}).`);
        throw new Error(`Shiprocket authentication failed: ${errorMsg}`);
      }

      const token = String(responseData.token);
      tokenCache = {
        token,
        expiresAt: Date.now() + SHIPROCKET_TOKEN_TTL_MS,
      };

      return token;
    } finally {
      authInFlightPromise = null;
    }
  })();

  return authInFlightPromise;
}

/**
 * Splits a full customer name into first name and last name.
 */
export function splitCustomerName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const clean = (fullName || '').trim();
  if (!clean) return { firstName: 'Valued', lastName: 'Customer' };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Formats a Date instance or ISO string into Shiprocket's expected 'YYYY-MM-DD HH:mm' format.
 */
export function formatShiprocketOrderDate(dateInput: Date | string | null | undefined): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const yyyy = validDate.getFullYear();
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const dd = String(validDate.getDate()).padStart(2, '0');
  const hh = String(validDate.getHours()).padStart(2, '0');
  const min = String(validDate.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * Maps an authoritative Alongkar order into the exact request schema expected by Shiprocket.
 * Does not calculate totals again; strictly preserves server-persisted order snapshots.
 */
export function mapOrderToShiprocketPayload(
  order: any,
  options?: { pickupLocation?: string }
): ShiprocketOrderCreatePayload {
  const toNum = (val: any) => {
    if (val === null || val === undefined) return 0;
    return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  };

  const { firstName: custFirst, lastName: custLast } = splitCustomerName(order.customerName);
  const isCod = (order.paymentProvider || '').toUpperCase() === 'COD';
  const pickupLocation = options?.pickupLocation || process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Primary';

  const orderItems: ShiprocketOrderItemPayload[] = (order.items || []).map((item: any) => ({
    name: item.productName || 'Alongkar Jewellery Item',
    sku: item.productSku || item.productId || `ITEM-${item.id || '1'}`,
    units: item.quantity || 1,
    selling_price: toNum(item.unitPrice),
    discount: 0,
    tax: 0,
    hsn: DEFAULT_JEWELLERY_HSN,
  }));

  const shippingAddress1 = order.shippingAddressLine1 || '';
  const shippingAddress2 = order.shippingAddressLine2 || '';
  const shippingCity = order.shippingCity || '';
  const shippingState = order.shippingState || '';
  const shippingPincode = order.shippingPincode || '';
  const shippingCountry = order.shippingCountry || 'India';

  const billingAddress1 = order.billingAddressLine1 || shippingAddress1;
  const billingAddress2 = order.billingAddressLine2 || shippingAddress2;
  const billingCity = order.billingCity || shippingCity;
  const billingState = order.billingState || shippingState;
  const billingPincode = order.billingPincode || shippingPincode;
  const billingCountry = order.billingCountry || shippingCountry;

  const hasDistinctBilling = Boolean(order.billingAddressLine1);

  return {
    order_id: order.orderNumber || order.id,
    order_date: formatShiprocketOrderDate(order.createdAt),
    pickup_location: pickupLocation,
    channel_id: '',
    comment: order.customerNotes || order.adminNotes || 'Alongkar Fine Jewellery Order',
    billing_customer_name: custFirst,
    billing_last_name: custLast,
    billing_address: billingAddress1,
    billing_address_2: billingAddress2,
    billing_city: billingCity,
    billing_pincode: billingPincode,
    billing_state: billingState,
    billing_country: billingCountry,
    billing_email: order.customerEmail || 'orders@alongkar.com',
    billing_phone: order.customerPhone || '',
    shipping_is_billing: !hasDistinctBilling,
    shipping_customer_name: custFirst,
    shipping_last_name: custLast,
    shipping_address: shippingAddress1,
    shipping_address_2: shippingAddress2,
    shipping_city: shippingCity,
    shipping_pincode: shippingPincode,
    shipping_country: shippingCountry,
    shipping_state: shippingState,
    shipping_email: order.customerEmail || 'orders@alongkar.com',
    shipping_phone: order.customerPhone || '',
    order_items: orderItems,
    payment_method: isCod ? 'COD' : 'Prepaid',
    shipping_charges: toNum(order.shippingFee),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: toNum(order.discountTotal),
    sub_total: toNum(order.grandTotal),
    length: DEFAULT_JEWELLERY_PACKAGE_DIMENSIONS.length,
    breadth: DEFAULT_JEWELLERY_PACKAGE_DIMENSIONS.breadth,
    height: DEFAULT_JEWELLERY_PACKAGE_DIMENSIONS.height,
    weight: DEFAULT_JEWELLERY_PACKAGE_DIMENSIONS.weight,
  };
}

/**
 * Server-authoritative Shiprocket order creation service.
 * Enforces admin authorization, validates Phase 1M fulfillment eligibility, prevents duplicate creations,
 * maps order snapshot data, and calls Shiprocket API with safe error handling.
 */
export async function createShiprocketOrder(
  orderIdOrNumber: string,
  caller: FulfillmentAuthCaller | null,
  options?: {
    customFetch?: typeof fetch;
    dryRun?: boolean;
    pickupLocation?: string;
  }
): Promise<NormalizedShiprocketResponse> {
  const fetchFn = options?.customFetch || fetch;

  // 1. Authorization: Only authenticated administrators can initiate Shiprocket order creation
  if (!caller || !caller.isAdmin) {
    return {
      success: false,
      status: 403,
      provider: 'SHIPROCKET',
      alongkarOrderId: orderIdOrNumber,
      message: 'Forbidden: Admin authorization required to create Shiprocket orders.',
      error: 'ADMIN_REQUIRED',
    };
  }

  if (!orderIdOrNumber || typeof orderIdOrNumber !== 'string') {
    return {
      success: false,
      status: 400,
      provider: 'SHIPROCKET',
      alongkarOrderId: '',
      message: 'Bad Request: A valid order identifier is required.',
      error: 'INVALID_IDENTIFIER',
    };
  }

  const trimmedId = orderIdOrNumber.trim();
  const isIdLookup = isValidIdentifier(trimmedId);
  const whereClause: any = isIdLookup ? { id: trimmedId } : { orderNumber: trimmedId };

  // 2. Load order from database with items included
  const order = await withTimeout(
    prisma.order.findFirst({
      where: whereClause,
      include: {
        items: true,
      },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'Shiprocket.findOrder'
  );

  if (!order) {
    return {
      success: false,
      status: 404,
      provider: 'SHIPROCKET',
      alongkarOrderId: trimmedId,
      message: 'Order not found.',
      error: 'ORDER_NOT_FOUND',
    };
  }

  // 3. Phase 1M Fulfillment Boundary Validation
  const eligibility = checkOrderFulfillmentEligibility(order);
  if (!eligibility.eligible) {
    return {
      success: false,
      status: 400,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      reasons: eligibility.reasons,
      message: `Order cannot enter Shiprocket fulfillment: ${eligibility.reasons.join(', ')}.`,
      error: 'FULFILLMENT_INELIGIBLE',
    };
  }

  // 4. Idempotency Check: Prevent duplicate Shiprocket order creations
  if (order.shipmentOrderId && order.shipmentProvider === 'SHIPROCKET') {
    return {
      success: true,
      status: 200,
      isExisting: true,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      providerOrderId: order.shipmentOrderId,
      providerShipmentId: undefined,
      statusText: order.shippingStatus,
      message: `Shiprocket order already exists for this order (Provider Order ID: ${order.shipmentOrderId}).`,
    };
  }

  // 5. Build Shiprocket payload
  const payload = mapOrderToShiprocketPayload(order, { pickupLocation: options?.pickupLocation });

  if (options?.dryRun) {
    return {
      success: true,
      status: 200,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      message: 'Dry run successful: Order is eligible and mapped for Shiprocket.',
    };
  }

  // 6. Execute authenticated Shiprocket API request with automatic token refresh on 401
  let token: string;
  try {
    token = await getShiprocketToken({ customFetch: fetchFn });
  } catch (err: any) {
    return {
      success: false,
      status: 502,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      message: `Shiprocket Authentication Failed: ${getSafeErrorMessage(err)}`,
      error: 'PROVIDER_AUTH_ERROR',
    };
  }

  const executeCreate = async (authToken: string): Promise<{ status: number; data: any; raw: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SHIPROCKET_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchFn(SHIPROCKET_CREATE_ORDER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const raw = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { rawText: raw };
      }
      return { status: response.status, data, raw };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let apiResult: { status: number; data: any; raw: string };
  try {
    apiResult = await executeCreate(token);

    // If 401 Unauthorized, token may have expired upstream; refresh and retry once
    if (apiResult.status === 401) {
      invalidateShiprocketTokenCache();
      const freshToken = await getShiprocketToken({ forceRefresh: true, customFetch: fetchFn });
      apiResult = await executeCreate(freshToken);
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
    logServerError('Shiprocket order creation network error', err, {
      operation: 'create_shiprocket_order',
      statusCode: isTimeout ? 504 : 502,
      extra: { orderId: order.id, orderNumber: order.orderNumber },
    });
    return {
      success: false,
      status: isTimeout ? 504 : 502,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      message: isTimeout
        ? 'Shiprocket API request timed out. Please retry later.'
        : `Shiprocket API communication failed: ${getSafeErrorMessage(err)}`,
      error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
    };
  }

  // Handle provider failure responses safely without mutating order state
  if (apiResult.status < 200 || apiResult.status >= 300 || !apiResult.data?.order_id) {
    const errMessage =
      apiResult.data?.message ||
      apiResult.data?.error ||
      (typeof apiResult.data?.errors === 'object' ? JSON.stringify(apiResult.data.errors) : null) ||
      `Shiprocket order creation failed with HTTP status ${apiResult.status}.`;

    logServerError('Shiprocket order creation provider error', new Error(errMessage), {
      operation: 'create_shiprocket_order',
      statusCode: apiResult.status,
      extra: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    });

    let mappedErrorCode = 'PROVIDER_ERROR';
    if (apiResult.status === 400 || apiResult.status === 422) mappedErrorCode = 'VALIDATION_ERROR';
    if (apiResult.status === 429) mappedErrorCode = 'RATE_LIMITED';
    if (apiResult.status === 401 || apiResult.status === 403) mappedErrorCode = 'AUTH_ERROR';

    return {
      success: false,
      status: apiResult.status >= 400 && apiResult.status < 500 ? apiResult.status : 502,
      provider: 'SHIPROCKET',
      alongkarOrderId: order.id,
      orderNumber: order.orderNumber,
      message: errMessage,
      error: mappedErrorCode,
    };
  }

  // 7. Success: Extract provider IDs and update Alongkar Order record atomically
  const providerOrderId = String(apiResult.data.order_id);
  const providerShipmentId = apiResult.data.shipment_id ? String(apiResult.data.shipment_id) : undefined;

  const currentAdminNotes = order.adminNotes || '';
  const srNote = `Shiprocket Order Created: ID ${providerOrderId}${providerShipmentId ? ` (Shipment ID: ${providerShipmentId})` : ''}`;
  const updatedAdminNotes = currentAdminNotes ? `${currentAdminNotes} | ${srNote}` : srNote;

  await withTimeout(
    prisma.order.update({
      where: { id: order.id },
      data: {
        shipmentProvider: 'SHIPROCKET',
        shipmentOrderId: providerOrderId,
        shippingStatus: 'PROCESSING',
        adminNotes: updatedAdminNotes,
      },
    }),
    DEFAULT_DB_TIMEOUT_MS,
    'Shiprocket.updateOrder'
  );

  return {
    success: true,
    status: 201,
    provider: 'SHIPROCKET',
    alongkarOrderId: order.id,
    orderNumber: order.orderNumber,
    providerOrderId,
    providerShipmentId,
    statusText: 'PROCESSING',
    message: 'Shiprocket order successfully created and linked to Alongkar order.',
  };
}
