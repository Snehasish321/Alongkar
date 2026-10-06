import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { ProductCard } from '../components/products/ProductCard';
import { fetchProducts } from '../services/productApi';
import { productsData } from '../data/products';
import type { Product } from '../types';

// ─── Synonym & Semantic Keyword Mapping ───────────────────────────────────────
const SYNONYMS: Record<string, string[]> = {
  necklace: ['haar', 'choker', 'rani', 'collar', 'neckpiece', 'mala', 'pendant', 'sets'],
  necklaces: ['haar', 'choker', 'rani', 'collar', 'neckpiece', 'mala', 'pendant', 'sets'],
  choker: ['necklace', 'necklaces', 'collar', 'haar', 'bridal', 'kundan'],
  earring: ['earrings', 'jhumka', 'jhumkas', 'jhumki', 'chaandbali', 'chandbali', 'stud', 'studs', 'drops', 'danglers', 'hoops'],
  earrings: ['earring', 'jhumka', 'jhumkas', 'jhumki', 'chaandbali', 'chandbali', 'stud', 'studs', 'drops', 'danglers', 'hoops'],
  jhumka: ['earrings', 'earring', 'jhumki', 'jhumkas', 'danglers', 'chandbali'],
  jhumkas: ['earrings', 'earring', 'jhumki', 'jhumka', 'danglers', 'chandbali'],
  chandbali: ['earrings', 'earring', 'chaandbali', 'jhumka'],
  ring: ['rings', 'band', 'solitaire', 'anguthi', 'finger'],
  rings: ['ring', 'band', 'solitaire', 'anguthi', 'finger'],
  bracelet: ['bracelets', 'kada', 'kadas', 'bangle', 'bangles', 'cuff'],
  bracelets: ['bracelet', 'kada', 'kadas', 'bangle', 'bangles', 'cuff'],
  bangle: ['bracelet', 'bracelets', 'kada', 'kadas', 'bangles'],
  bangles: ['bracelet', 'bracelets', 'kada', 'kadas', 'bangle'],
  kada: ['bracelet', 'bracelets', 'bangle', 'bangles', 'cuff', 'kadas'],
  kadas: ['bracelet', 'bracelets', 'bangle', 'bangles', 'cuff', 'kada'],
  chain: ['chains', 'necklace', 'mala', 'sleek'],
  chains: ['chain', 'necklace', 'mala'],
  pendant: ['pendants', 'locket', 'necklace'],
  pendants: ['pendant', 'locket', 'necklace'],
  gold: ['yellow gold', 'gold tone', 'antique gold', 'matte gold', 'micron', 'kadas'],
  silver: ['oxidized', 'sterling', 'white gold'],
  kundan: ['polki', 'jadau', 'meenakari', 'uncut', 'bridal'],
  polki: ['kundan', 'uncut', 'heritage', 'antique'],
  bridal: ['wedding', 'festive', 'heavy', 'statement', 'dulhan', 'choker', 'kundan'],
  wedding: ['bridal', 'festive', 'heavy', 'statement', 'kundan'],
  daily: ['everyday', 'minimalist', 'office', 'subtle', 'casual', 'lightweight'],
  minimalist: ['everyday', 'sleek', 'subtle', 'daily', 'modern'],
};

// ─── Tokenized Scoring Algorithm ───────────────────────────────────────────────
function scoreProduct(product: Product, query: string): number {
  const clean = query.toLowerCase().trim();
  if (!clean) return 1;

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  const name = product.name.toLowerCase();
  const category = product.category.toLowerCase();
  const description = (product.description || '').toLowerCase();
  const slug = (product.slug || '').toLowerCase();
  const collection = (product.collectionId || '').toLowerCase().replace(/-/g, ' ');
  const stone = (product.details?.stoneType || product.stoneType || '').toLowerCase();
  const finish = (product.details?.finish || product.finish || '').toLowerCase();
  const baseMaterial = (product.details?.baseMaterial || product.baseMaterial || '').toLowerCase();

  const searchableText = `${name} ${category} ${description} ${slug} ${collection} ${stone} ${finish} ${baseMaterial}`;

  let totalScore = 0;
  let tokensMatched = 0;

  for (const token of tokens) {
    let tokenScore = 0;

    if (name.includes(token)) {
      tokenScore += 16;
      if (name.startsWith(token)) tokenScore += 8;
    }
    if (category.includes(token)) tokenScore += 12;
    if (stone.includes(token)) tokenScore += 10;
    if (finish.includes(token)) tokenScore += 8;
    if (collection.includes(token)) tokenScore += 6;
    if (slug.includes(token)) tokenScore += 6;
    if (description.includes(token)) tokenScore += 4;
    if (baseMaterial.includes(token)) tokenScore += 4;

    const syns = SYNONYMS[token] || [];
    for (const syn of syns) {
      if (name.includes(syn)) tokenScore += 8;
      if (category.includes(syn)) tokenScore += 8;
      if (searchableText.includes(syn)) tokenScore += 4;
    }

    if (tokenScore > 0) {
      tokensMatched++;
      totalScore += tokenScore;
    }
  }

  if (tokens.length > 1) {
    if (tokensMatched === tokens.length) {
      totalScore += 35;
    } else if (tokensMatched === 0) {
      return 0;
    }
  }

  return totalScore;
}

const POPULAR = ['Choker', 'Jhumkas', 'Kundan', 'Solitaire', 'Kadas', 'Temple', 'Polki'];

const CATEGORIES = ['All', 'Necklaces', 'Earrings', 'Rings', 'Bracelets', 'Chains', 'Pendants'];

