export interface Product {
  id: string;
  name: string;
  slug: string;
  category: 'earrings' | 'necklaces' | 'rings' | 'bracelets' | 'chains' | 'pendants' | string;
  collectionId?: 'everyday-elegance' | 'festive-glow' | 'the-minimalist' | 'statement' | string | null;
  price: number;
  originalPrice: number;
  discountPercent: number;
  rating: number;
  reviewCount: number;
  isNew?: boolean;
  isBestSeller?: boolean;
  isTrending?: boolean;
  image: string;
  hoverImage: string;
  description: string;
  finish?: string;
  baseMaterial?: string;
  stoneType?: string | null;
  warranty?: string;
  details: {
    finish: string;
    baseMaterial: string;
    stoneType?: string;
    warranty: string;
  };
  inStock: boolean;
  availableStock: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string;
  itemCount: number;
  description: string;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  image: string;
  featuredProductsCount: number;
}

export interface Review {
  id: string;
  customerName: string;
  location: string;
  rating: number;
  date: string;
  reviewText: string;
  productName?: string;
  verified: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type ShippingStatus =
  | 'NOT_READY'
  | 'READY'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export interface OrderItem {
  id: string;
  orderId: string;
  productId?: string | null;
  productName: string;
  productSlug: string;
  productImage: string;
  productSku?: string | null;
  unitPrice: number;
  originalPrice?: number | null;
  discountPercent: number;
  quantity: number;
  lineTotal: number;
  createdAt: string | Date;
}

export interface OrderAddressSnapshot {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;

  // Financial snapshots
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;

  // Customer snapshot
  customerName: string;
  customerEmail: string;
  customerPhone: string;

  // Address snapshots
  shippingAddress: OrderAddressSnapshot;
  billingAddress?: OrderAddressSnapshot | null;

  // Idempotency
  idempotencyKey?: string | null;

  // Future integration references
  paymentProvider?: string | null;
  paymentSessionId?: string | null;
  paymentOrderId?: string | null;
  paymentTransactionId?: string | null;
  paidAt?: string | Date | null;
  paymentFailureReason?: string | null;

  shipmentProvider?: string | null;
  shipmentOrderId?: string | null;
  shipmentTrackingNumber?: string | null;
  shipmentAwbCode?: string | null;
  shippedAt?: string | Date | null;
  deliveredAt?: string | Date | null;

  // Notes & cancellation metadata
  cancelReason?: string | null;
  cancelledAt?: string | Date | null;
  customerNotes?: string | null;
  adminNotes?: string | null;

  // Customer cancellation request lifecycle
  cancellationRequestStatus?: CancellationRequestStatus | null;
  cancellationRequestedAt?: string | Date | null;
  cancellationRequestReason?: string | null;
  cancellationResolvedAt?: string | Date | null;
  cancellationRejectionReason?: string | null;

  createdAt: string | Date;
  updatedAt: string | Date;
  items: OrderItem[];
}

export type CancellationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PaymentMethod = 'RAZORPAY' | 'COD';

export interface CreateOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  customerNotes?: string;
  idempotencyKey: string;
  couponCode?: string;
  paymentMethod?: PaymentMethod;
  items?: { productId: string; quantity: number }[];
}

export interface CreateRazorpayPaymentOrderInput {
  orderId: string;
}

export interface RazorpayPaymentOrderResponse {
  success: boolean;
  razorpayKeyId?: string;
  razorpayOrderId?: string;
  alongkarOrderId?: string;
  orderNumber?: string;
  amount?: number;
  currency?: string;
  alreadyPaid?: boolean;
  order?: Order;
  message?: string;
}

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface VerifyRazorpayPaymentInput {
  orderId: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
}

export interface VerifyRazorpayPaymentResponse {
  success: boolean;
  alreadyPaid?: boolean;
  order: Order;
  message?: string;
}

export interface ReconcileRazorpayPaymentInput {
  orderId: string;
}

export interface ReconcileRazorpayPaymentResponse {
  success: boolean;
  reconciled?: boolean;
  alreadyPaid?: boolean;
  message?: string;
  order?: Order;
}

export interface AdminOrderStats {
  total: number;
  pendingPayment: number;
  confirmed: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

export interface AdminOrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: AdminOrderStats;
}

export interface AdminSingleOrderResponse {
  order: Order;
}

export interface RazorpayPaymentFailureResponse {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
}

export interface RazorpayPrefillOptions {
  name?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayCheckoutModalOptions {
  ondismiss?: () => void;
  escape?: boolean;
  backdropclose?: boolean;
  confirm_close?: boolean;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id: string;
  prefill?: RazorpayPrefillOptions;
  notes?: Record<string, string>;
  theme?: {
    color?: string;
    backdrop_color?: string;
  };
  modal?: RazorpayCheckoutModalOptions;
  handler?: (response: RazorpayPaymentSuccessResponse) => void;
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: any) => void) => void;
  close?: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

// -------------------------------------------------------------
// Admin Customer Types (Read-Only Customer Directory & Detail)
// -------------------------------------------------------------

