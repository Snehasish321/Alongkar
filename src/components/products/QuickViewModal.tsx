import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, ShoppingBag, ShieldCheck, RefreshCw, Check } from 'lucide-react';
import type { Product } from '../../types';
import { formatPrice } from '../../lib/utils';
import { StarRating } from '../ui/StarRating';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

import { useAlongkarAuth } from '../../context/AuthContext';

interface QuickViewModalProps {
  product: Product | null;
  onClose: () => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({ product, onClose }) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const [imageErrors, setImageErrors] = useState<{ [idx: number]: boolean }>({});
  const { addToCart } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();
  const { executeActionWithAuth } = useAlongkarAuth();

  if (!product) return null;

  const fallbackImage = 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop';
  const images = [product.image, product.hoverImage].filter(Boolean);
  const isLiked = wishlist.some((p) => p.id === product.id);

  const getImageUrl = (url: string, idx: number) => {
    return imageErrors[idx] ? fallbackImage : (url || fallbackImage);
  };

  const handleAddToCart = () => {
    executeActionWithAuth(
      () => {
        addToCart(product);
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
      },
      { type: 'cart', product }
    );
  };

  const handleToggleWishlist = () => {
    executeActionWithAuth(
      () => {
        toggleWishlist(product);
      },
      { type: 'wishlist', product }
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-espresso/70 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 250 }}
          className="relative w-full max-w-4xl bg-ivory rounded-brand shadow-2xl border border-gold/30 overflow-hidden z-10 my-8"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 bg-ivory-pearl/80 hover:bg-espresso hover:text-ivory-pearl text-espresso rounded-full transition-colors shadow-md"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Gallery Column */}
            <div className="p-6 bg-ivory-pearl flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-gold/15">
              <div className="relative w-full aspect-square rounded-brand overflow-hidden border border-gold/20 mb-4 bg-ivory-soft">
                <img
                  src={getImageUrl(images[activeImageIndex], activeImageIndex)}
                  alt={product.name}
                  onError={() => setImageErrors((prev) => ({ ...prev, [activeImageIndex]: true }))}
                  className="w-full h-full object-cover transition-all duration-300"
                />
                <button
                  onClick={handleToggleWishlist}
                  className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur-md transition-colors ${
                    isLiked ? 'bg-ivory text-burgundy' : 'bg-ivory/80 text-espresso hover:text-burgundy'
                  }`}
                >
                  <Heart size={18} className={isLiked ? 'fill-burgundy' : ''} />
                </button>
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-3">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`w-16 h-16 rounded-brand overflow-hidden border-2 transition-all ${
                        activeImageIndex === idx ? 'border-gold scale-105' : 'border-transparent opacity-70'
                      }`}
                    >
                      <img
                        src={getImageUrl(img, idx)}
                        alt="thumbnail"
                        onError={() => setImageErrors((prev) => ({ ...prev, [idx]: true }))}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Details Column */}
            <div className="p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="gold" className="uppercase tracking-widest text-[10px]">
                    {product.category}
                  </Badge>
                  {product.isBestSeller && <Badge variant="dark">Best Seller</Badge>}
                </div>

                <h2 className="font-serif text-2xl font-bold text-espresso leading-snug">
                  {product.name}
                </h2>

                <div className="flex items-center gap-3 mt-2 mb-4">
                  <StarRating rating={product.rating} showNumber reviewCount={product.reviewCount} />
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <Check size={14} /> In Stock
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3 mb-4 pb-4 border-b border-gold/15">
                  <span className="font-serif text-3xl font-bold text-espresso">
                    {formatPrice(product.price)}
                  </span>
                  {product.originalPrice > product.price && (
                    <span className="text-base text-gray-400 line-through font-normal">
                      {formatPrice(product.originalPrice)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-burgundy bg-burgundy/10 px-2 py-0.5 rounded">
                    Save {product.discountPercent}%
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm text-espresso-light leading-relaxed mb-6">
                  {product.description}
                </p>

                {/* Specifications Grid */}
                <div className="bg-ivory-soft p-4 rounded-brand border border-gold/15 mb-6 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Finish:</span>
                    <span className="font-semibold text-espresso">{product.details.finish}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Base Material:</span>
                    <span className="font-semibold text-espresso">{product.details.baseMaterial}</span>
                  </div>
                  {product.details.stoneType && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Stone Work:</span>
                      <span className="font-semibold text-espresso">{product.details.stoneType}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Guarantee:</span>
                    <span className="font-semibold text-gold">{product.details.warranty}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  variant="gold"
                  fullWidth
                  size="lg"
                  onClick={handleAddToCart}
                  className="gap-2"
                >
                  {added ? (
                    <>
                      <Check size={18} />
                      <span>ADDED TO BAG!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={18} />
                      <span>ADD TO SHOPPING BAG</span>
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-around text-[11px] text-gray-500 pt-2 border-t border-gold/10">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={14} className="text-gold" /> Quality Inspected
                  </span>
                  <span className="flex items-center gap-1">
                    <RefreshCw size={14} className="text-gold" /> 7-Day Replacement
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
