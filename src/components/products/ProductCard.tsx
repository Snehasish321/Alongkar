import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Eye, ShoppingBag, Check, Sparkles } from 'lucide-react';
import type { Product } from '../../types';
import { formatPrice } from '../../lib/utils';
import { StarRating } from '../ui/StarRating';
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
      className="group bg-white rounded-xl overflow-hidden border border-[#E8C98A]/25 hover:border-[#C9A45D]/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(42,0,8,0.1),0_0_20px_rgba(232,201,138,0.15)] transition-all duration-500 flex flex-col justify-between relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visual Frame Container */}
      <div className="relative aspect-[4/5] bg-[#FAF7F2] overflow-hidden cursor-pointer">
        {/* Luxury Badges */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
          {product.isBestSeller && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] uppercase font-semibold tracking-widest bg-[#2A0008] text-[#E8C98A] border border-[#E8C98A]/40 shadow-sm flex items-center gap-1">
              <Sparkles size={9} />
              <span>Bestseller</span>
            </span>
          )}
          {product.isNew && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] uppercase font-semibold tracking-widest bg-white/90 backdrop-blur-sm text-[#211A17] border border-[#B08D57]/30 shadow-sm">
              New In
            </span>
          )}
          {product.discountPercent > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider bg-[#5A0015] text-[#F8F1E3] shadow-sm">
              {product.discountPercent}% Off
            </span>
          )}
        </div>

        {/* Wishlist Heart Button with Heartbeat Feedback */}
        <button
          onClick={handleWishlist}
          className={`absolute top-3 right-3 z-20 p-2 rounded-full backdrop-blur-md transition-all duration-300 cursor-pointer ${
            isLiked
              ? 'bg-[#5A0015] text-[#E8C98A] shadow-md scale-110'
              : 'bg-white/85 text-[#211A17] hover:bg-white hover:text-[#5A0015] hover:scale-105 shadow-sm'
          }`}
          aria-label="Toggle Wishlist"
        >
          <Heart size={15} className={isLiked ? 'fill-[#E8C98A]' : ''} />
        </button>

        {/* Dual High-Resolution Image Presentation */}
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
          {/* Subtle warm luxury vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Floating Frosted Action Bar on Hover */}
        <div className="absolute inset-x-3 bottom-3 z-20 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 flex gap-2">
          <button
            onClick={() => onQuickView(product)}
            className="flex-1 py-2 px-2.5 bg-white/95 backdrop-blur-md text-[#2A0008] hover:bg-[#2A0008] hover:text-[#E8C98A] text-[11px] font-semibold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all duration-300 shadow-lg border border-[#E8C98A]/30 cursor-pointer"
          >
            <Eye size={13} />
            <span>Quick View</span>
          </button>
        </div>
      </div>

      {/* Product Details Section */}
      <div className="p-4 flex flex-col justify-between flex-1 bg-white">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B08D57]">
              {product.category}
            </span>
            <StarRating rating={product.rating} size={11} reviewCount={product.reviewCount} />
          </div>

          <h3
            onClick={() => onQuickView(product)}
            className="font-serif text-sm font-semibold text-[#211A17] line-clamp-1 hover:text-[#8C6C38] cursor-pointer transition-colors"
          >
            {product.name}
          </h3>

          <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5 font-light">
            {product.details.finish || '24K Micron Gold Plated'}
          </p>
        </div>

        {/* Pricing & Add To Bag */}
        <div className="mt-3 pt-3 border-t border-[#B08D57]/15 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-base font-bold text-[#2A0008]">
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
            className={`p-2 sm:px-3 sm:py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all duration-300 cursor-pointer shadow-sm ${
              added
                ? 'bg-emerald-700 text-white shadow-emerald-700/30'
                : 'bg-[#2A0008] text-[#F8F1E3] hover:bg-gradient-to-r hover:from-[#E8C98A] hover:to-[#C9A45D] hover:text-[#1C0106]'
            }`}
          >
            {added ? (
              <>
                <Check size={13} />
                <span className="text-[11px]">Added</span>
              </>
            ) : (
              <>
                <ShoppingBag size={13} />
                <span className="text-[11px]">Add</span>
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
