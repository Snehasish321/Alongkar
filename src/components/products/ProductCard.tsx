import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Eye, ShoppingBag, Check } from 'lucide-react';
import type { Product } from '../../types';
import { formatPrice } from '../../lib/utils';
import { StarRating } from '../ui/StarRating';
import { Badge } from '../ui/Badge';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

interface ProductCardProps {
  product: Product;
  onQuickView: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onQuickView }) => {

  const [isHovered, setIsHovered] = useState(false);
  const [added, setAdded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [hoverImageError, setHoverImageError] = useState(false);
  const { addToCart } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();

  const fallbackImage = 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop';
  const displayImage = imageError ? fallbackImage : (product.image || fallbackImage);
  const displayHoverImage = hoverImageError ? displayImage : (product.hoverImage || displayImage);

  const isLiked = wishlist.some((p) => p.id === product.id);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product);
  };


  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="group bg-ivory-pearl rounded-brand overflow-hidden border border-gold/15 shadow-soft hover:shadow-elevated transition-all duration-300 flex flex-col justify-between"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visual Container */}
      <div className="relative aspect-[4/5] bg-ivory-soft overflow-hidden cursor-pointer">
        {/* Badges */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
          {product.isBestSeller && <Badge variant="gold">Best Seller</Badge>}
          {product.isNew && <Badge variant="dark">New Arrival</Badge>}
          {product.discountPercent > 0 && (
            <Badge variant="burgundy">{product.discountPercent}% OFF</Badge>
          )}
        </div>

        {/* Wishlist Heart Button */}
        <button
          onClick={handleWishlist}
          className={`absolute top-3 right-3 z-20 p-2 rounded-full backdrop-blur-md transition-all duration-300 ${
            isLiked
              ? 'bg-ivory text-burgundy shadow-md scale-110'
              : 'bg-ivory/80 text-espresso hover:bg-ivory hover:text-burgundy'
          }`}
          aria-label="Toggle Wishlist"
        >
          <Heart size={16} className={isLiked ? 'fill-burgundy' : ''} />
        </button>

        {/* Main Image with Hover Reveal */}
        <div onClick={() => onQuickView(product)} className="w-full h-full relative">
          <img
            src={displayImage}
            alt={product.name}
            onError={() => setImageError(true)}
            className={`w-full h-full object-cover transition-all duration-700 ${
              isHovered ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
            }`}
            loading="lazy"
          />
          <img
            src={displayHoverImage}
            alt={`${product.name} alternate view`}
            onError={() => setHoverImageError(true)}
            className={`w-full h-full object-cover absolute inset-0 transition-all duration-700 ${
              isHovered ? 'opacity-100 scale-105' : 'opacity-0 scale-100'
            }`}
            loading="lazy"
          />
        </div>

        {/* Hover Quick Action overlay button */}
        <div className="absolute inset-x-0 bottom-3 px-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2">
          <button
            onClick={() => onQuickView(product)}
            className="flex-1 py-2 px-3 bg-ivory/90 backdrop-blur-md text-espresso hover:bg-espresso hover:text-ivory-pearl text-xs font-semibold uppercase tracking-wider rounded-brand flex items-center justify-center gap-1.5 transition-colors border border-espresso/20 shadow-md"
          >
            <Eye size={14} />
            <span>Quick View</span>
          </button>
        </div>
      </div>

      {/* Details Container */}
      <div className="p-4 flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gold">
              {product.category}
            </span>
            <StarRating rating={product.rating} size={12} reviewCount={product.reviewCount} />
          </div>

          <h3
            onClick={() => onQuickView(product)}
            className="font-serif text-sm font-semibold text-espresso line-clamp-1 hover:text-gold cursor-pointer transition-colors"
          >
            {product.name}
          </h3>

          <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
            {product.details.finish}
          </p>
        </div>

        {/* Pricing & Add To Bag */}
        <div className="mt-3 pt-3 border-t border-gold/10 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-base font-bold text-espresso">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice > product.price && (
                <span className="text-xs text-gray-400 line-through font-normal">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleAdd}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-brand text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all duration-300 ${
              added
                ? 'bg-emerald-700 text-white'
                : 'bg-espresso text-ivory-pearl hover:bg-gold hover:text-espresso'
            }`}
          >
            {added ? (
              <>
                <Check size={14} />
                <span className="hidden sm:inline">Added</span>
              </>
            ) : (
              <>
                <ShoppingBag size={14} />
                <span className="hidden sm:inline">Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