export interface AdminCustomerSummary {
  id: string;
  clerkUserId: string;
  registeredEmail: string | null;
  displayName: string | null;
  phone: string | null;
  createdAt: string;
  lastOrderDate: string | null;
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  repeatBuyer: boolean;
  grossOrderValue: number;
  realizedSpend: number;
  refundedValue: number;
  customRequestsCount: number;
}

export interface AdminCustomerKPISummary {
  totalCustomers: number;
  customersWithOrders: number;
  totalRepeatCustomers: number;
  customersWithCustomRequests: number;
  totalGrossOrderValue: number;
  totalRealizedSpend: number;
  scope?: string;
}

export interface AdminCustomerPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminCustomerDetailMetrics {
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  repeatBuyer: boolean;
  grossOrderValue: number;
  realizedSpend: number;
  refundedValue: number;
  customRequestsCount: number;
  lastOrderDate: string | null;
}

export interface AdminCustomerDetailOrderItem {
  id: string;
  productName: string;
  productSku?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AdminCustomerDetailOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  shippingStatus: string;
  paymentProvider: string | null;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  itemCount: number;
  items: AdminCustomerDetailOrderItem[];
}

export interface AdminCustomerShippingAddress {
  orderNumber: string;
  usedAt: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface AdminCustomerJewelleryRequest {
  id: string;
  requestNumber: string;
  status: string;
  jewelleryType: string;
  description: string;
  phone: string;
  budget: number | null;
  quotedPrice: number | null;
  createdAt: string;
}

export interface AdminCustomerDetail {
  id: string;
  clerkUserId: string;
  registeredEmail: string | null;
  displayName: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  metrics: AdminCustomerDetailMetrics;
  orders: AdminCustomerDetailOrder[];
  shippingAddresses: AdminCustomerShippingAddress[];
  jewelleryRequests: AdminCustomerJewelleryRequest[];
}

// -------------------------------------------------------------
// Admin Customer Analytics Types
// -------------------------------------------------------------

export type AnalyticsTimeRange = '30d' | '90d' | '1y' | 'all';

export interface CustomerAcquisitionTrendPoint {
  period: string;
  label: string;
  count: number;
  date: string;
}

export interface OrderFrequencyBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PurchaseRecencyBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface JewelleryRequestStatusCount {
  status: string;
  count: number;
  label: string;
}

export interface AdminCustomerAnalyticsSummary {
  // Lifetime Customer Metrics
  totalRegisteredCustomers: number;
  customersWithQualifyingPurchases: number;
  firstTimeBuyers: number;
  repeatBuyers: number;
  repeatPurchaseRate: number;

  // Selected Period Financial Metrics
  periodQualifyingOrdersCount: number;
  grossOrderValue: number;
  grossAov: number | null;
  realizedAov: number | null;
  realizedSpend: number;
  refundedValue: number;
  newCustomersInPeriod: number;

  // Jewellery Requests Activity
  totalJewelleryRequests: number;
  periodJewelleryRequests: number;
}

export interface AdminCustomerAnalyticsLimitations {
  refundLimitation: string;
  realizedAovLimitation: string;
  requestAttributionLimitation: string;
  qualifyingPurchaseRule: string;
}

export interface AdminCustomerAnalyticsResponse {
  success: boolean;
  timeRange: AnalyticsTimeRange;
  generatedAt: string;
  summary: AdminCustomerAnalyticsSummary;
  acquisitionTrend: CustomerAcquisitionTrendPoint[];
  orderFrequencyDistribution: OrderFrequencyBucket[];
  purchaseRecencyDistribution: PurchaseRecencyBucket[];
  jewelleryRequestBreakdown: JewelleryRequestStatusCount[];
  limitations: AdminCustomerAnalyticsLimitations;
}

// -------------------------------------------------------------
// Admin Customer Segmentation Types
// -------------------------------------------------------------

export type CustomerSegmentId =
  | 'new_customers'
  | 'first_time_buyers'
  | 'repeat_buyers'
  | 'high_value_customers'
  | 'jewellery_request_customers'
  | 'inactive_customers';

export type CustomerSegmentSortOption =
  | 'newest'
  | 'oldest'
  | 'most_purchases'
  | 'highest_spend'
  | 'last_purchased';

export interface AdminCustomerSegmentMeta {
  id: CustomerSegmentId;
  label: string;
  definition: string;
  purpose: string;
  customerCount: number;
  thresholdBadge: string;
}

export interface AdminCustomerSegmentMember {
  id: string;
  registeredEmail: string | null;
  displayName: string | null;
  phone: string | null;
  createdAt: string;
  qualifyingPurchasesCount: number;
  lifetimeGrossPurchaseValue: number;
  lastQualifyingPurchaseDate: string | null;
  hasJewelleryRequests: boolean;
  jewelleryRequestsCount: number;
  segmentTags: string[];
}

export interface AdminCustomerSegmentsRules {
  qualifyingPurchaseRule: string;
  highValueThresholdRule: string;
  inactivityRule: string;
  refundLimitation: string;
}

export interface AdminCustomerSegmentsResponse {
  success: boolean;
  generatedAt: string;
  selectedSegment: CustomerSegmentId;
  segments: AdminCustomerSegmentMeta[];
  customers: AdminCustomerSegmentMember[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  rules: AdminCustomerSegmentsRules;
}
