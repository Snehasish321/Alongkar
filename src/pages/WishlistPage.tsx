import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  ShoppingBag,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../lib/utils';
import { productsData } from '../data/products';
import { ProductCard } from '../components/products/ProductCard';
import type { Product } from '../types';

export const WishlistPage: React.FC = () => {
  const { wishlist, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();
  const [movedId, setMovedId] = useState<string | null>(null);

  const handleMoveToBag = (product: Product) => {
    addToCart(product, 1);
    setMovedId(product.id);
    setTimeout(() => {
      toggleWishlist(product);
      setMovedId(null);
    }, 600);
  };

  const handleMoveAllToBag = () => {
    wishlist.forEach((product) => {
      addToCart(product, 1);
      toggleWishlist(product);
    });
  };

  // Curated recommendations if wishlist is empty
  const recommendedProducts = productsData.filter((p) => p.isBestSeller).slice(0, 4);

  return (
    <StorefrontLayout>
      <div className="min-h-screen bg-[#FFFDF8] text-[#211A17]">
        
        {/* ── Breadcrumb & Header ── */}
        <section className="border-b border-[#E8C98A]/25 bg-gradient-to-b from-[#F7F2EA]/60 to-[#FFFDF8] py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <nav className="flex items-center gap-2 text-xs text-[#8C6C38] mb-3">
              <Link to="/" className="hover:text-[#211A17] transition-colors">
                Home
              </Link>
              <span>/</span>
              <Link to="/shop" className="hover:text-[#211A17] transition-colors">
                Shop
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#211A17]">Wishlist</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal text-[#211A17] tracking-tight">
                  Your Wishlist
                  {wishlist.length > 0 && (
                    <span className="text-base sm:text-lg text-[#8C6C38] font-sans font-light ml-3">
                      ({wishlist.length} {wishlist.length === 1 ? 'piece' : 'pieces'})
                    </span>
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-[#8C6C38] font-light mt-1">
                  Saved jewellery adornments to curate or add to your collection
                </p>
              </div>

              {wishlist.length > 0 && (
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    type="button"
                    onClick={handleMoveAllToBag}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#211A17] text-[#FAF7F2] text-xs font-semibold uppercase tracking-wider hover:bg-[#3D0010] transition-all shadow-xs cursor-pointer"
                  >
                    <ShoppingBag size={14} className="text-[#E8C98A]" />
                    <span>Move All to Bag</span>
                  </button>
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#8C6C38] hover:text-[#211A17] transition-colors font-medium"
                  >
                    <ArrowLeft size={13} />
                    <span>Continue Shopping</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Main Content ── */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          
          {wishlist.length === 0 ? (
            /* ── Empty Wishlist State ── */
            <div className="py-12 sm:py-16 text-center max-w-xl mx-auto">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#B08D57]">
                <Heart size={34} strokeWidth={1.5} className="text-[#B08D57]" />
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal mb-3">
                Your Wishlist is Empty
              </h2>
              <p className="text-xs sm:text-sm text-[#8C6C38] leading-relaxed mb-8 max-w-md mx-auto font-light">
                Save your favourite 24K city gold necklaces, artisan jhumkas, and temple kadas by tapping the heart icon on any piece.
              </p>
              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#211A17] text-[#FAF7F2] text-xs font-semibold uppercase tracking-[0.2em] hover:bg-[#3D0010] transition-all shadow-md"
              >
                <span>Discover Jewellery</span>
                <ArrowRight size={14} />
              </Link>

              {/* Recommended Items */}
              <div className="mt-20 text-left pt-12 border-t border-[#E8C98A]/25">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block">
                      Trending Now
                    </span>
                    <h3 className="font-serif text-xl text-[#211A17]">Atelier Bestsellers</h3>
                  </div>
                  <Link to="/shop" className="text-xs text-[#8C6C38] hover:text-[#211A17] font-medium">
                    View Catalogue →
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {recommendedProducts.map((prod) => (
                    <ProductCard key={prod.id} product={prod} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── Wishlist Grid ── */
            <div className="space-y-10">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
                {wishlist.map((product) => {
                  const isMoving = movedId === product.id;

                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-2xl border border-[#E8C98A]/25 hover:border-[#B08D57]/60 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden relative"
                    >
                      {/* Image & Quick Badges */}
                      <div className="relative aspect-[4/5] bg-[#FAF7F2] overflow-hidden">
                        
                        {/* Remove Wishlist Button */}
                        <button
                          type="button"
                          onClick={() => toggleWishlist(product)}
                          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-neutral-400 hover:text-red-700 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                          aria-label={`Remove ${product.name} from wishlist`}
                          title="Remove from wishlist"
                        >
                          <Trash2 size={14} />
                        </button>

                        {/* Badges */}
                        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 pointer-events-none">
                          {product.isBestSeller && (
                            <span className="text-[9px] font-bold bg-[#211A17] text-[#E8C98A] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                              Bestseller
                            </span>
                          )}
                          {product.isNew && (
                            <span className="text-[9px] font-bold bg-[#E8C98A] text-[#211A17] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                              New
                            </span>
                          )}
                          {product.discountPercent > 0 && (
                            <span className="text-[9px] font-bold bg-[#5A0015] text-[#F8F1E3] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                              {product.discountPercent}% Off
                            </span>
                          )}
                        </div>

                        {/* Clickable Image */}
                        <Link
                          to={`/product/${product.slug || product.id}`}
                          className="w-full h-full block cursor-pointer"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                            loading="lazy"
                          />
                        </Link>
                      </div>

                      {/* Product Metadata & Actions */}
                      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between bg-white">
                        <div>
                          <span className="text-[10px] text-[#B08D57] font-bold uppercase tracking-wider block mb-1">
                            {product.category}
                          </span>
                          
                          <Link
                            to={`/product/${product.slug || product.id}`}
                            className="font-serif text-sm sm:text-base font-medium text-[#211A17] hover:text-[#8C6C38] transition-colors line-clamp-2 leading-snug"
                          >
                            {product.name}
                          </Link>

                          {/* Attribute tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {product.details?.finish && (
                              <span className="text-[10px] px-2 py-0.5 rounded-sm bg-[#FAF0DC] text-[#63481A] font-medium border border-[#E8C98A]/30">
                                {product.details.finish}
                              </span>
                            )}
                            {product.details?.stoneType && (
                              <span className="text-[10px] px-2 py-0.5 rounded-sm bg-white text-[#8C6C38] font-medium border border-[#E8C98A]/30">
                                {product.details.stoneType}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-[#E8C98A]/20">
                          {/* Price Display */}
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-base font-bold text-[#211A17] font-mono">
                              {formatPrice(product.price)}
                            </span>
                            {product.originalPrice > product.price && (
                              <span className="text-xs text-neutral-400 line-through font-mono">
                                {formatPrice(product.originalPrice)}
                              </span>
                            )}
                          </div>

                          {/* Move to Bag Button */}
                          <button
                            type="button"
                            onClick={() => handleMoveToBag(product)}
                            disabled={isMoving}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                              isMoving
                                ? 'bg-emerald-700 text-white shadow-emerald-700/20'
                                : 'bg-[#211A17] text-[#FAF7F2] hover:bg-[#3D0010] active:scale-[0.99]'
                            }`}
                          >
                            {isMoving ? (
                              <>
                                <Check size={14} />
                                <span>Moved to Bag</span>
                              </>
                            ) : (
                              <>
                                <ShoppingBag size={14} className="text-[#E8C98A]" />
                                <span>Move to Bag</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Atelier Trust Footnote */}
              <div className="p-6 rounded-2xl bg-[#FAF7F2] border border-[#E8C98A]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#B08D57] shadow-xs flex-shrink-0">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h4 className="font-serif text-sm font-semibold text-[#211A17]">Alongkar Atelier Assurance</h4>
                    <p className="text-xs text-[#8C6C38] font-light mt-0.5">
                      Every piece is protected by our 6-month polish guarantee and complimentary luxury velvet box unboxing.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-[#211A17] flex-shrink-0">
                  <ShieldCheck size={16} className="text-[#B08D57]" />
                  <span>Insured Pan-India Transit</span>
                </div>
              </div>

            </div>
          )}

        </main>
      </div>
    </StorefrontLayout>
  );
};
