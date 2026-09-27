import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../../services/productApi';
import type { Product } from '../../types';
import { formatPrice } from '../../lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (slugOrId: string) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectProduct }) => {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Load products when search modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadCatalog() {
      try {
        setIsLoading(true);
        const data = await fetchProducts();
        if (isMounted) {
          setProducts(data);
        }
      } catch (err) {
        console.error('Failed to fetch products for search modal:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const filteredProducts = query.trim()
    ? products.filter(
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
            className="fixed inset-0 bg-[#2A0008]/70 backdrop-blur-md z-50 flex items-start justify-center pt-16 sm:pt-24 px-4"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed top-12 sm:top-20 z-50 w-full max-w-2xl bg-[#FFFDF8] rounded-xl shadow-2xl border border-[#E8C98A]/30 overflow-hidden"
            data-lenis-prevent
          >
            {/* Input Bar */}
            <div className="p-4 sm:p-5 border-b border-[#E8C98A]/20 flex items-center gap-3 bg-[#FAF7F2]">
              {isLoading ? (
                <Loader2 size={22} className="text-[#B08D57] animate-spin flex-shrink-0" />
              ) : (
                <Search size={22} className="text-[#B08D57] flex-shrink-0" />
              )}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jewellery, categories, Kundan, Jhumkas..."
                className="w-full bg-transparent text-sm sm:text-base text-[#211A17] placeholder:text-gray-400 focus:outline-none font-medium"
                autoFocus
              />
              {query ? (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-[#211A17] p-1 cursor-pointer">
                  <X size={18} />
                </button>
              ) : (
                <button onClick={onClose} className="text-gray-400 hover:text-[#211A17] p-1 cursor-pointer">
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Content Body */}
            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-5">
              {!query.trim() ? (
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-[#B08D57] font-semibold mb-3">
                    <Sparkles size={14} />
                    <span>Popular Searches</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularSearches.map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="text-xs bg-[#FAF7F2] hover:bg-[#E8C98A]/20 text-[#211A17] px-3 py-1.5 rounded-full border border-[#E8C98A]/20 transition-colors cursor-pointer"
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
                        className="text-[#8C6C38] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
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
                            onSelectProduct(product.slug || product.id);
                          }}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8C98A]/20 hover:border-[#B08D57]/60 hover:shadow-sm cursor-pointer transition-all"
                        >
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-12 h-14 object-cover rounded-lg border border-[#E8C98A]/20 bg-white"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-serif font-semibold text-[#211A17] truncate">
                              {product.name}
                            </h4>
                            <p className="text-xs text-[#8C6C38] font-bold mt-0.5">
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
