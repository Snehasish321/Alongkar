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

  createdAt: string | Date;
  updatedAt: string | Date;
  items: OrderItem[];
}

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
