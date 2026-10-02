import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Heart,
  ShoppingBag,
  Check,
  ShieldTick,
  Truck,
  Sparkles,
  ArrowLeft,
  Loader,
  Alert,
  Diamonds,
  RotateLeft,
  Minus,
  Plus,
} from 'reicon-react';
import { fetchProductByIdOrSlug, fetchProducts } from '../services/productApi';
import type { Product } from '../types';
import { formatPrice } from '../lib/utils';
import { StarRating } from '../components/ui/StarRating';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { ProductCard } from '../components/products/ProductCard';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState<boolean>(false);

  const { addToCart } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function loadProductData() {
      try {
        setIsLoading(true);
        setNotFound(false);
        setError(null);
        setQuantity(1);

        // Fetch single product by slug (with fallback to ID)
        const targetProduct = await fetchProductByIdOrSlug(slug!);

        if (!isMounted) return;

        if (!targetProduct) {
          setNotFound(true);
          setProduct(null);
        } else {
          setProduct(targetProduct);
          setSelectedImage(targetProduct.image || targetProduct.hoverImage || '');
          setNotFound(false);

          // Fetch 4 related products in same category
          try {
            const allProducts = await fetchProducts({ category: targetProduct.category });
            if (isMounted) {
              const filtered = allProducts.filter((p) => p.id !== targetProduct.id).slice(0, 4);
              setRelatedProducts(filtered);
            }
          } catch {
            // Ignore related products fetch errors
          }
        }
      } catch (err: any) {
        console.error('Error fetching product detail:', err);
        if (isMounted) {
          setError(err?.message || 'Failed to load product details');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProductData();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  const isLiked = product ? wishlist.some((p) => p.id === product.id) : false;

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  };

  const handleToggleWishlist = () => {
    if (!product) return;
    toggleWishlist(product);
  };

  return (
    <StorefrontLayout>
      <main className="py-8 sm:py-14 bg-[#FFFDF8] min-h-[85vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-xs text-gray-500 mb-8 font-medium overflow-x-auto no-scrollbar">
            <Link to="/" className="hover:text-[#2A0008] transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link to="/shop" className="hover:text-[#2A0008] transition-colors">
              Shop
            </Link>
            {product && (
              <>
                <span>/</span>
                <Link
                  to={`/shop?category=${encodeURIComponent(product.category)}`}
                  className="hover:text-[#2A0008] uppercase tracking-wider transition-colors"
                >
                  {product.category}
                </Link>
                <span>/</span>
                <span className="text-[#211A17] font-semibold truncate max-w-[200px] sm:max-w-xs">
                  {product.name}
                </span>
              </>
            )}
          </nav>

          {/* Loading State */}
          {isLoading && (
            <div className="py-24 text-center bg-[#FAF7F2] rounded-2xl border border-[#E8C98A]/20 p-8 space-y-4">
              <Loader size={40} className="mx-auto text-[#B08D57] animate-spin" />
              <h3 className="font-serif text-xl font-semibold text-[#211A17]">
                Retrieving Product Details
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Loading authentic jewellery specifications and craftsmanship records from our database...
              </p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="py-20 text-center bg-[#FAF7F2] rounded-2xl border border-red-200 p-8 space-y-4 max-w-2xl mx-auto">
              <div className="w-14 h-14 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto">
                <Alert size={28} />
              </div>
              <h2 className="font-serif text-2xl font-bold text-red-950">
                Unable to Load Product
              </h2>
              <p className="text-xs text-red-800/80">{error}</p>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2.5 rounded-full bg-[#2A0008] text-[#E8C98A] text-xs font-semibold uppercase tracking-wider hover:bg-[#3D0010] cursor-pointer"
                >
                  Retry
                </button>
                <Link
                  to="/shop"
                  className="px-6 py-2.5 rounded-full border border-[#2A0008] text-[#2A0008] text-xs font-semibold uppercase tracking-wider hover:bg-[#FAF7F2]"
                >
                  Browse Catalogue
                </Link>
              </div>
            </div>
          )}

          {/* 404 / Product Not Found State */}
          {!isLoading && !error && (notFound || !product) && (
            <div className="py-20 text-center bg-[#FAF7F2] rounded-2xl border border-[#E8C98A]/30 p-8 sm:p-12 space-y-6 max-w-2xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-[#E8C98A]/20 text-[#8C6C38] flex items-center justify-center mx-auto">
                <Diamonds size={32} />
              </div>
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-[0.25em] text-[#B08D57] font-bold">
                  404 NOT FOUND
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17]">
                  Jewellery Piece Not Found
                </h2>
                <p className="text-xs sm:text-sm text-gray-600 font-light max-w-md mx-auto">
                  The product with slug <code className="bg-white px-2 py-0.5 rounded border text-[#8C6C38] font-mono">{slug}</code> could not be located in our active PostgreSQL database.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-[#2A0008] text-[#E8C98A] text-xs font-semibold uppercase tracking-[0.2em] hover:bg-gradient-to-r hover:from-[#E8C98A] hover:to-[#C9A45D] hover:text-[#1C0106] transition-all shadow-md cursor-pointer"
                >
                  <ArrowLeft size={16} />
                  <span>Return to Shop</span>
                </Link>
              </div>
            </div>
          )}

          {/* Loaded Product Presentation */}
          {!isLoading && !error && product && (
            <div className="space-y-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                {/* Left Column: Image Presentation Gallery */}
                <div className="lg:col-span-6 space-y-4">
                  {/* Primary Large Image Frame */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="relative aspect-square w-full bg-[#FAF7F2] rounded-2xl overflow-hidden border border-[#E8C98A]/30 shadow-md group"
                  >
                    {/* Luxury Badges */}
                    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
                      {product.isBestSeller && (
                        <span className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest bg-[#2A0008] text-[#E8C98A] border border-[#E8C98A]/50 shadow-sm flex items-center gap-1.5">
                          <Sparkles size={11} />
                          <span>Bestseller</span>
                        </span>
                      )}
                      {product.isNew && (
                        <span className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest bg-white/95 text-[#211A17] border border-[#B08D57]/40 shadow-sm">
                          New In
                        </span>
                      )}
                      {product.discountPercent > 0 && (
                        <span className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider bg-[#5A0015] text-[#F8F1E3] shadow-sm">
                          {product.discountPercent}% Off
                        </span>
                      )}
                    </div>

                    {/* Wishlist Button */}
                    <button
                      onClick={handleToggleWishlist}
                      className={`absolute top-4 right-4 z-20 p-2.5 rounded-full backdrop-blur-md transition-all duration-300 cursor-pointer ${
                        isLiked
                          ? 'bg-[#5A0015] text-[#E8C98A] shadow-md scale-110'
                          : 'bg-white/90 text-[#211A17] hover:bg-white hover:text-[#5A0015] hover:scale-105 shadow-sm'
                      }`}
                      aria-label="Toggle Wishlist"
                    >
                      <Heart size={18} className={isLiked ? 'fill-[#E8C98A]' : ''} />
                    </button>

                    <img
                      src={selectedImage || product.image}
                      alt={product.name}
                      className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                    />
                  </motion.div>

                  {/* Thumbnail Selector */}
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                    {product.image && (
                      <button
                        onClick={() => setSelectedImage(product.image)}
                        className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 bg-[#FAF7F2] cursor-pointer ${
                          selectedImage === product.image
                            ? 'border-[#2A0008] shadow-sm scale-102 ring-2 ring-[#E8C98A]/40'
                            : 'border-[#E8C98A]/30 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={product.image}
                          alt={`${product.name} main view`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}
                    {product.hoverImage && product.hoverImage !== product.image && (
                      <button
                        onClick={() => setSelectedImage(product.hoverImage)}
                        className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all shrink-0 bg-[#FAF7F2] cursor-pointer ${
                          selectedImage === product.hoverImage
                            ? 'border-[#2A0008] shadow-sm scale-102 ring-2 ring-[#E8C98A]/40'
                            : 'border-[#E8C98A]/30 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={product.hoverImage}
                          alt={`${product.name} alternate view`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Right Column: Product Details & Purchase Actions */}
                <div className="lg:col-span-6 space-y-6">
                  {/* Category & Rating */}
                  <div className="flex items-center justify-between gap-2 border-b border-[#E8C98A]/20 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B08D57]">
                      {product.category}
                    </span>
                    <StarRating
                      rating={product.rating}
                      size={15}
                      reviewCount={product.reviewCount}
                      showNumber
                    />
                  </div>

                  {/* Title & Slug Identifier */}
                  <div>
                    <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#211A17] tracking-tight">
                      {product.name}
                    </h1>
                    <p className="text-[11px] text-gray-400 font-mono mt-1">
                      SKU / Slug: {product.slug}
                    </p>
                  </div>

                  {/* Price Section */}
                  <div className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8C98A]/30 flex items-baseline gap-3">
                    <span className="font-serif text-3xl sm:text-4xl font-bold text-[#2A0008]">
                      {formatPrice(product.price)}
                    </span>
                    {product.originalPrice > product.price && (
                      <>
                        <span className="text-base text-gray-400 line-through font-normal">
                          {formatPrice(product.originalPrice)}
                        </span>
                        <span className="text-xs font-bold text-[#5A0015] uppercase bg-[#5A0015]/10 px-2.5 py-0.5 rounded-full">
                          Save {formatPrice(product.originalPrice - product.price)} (
                          {product.discountPercent}%)
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-[0.2em] text-[#B08D57] font-semibold">
                      Atelier Description
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-700 font-light leading-relaxed whitespace-pre-line">
                      {product.description}
                    </p>
                  </div>

                  {/* Product Specification Grid */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block">
                        Finish & Plating
                      </span>
                      <span className="text-xs font-semibold text-[#211A17] mt-0.5 block">
                        {product.details?.finish || product.finish || '24K Micron Gold Plated'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block">
                        Base Material
                      </span>
                      <span className="text-xs font-semibold text-[#211A17] mt-0.5 block">
                        {product.details?.baseMaterial || product.baseMaterial || 'Brass Alloy'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block">
                        Stone / Embellishment
                      </span>
                      <span className="text-xs font-semibold text-[#211A17] mt-0.5 block">
                        {product.details?.stoneType || product.stoneType || 'Faceted Cubic Zirconia / Kundan'}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold block">
                        Warranty Guarantee
                      </span>
                      <span className="text-xs font-semibold text-[#211A17] mt-0.5 block">
                        {product.details?.warranty || product.warranty || '6 Months Polish Guarantee'}
                      </span>
                    </div>
                  </div>

                  {/* Quantity & Action Buttons */}
                  <div className="space-y-4 pt-4 border-t border-[#E8C98A]/20">
                    <div className="flex items-center gap-4">
                      {/* Quantity Counter */}
                      <div className="flex items-center border border-[#E8C98A]/40 rounded-xl bg-[#FAF7F2] overflow-hidden">
                        <button
                          onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                          disabled={quantity <= 1}
                          className="px-3.5 py-2.5 text-[#211A17] hover:bg-[#E8C98A]/20 disabled:opacity-30 cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="px-4 text-xs font-bold text-[#211A17] font-mono">
                          {quantity}
                        </span>
                        <button
                          onClick={() => setQuantity((prev) => prev + 1)}
                          className="px-3.5 py-2.5 text-[#211A17] hover:bg-[#E8C98A]/20 cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Stock Status */}
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                        <span className="text-emerald-800">
                          {product.inStock !== false ? 'In Stock & Ready to Dispatch' : 'Backorder'}
                        </span>
                      </div>
                    </div>

                    {/* Add to Cart & Wishlist Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddToCart}
                        className={`flex-1 py-3.5 px-6 rounded-xl text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] flex items-center justify-center gap-2.5 transition-all duration-300 shadow-md cursor-pointer ${
                          addedToCart
                            ? 'bg-emerald-700 text-white shadow-emerald-700/30'
                            : 'bg-[#2A0008] text-[#F8F1E3] hover:bg-gradient-to-r hover:from-[#E8C98A] hover:to-[#C9A45D] hover:text-[#1C0106]'
                        }`}
                      >
                        {addedToCart ? (
                          <>
                            <Check size={18} />
                            <span>Added to Bag</span>
                          </>
                        ) : (
                          <>
                            <ShoppingBag size={18} />
                            <span>Add to Shopping Bag</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleToggleWishlist}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                          isLiked
                            ? 'bg-[#5A0015] border-[#5A0015] text-[#E8C98A] shadow-sm'
                            : 'border-[#E8C98A]/40 bg-[#FAF7F2] text-[#211A17] hover:bg-white hover:border-[#B08D57]'
                        }`}
                        aria-label="Wishlist toggle"
                      >
                        <Heart size={20} className={isLiked ? 'fill-[#E8C98A]' : ''} />
                      </button>
                    </div>
                  </div>

                  {/* Trust Reassurance Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-[#E8C98A]/20 text-[11px] text-gray-600 font-medium">
                    <div className="flex items-center gap-2">
                      <ShieldTick size={16} className="text-[#8C6C38] shrink-0" />
                      <span>24K Micron Gold</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-[#8C6C38] shrink-0" />
                      <span>Express Shipping</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RotateLeft size={16} className="text-[#8C6C38] shrink-0" />
                      <span>Easy 7-Day Exchange</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Related Products Section */}
              {relatedProducts.length > 0 && (
                <div className="pt-12 border-t border-[#E8C98A]/20">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[#B08D57] font-bold">
                        COMPLEMENTARY CREATIONS
                      </span>
                      <h3 className="font-serif text-2xl font-bold text-[#211A17] mt-0.5">
                        You May Also Admire
                      </h3>
                    </div>
                    <Link
                      to={`/shop?category=${encodeURIComponent(product.category)}`}
                      className="text-xs uppercase tracking-wider text-[#8C6C38] font-bold hover:underline"
                    >
                      View Category
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                    {relatedProducts.map((relProduct) => (
                      <ProductCard key={relProduct.id} product={relProduct} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </StorefrontLayout>
  );
};
