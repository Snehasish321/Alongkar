import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { productsData } from '../../data/products';
import { formatPrice } from '../../lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (productId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectProduct }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const filteredProducts = query.trim()
    ? productsData.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.category.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const popularSearches = ['Choker Set', 'Chandbali Jhumkas', 'Solitaire Ring', 'Emerald Kundan', 'Gold Kadas'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-espresso/70 backdrop-blur-md z-50 flex items-start justify-center pt-16 sm:pt-24 px-4"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed top-12 sm:top-20 z-50 w-full max-w-2xl bg-ivory rounded-brand shadow-2xl border border-gold/30 overflow-hidden"
            data-lenis-prevent
          >
            {/* Input Bar */}
            <div className="p-4 sm:p-5 border-b border-gold/20 flex items-center gap-3 bg-ivory-pearl">
              <Search size={22} className="text-gold flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jewellery, categories, Kundan, Jhumkas..."
                className="w-full bg-transparent text-sm sm:text-base text-espresso placeholder:text-gray-400 focus:outline-none font-medium"
                autoFocus
              />
              {query ? (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-espresso p-1">
                  <X size={18} />
                </button>
              ) : (
                <button onClick={onClose} className="text-gray-400 hover:text-espresso p-1">
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Content Body */}
            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-5">
              {!query.trim() ? (
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gold font-semibold mb-3">
                    <Sparkles size={14} />
                    <span>Popular Searches</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="text-xs bg-ivory-soft hover:bg-gold/20 text-espresso px-3 py-1.5 rounded-full border border-gold/15 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-3 font-medium">
                    <span>Search Results ({filteredProducts.length})</span>
                    {filteredProducts.length > 0 && (
                      <button
                        onClick={() => {
                          onClose();
                          navigate('/shop');
                        }}
                        className="text-gold font-semibold flex items-center gap-1 hover:underline"
                      >
                        View all in Shop <ArrowRight size={12} />
                      </button>
                    )}
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 text-sm">
                      No jewellery found matching &quot;{query}&quot;. Try searching for Kundan, Jhumkas, or Rings.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredProducts.slice(0, 6).map((product) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            onClose();
                            onSelectProduct(product.id);
                          }}
                          className="flex items-center gap-3 p-2.5 rounded-brand bg-ivory-pearl border border-gold/10 hover:border-gold/40 hover:shadow-soft cursor-pointer transition-all"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-12 h-14 object-cover rounded-brand border border-gold/10"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-serif font-semibold text-espresso truncate">
                              {product.name}
                            </h4>
                            <p className="text-xs text-gold font-bold mt-0.5">
                              {formatPrice(product.price)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
