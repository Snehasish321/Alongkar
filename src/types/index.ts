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
