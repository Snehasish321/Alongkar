import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { formatPrice } from '../../lib/utils';
import type { Product } from '../../types';

interface FeaturedGridProps {
  title: string;
  viewAllLink?: string;
  products: Product[];
  showWishlist?: boolean;
}

export const FeaturedGrid: React.FC<FeaturedGridProps> = ({
  title,
  viewAllLink = '/shop',
  products,
  showWishlist,
}) => {
  const { addToCart } = useCart();
  const { wishlist, toggleWishlist, isInWishlist } = useWishlist();

  // Target only the Trending Masterworks section
  const isWishlistEnabled = showWishlist ?? title === 'Trending Masterworks';

  return (
    <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-neutral-950">
          {title}
        </h2>
        <Link
          to={viewAllLink}
          className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-neutral-500 hover:text-black transition-colors"
        >
          VIEW ALL
        </Link>
      </div>

      {/* 4-Item Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
        {products.slice(0, 4).map((product) => {
          const discount =
            product.discountPercent ||
            (product.originalPrice
              ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
              : 0);

          const isLiked = isInWishlist
            ? isInWishlist(product.id)
            : wishlist.some((p) => p.id === product.id);

          const handleWishlistClick = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product);
          };

          return (
            <div key={product.id} className="group flex flex-col">
              {/* Image Container */}
              <div className="relative aspect-square w-full rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-100 mb-3">
                <Link to={`/product/${product.id}`} className="block w-full h-full">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  {product.hoverImage && (
                    <img
                      src={product.hoverImage}
                      alt={`${product.name} alternate view`}
                      className="absolute inset-0 w-full h-full object-cover object-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      loading="lazy"
                    />
                  )}
                </Link>

                {/* Wishlist Button - Only on Trending Masterworks */}
                {isWishlistEnabled && (
                  <button
                    onClick={handleWishlistClick}
                    className={`absolute top-3 right-3 z-10 p-2 rounded-full backdrop-blur-xs transition-all duration-200 cursor-pointer shadow-xs ${
                      isLiked
                        ? 'bg-[#5A0015] text-[#E8C98A] shadow-md scale-105'
                        : 'bg-white/90 text-neutral-800 hover:bg-white hover:text-[#5A0015] hover:scale-105'
                    }`}
                    aria-label={isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    <Heart size={15} className={isLiked ? 'fill-[#E8C98A]' : ''} />
                  </button>
                )}

                {/* Subtle SALE Tag */}
                {discount > 0 && (
                  <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs text-neutral-900 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                    SALE
                  </div>
                )}

                {/* Quick Add Button on Hover */}
                <button
                  onClick={() => addToCart(product)}
                  className="absolute bottom-3 inset-x-3 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 hover:bg-neutral-800 shadow-md cursor-pointer"
                >
                  Quick Add
                </button>
              </div>

              {/* Product Info */}
              <Link to={`/product/${product.id}`} className="flex flex-col flex-1">
                <h3 className="text-xs sm:text-sm font-medium text-neutral-800 line-clamp-1 group-hover:text-black transition-colors">
                  {product.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs sm:text-sm font-semibold text-neutral-950">
                    {formatPrice(product.price)}
                  </span>
                  {product.originalPrice && product.originalPrice > product.price && (
                    <span className="text-[11px] sm:text-xs text-neutral-400 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
};
