import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../lib/utils';
import { Button } from '../ui/Button';

export const WishlistDrawer: React.FC = () => {
  const { wishlist, isWishlistOpen, setIsWishlistOpen, toggleWishlist } = useWishlist();
  const { addToCart } = useCart();

  return (
    <AnimatePresence>
      {isWishlistOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsWishlistOpen(false)}
            className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[400px] bg-ivory text-espresso z-50 flex flex-col justify-between shadow-2xl border-l border-gold/20"
            data-lenis-prevent
          >
            {/* Header */}
            <div className="p-5 border-b border-gold/20 flex items-center justify-between bg-ivory-pearl">
              <div className="flex items-center gap-2">
                <Heart size={18} className="text-gold fill-gold" />
                <h3 className="font-serif text-lg font-semibold tracking-wide">
                  Your Wishlist ({wishlist.length})
                </h3>
              </div>
              <button
                onClick={() => setIsWishlistOpen(false)}
                className="p-1.5 text-espresso hover:text-gold transition-colors rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {wishlist.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-espresso/60 space-y-3">
                  <Heart size={48} className="text-gold/40 stroke-1" />
                  <p className="font-serif text-lg text-espresso">Your wishlist is empty</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    Save your favorite city gold adornments by clicking the heart icon on any product.
                  </p>
                  <Button
                    variant="gold"
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsWishlistOpen(false)}
                  >
                    Discover Products
                  </Button>
                </div>
              ) : (
                wishlist.map((product) => (
                  <div
                    key={product.id}
                    className="p-3 bg-ivory-pearl rounded-brand border border-gold/15 flex gap-3 items-center shadow-soft"
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-16 h-20 object-cover rounded-brand border border-gold/10 bg-ivory-soft flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-serif font-semibold text-espresso truncate">
                        {product.name}
                      </h4>
                      <p className="text-xs text-gold font-bold mt-1">
                        {formatPrice(product.price)}
                        <span className="text-[10px] text-gray-400 line-through ml-1 font-normal">
                          {formatPrice(product.originalPrice)}
                        </span>
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => {
                            addToCart(product);
                            toggleWishlist(product);
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium bg-espresso text-ivory-pearl px-2.5 py-1 rounded-brand hover:bg-gold transition-colors"
                        >
                          <ShoppingBag size={12} />
                          <span>Move to Bag</span>
                        </button>
                        <button
                          onClick={() => toggleWishlist(product)}
                          className="text-gray-400 hover:text-burgundy p-1 transition-colors"
                          aria-label="Remove from wishlist"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

