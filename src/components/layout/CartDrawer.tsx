import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Plus, Minus, ShoppingBag, ShieldCheck, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../lib/utils';
import { Button } from '../ui/Button';

export const CartDrawer: React.FC = () => {
  const { cart, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, totalAmount, totalItems } = useCart();

  const freeShippingThreshold = 499;
  const progressToFreeShipping = Math.min(100, (totalAmount / freeShippingThreshold) * 100);
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - totalAmount);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCartOpen(false)}
            className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50"
          />

          {/* Slide-over Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-ivory text-espresso z-50 flex flex-col justify-between shadow-2xl border-l border-gold/20"
          >
            {/* Header */}
            <div className="p-5 border-b border-gold/20 flex items-center justify-between bg-ivory-pearl">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} className="text-gold" />
                <h3 className="font-serif text-lg font-semibold tracking-wide">
                  Your Shopping Bag ({totalItems})
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 text-espresso hover:text-gold transition-colors rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            {/* Free Shipping Progress Indicator */}
            <div className="bg-ivory-soft p-3.5 border-b border-gold/10 px-5">
              <div className="flex justify-between text-xs mb-1.5 font-medium">
                {remainingForFreeShipping === 0 ? (
                  <span className="text-gold font-semibold flex items-center gap-1">
                    ✨ Congratulations! You unlocked Free Delivery!
                  </span>
                ) : (
                  <span>
                    Add <strong className="text-gold">{formatPrice(remainingForFreeShipping)}</strong> more for FREE Shipping!
                  </span>
                )}
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold transition-all duration-500 rounded-full"
                  style={{ width: `${progressToFreeShipping}%` }}
                />
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-gold/10">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-espresso/60 space-y-3">
                  <ShoppingBag size={48} className="text-gold/40 stroke-1" />
                  <p className="font-serif text-lg text-espresso">Your bag is currently empty</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    Explore our exquisite city gold collections and add timeless adornments to your bag.
                  </p>
                  <Button
                    variant="gold"
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsCartOpen(false)}
                  >
                    Explore Shop
                  </Button>
                </div>
              ) : (
                cart.map(({ product, quantity }) => (
                  <div key={product.id} className="pt-4 first:pt-0 flex gap-4">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-20 h-24 object-cover rounded-brand border border-gold/20 flex-shrink-0 bg-ivory-soft"
                    />

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs sm:text-sm font-medium text-espresso font-serif line-clamp-2">
                            {product.name}
                          </h4>
                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="text-gray-400 hover:text-burgundy transition-colors p-1"
                            aria-label="Remove item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <p className="text-[11px] text-gold font-medium mt-1">
                          {product.details.finish}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {/* Quantity Counter */}
                        <div className="flex items-center border border-espresso/20 rounded-brand bg-ivory-pearl">
                          <button
                            onClick={() => updateQuantity(product.id, quantity - 1)}
                            className="p-1 hover:bg-gold/10 text-espresso transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="px-2.5 text-xs font-semibold">{quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                            className="p-1 hover:bg-gold/10 text-espresso transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-bold text-espresso">
                            {formatPrice(product.price * quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary */}
            {cart.length > 0 && (
              <div className="p-5 bg-ivory-pearl border-t border-gold/20 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-espresso-light">
                    <span>Subtotal</span>
                    <span className="font-semibold text-espresso">{formatPrice(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-espresso-light">
                    <span>Shipping</span>
                    <span className="text-gold font-semibold">
                      {remainingForFreeShipping === 0 ? 'FREE' : formatPrice(60)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-gold/10 text-espresso">
                    <span>Total Amount</span>
                    <span className="text-gold-dark font-serif text-base">{formatPrice(totalAmount)}</span>
                  </div>
                </div>

                <Button
                  variant="gold"
                  fullWidth
                  size="lg"
                  className="mt-2 group"
                  onClick={() => {
                    alert('Proceeding to Checkout! (Frontend Demonstration Mode)');
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    PROCEED TO CHECKOUT
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>

                <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500 pt-1">
                  <ShieldCheck size={14} className="text-gold" />
                  <span>100% Secure Checkout • Quality Guaranteed</span>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
