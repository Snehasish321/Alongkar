import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../../services/productApi';
import { productsData } from '../../data/products';
import type { Product } from '../../types';
import { formatPrice } from '../../lib/utils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (slugOrId: string) => void;
}

const POPULAR_SEARCHES = [
  'Choker Set',
  'Chandbali Jhumkas',
  'Solitaire Ring',
  'Emerald Kundan',
  'Gold Kadas',
  'Temple Necklace',
  'Polki Earrings',
];

/** Highlight query match inside text */
function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#E8C98A]/50 text-[#211A17] rounded-sm px-0.5 not-italic font-semibold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** Score how well a product matches a query — higher = better match */
function scoreProduct(p: Product, q: string): number {
  const lq = q.toLowerCase().trim();
  if (!lq) return 0;
  let score = 0;
  if (p.name.toLowerCase().includes(lq)) score += 10;
  if (p.name.toLowerCase().startsWith(lq)) score += 5;
  if (p.category.toLowerCase().includes(lq)) score += 6;
  if (p.description.toLowerCase().includes(lq)) score += 3;
  if (p.slug?.toLowerCase().includes(lq)) score += 4;
  if (p.collectionId?.toLowerCase().replace(/-/g, ' ').includes(lq)) score += 3;
  if (p.details?.stoneType?.toLowerCase().includes(lq)) score += 4;
  if (p.details?.finish?.toLowerCase().includes(lq)) score += 2;
  if (p.details?.baseMaterial?.toLowerCase().includes(lq)) score += 2;
  return score;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectProduct }) => {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Product[]>(productsData); // seed with local data immediately
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Try to fetch fresh DB products in background; fall back silently to local data
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetchProducts()
      .then((data) => {
        if (alive && data.length > 0) setCatalog(data);
      })
      .catch(() => {
        // silently use local catalog already seeded
      });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  // Reset query on close
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return catalog
      .map((p) => ({ product: p, score: scoreProduct(p, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);
  }, [query, catalog]);

  const categoryLabel = (cat: string) =>
    cat.charAt(0).toUpperCase() + cat.slice(1);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — neutral dark, not red */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
      />

      {/* Modal */}
      <div
        className="fixed top-12 sm:top-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-[#E8C98A]/25 animate-modal-pop"
        style={{ background: 'linear-gradient(145deg, #FFFDF8 0%, #FAF7F2 100%)' }}
        data-lenis-prevent
      >
        {/* Search input bar */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-[#E8C98A]/20">
          <Search size={20} className="text-[#B08D57] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jewellery, Kundan, Jhumkas, Rings…"
            className="flex-1 bg-transparent text-sm sm:text-base text-[#211A17] placeholder:text-[#A89070]/60 focus:outline-none font-medium"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#E8C98A]/20 text-gray-400 hover:text-[#211A17] transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#E8C98A]/20 text-gray-400 hover:text-[#211A17] transition-colors cursor-pointer"
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto">
          {!query.trim() ? (
            /* ── Popular searches ── */
            <div className="p-5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[#B08D57] font-bold mb-3">
                <TrendingUp size={12} />
                <span>Popular Searches</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((term) => (
                  <button
                    key={term}
                    onClick={() => setQuery(term)}
                    className="text-xs text-[#5C4A2A] bg-[#F5EDD9] hover:bg-[#E8C98A]/40 px-3 py-1.5 rounded-full border border-[#E8C98A]/30 hover:border-[#B08D57]/50 transition-all cursor-pointer font-medium"
                  >
                    {term}
                  </button>
                ))}
              </div>

              {/* Quick category browse */}
              <div className="mt-5 pt-4 border-t border-[#E8C98A]/15">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[#B08D57] font-bold mb-3">
                  <Sparkles size={12} />
                  <span>Browse Categories</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Sets'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        onClose();
                        navigate(`/shop?category=${cat.toLowerCase()}`);
                      }}
                      className="text-xs text-[#8C6C38] bg-white hover:bg-[#FAF0DC] px-3 py-1.5 rounded-full border border-[#E8C98A]/30 hover:border-[#B08D57]/40 transition-all cursor-pointer font-medium flex items-center gap-1"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : results.length === 0 ? (
            /* ── No results ── */
            <div className="py-12 text-center px-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#F5EDD9] flex items-center justify-center">
                <Search size={24} className="text-[#C9A45D]" />
              </div>
              <p className="text-[#5C4A2A] font-semibold text-sm">No results for "{query}"</p>
              <p className="text-[#A89070] text-xs mt-1.5">Try Kundan, Jhumkas, Rings, or Choker</p>
              <button
                onClick={() => {
                  onClose();
                  navigate('/shop');
                }}
                className="mt-4 text-xs text-[#8C6C38] font-semibold underline underline-offset-2 hover:text-[#211A17] transition-colors cursor-pointer"
              >
                Browse all jewellery →
              </button>
            </div>
          ) : (
            /* ── Results grid ── */
            <div className="p-4 sm:p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] uppercase tracking-[0.15em] text-[#B08D57] font-bold">
                  {results.length} Result{results.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => { onClose(); navigate('/shop'); }}
                  className="text-xs text-[#8C6C38] font-semibold flex items-center gap-1 hover:text-[#211A17] transition-colors cursor-pointer"
                >
                  View all in Shop <ArrowRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {results.slice(0, 8).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => { onClose(); onSelectProduct(product.slug || product.id); }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E8C98A]/20 hover:border-[#B08D57]/50 hover:shadow-md text-left transition-all duration-150 cursor-pointer group w-full"
                  >
                    {/* Product image */}
                    <div className="w-12 h-14 flex-shrink-0 rounded-lg overflow-hidden border border-[#E8C98A]/20 bg-[#FAF7F2]">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-[#B08D57] font-semibold uppercase tracking-wide mb-0.5">
                        {categoryLabel(product.category)}
                      </p>
                      <h4 className="text-xs font-serif font-semibold text-[#211A17] leading-snug line-clamp-2">
                        {highlight(product.name, query)}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-[#8C6C38] font-bold">
                          {formatPrice(product.price)}
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[10px] text-gray-400 line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                        {product.discountPercent > 0 && (
                          <span className="text-[9px] bg-green-50 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
                            -{product.discountPercent}%
                          </span>
                        )}
                      </div>
                    </div>

                    <ArrowRight
                      size={14}
                      className="text-[#C9A45D] opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                    />
                  </button>
                ))}
              </div>

              {results.length > 8 && (
                <button
                  onClick={() => { onClose(); navigate('/shop'); }}
                  className="w-full mt-3 py-2.5 text-xs font-semibold text-[#8C6C38] bg-[#FAF7F2] hover:bg-[#F0E6CC] border border-[#E8C98A]/30 rounded-xl transition-colors cursor-pointer"
                >
                  See all {results.length} results in Shop
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