const SORT_OPTIONS = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Price: Low to High', value: 'price_asc' },
  { label: 'Price: High to Low', value: 'price_desc' },
  { label: 'Top Rated', value: 'rating' },
  { label: 'New Arrivals', value: 'new' },
  { label: 'Best Sellers', value: 'bestseller' },
];

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQuery = searchParams.get('q') ?? '';
  const [inputValue, setInputValue] = useState(initialQuery);
  const [catalog, setCatalog] = useState<Product[]>(productsData);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('relevance');
  const [showSort, setShowSort] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-focus search input
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  // Fetch updated catalog from API
  useEffect(() => {
    fetchProducts()
      .then((data) => {
        if (data && data.length > 0) setCatalog(data);
      })
      .catch(() => {});
  }, []);

  // Sync URL search params
  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const trimmed = inputValue.trim();
      if (trimmed) {
        setSearchParams({ q: trimmed }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 250);
    return () => clearTimeout(debounceTimerRef.current);
  }, [inputValue, setSearchParams]);

  // Real-time zero-lag filtering
  const results = useMemo(() => {
    let list = catalog;

    if (selectedCategory !== 'All') {
      list = list.filter((p) => p.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    const trimmed = inputValue.trim();
    if (trimmed) {
      list = list
        .map((p) => ({ product: p, score: scoreProduct(p, trimmed) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ product }) => product);
    }

    switch (sortBy) {
      case 'price_asc':
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'new':
        list = [...list].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
        break;
      case 'bestseller':
        list = [...list].sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
        break;
      default:
        break;
    }

    return list;
  }, [catalog, inputValue, selectedCategory, sortBy]);

  return (
    <StorefrontLayout>
      <div className="min-h-screen bg-[#FFFDF8]">
        {/* ── Minimal Editorial Search Header ── */}
        <section className="pt-12 pb-6 sm:pt-16 sm:pb-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            
            <h1 className="font-serif text-3xl sm:text-4xl text-[#211A17] font-normal tracking-wide mb-6">
              Search
            </h1>

            {/* Clean Minimal Search Bar */}
            <div className="relative flex items-center bg-white border border-[#211A17]/15 focus-within:border-[#211A17] focus-within:ring-1 focus-within:ring-[#211A17]/15 rounded-full px-5 py-3.5 shadow-xs transition-all duration-300">
              <Search size={18} className="text-[#8C6C38] flex-shrink-0" strokeWidth={1.75} />
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setInputValue('');
                    inputRef.current?.focus();
                  }
                }}
                placeholder="Search jewellery, gemstones, styles..."
                className="flex-1 ml-3 text-sm sm:text-base text-[#211A17] placeholder:text-[#A89070]/60 bg-transparent focus:outline-none font-sans"
                autoComplete="off"
                spellCheck={false}
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    inputRef.current?.focus();
                  }}
                  className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer transition-colors"
                  aria-label="Clear search query"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Understated Popular Keywords */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-[#A89070] font-normal">Popular:</span>
              {POPULAR.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setInputValue(term)}
                  className={`transition-colors cursor-pointer ${
                    inputValue.toLowerCase() === term.toLowerCase()
                      ? 'text-[#211A17] font-semibold underline underline-offset-4 decoration-[#B08D57]'
                      : 'text-[#6B5E52] hover:text-[#211A17]'
                  }`}
                >
                  {term}
                </button>
              ))}
            </div>

          </div>
        </section>

        {/* ── Toolbar & Products ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          
          {/* Controls Bar: Category Filter + Count + Sort */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-3 mb-8 border-b border-[#E8C98A]/20">
            
            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs uppercase tracking-widest px-3.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap font-medium ${
                    selectedCategory === cat
                      ? 'bg-[#211A17] text-[#FAF7F2]'
                      : 'text-[#6B5E52] hover:text-[#211A17] hover:bg-black/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Results count & Sort */}
            <div className="flex items-center justify-between sm:justify-end gap-5 flex-shrink-0 text-xs">
              <span className="text-[#8C6C38]">
                <strong className="text-[#211A17] font-semibold">{results.length}</strong> {results.length === 1 ? 'piece' : 'pieces'}
              </span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSort((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-[#211A17] hover:text-[#8C6C38] py-1 cursor-pointer font-medium tracking-wider uppercase"
                >
                  <span>Sort: {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showSort ? 'rotate-180' : ''}`} />
                </button>

                {showSort && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-[#E8C98A]/30 rounded-lg shadow-lg z-30 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.value);
                          setShowSort(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between ${
                          sortBy === opt.value
                            ? 'text-[#211A17] font-semibold bg-[#FAF7F2]'
                            : 'text-[#6B5E52] hover:bg-[#FAF7F2] hover:text-[#211A17]'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.value && <Check size={13} className="text-[#B08D57]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── No Results Found View ── */}
          {results.length === 0 && (
            <div className="py-24 text-center max-w-sm mx-auto">
              <p className="font-serif text-xl text-[#211A17] font-light mb-2">
                No pieces found
              </p>
              <p className="text-xs text-[#8C6C38] leading-relaxed mb-6 font-light">
                We couldn&apos;t find anything matching &ldquo;{inputValue}&rdquo;. Try another term or explore our full collection.
              </p>
              <button
                type="button"
                onClick={() => {
                  setInputValue('');
                  setSelectedCategory('All');
                }}
                className="inline-block text-xs uppercase tracking-widest text-[#211A17] font-medium border-b border-[#211A17] pb-0.5 hover:text-[#8C6C38] hover:border-[#8C6C38] transition-colors cursor-pointer"
              >
                View All Products
              </button>
            </div>
          )}

          {/* ── Product Grid ── */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

        </div>
      </div>
    </StorefrontLayout>
  );
};
