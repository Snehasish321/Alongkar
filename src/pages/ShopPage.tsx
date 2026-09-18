import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productsData } from '../data/products';
import { ProductCard } from '../components/products/ProductCard';
import type { Product } from '../types';
import { Filter, SlidersHorizontal, Search, X } from 'lucide-react';
import { SectionHeading } from '../components/ui/SectionHeading';

interface ShopPageProps {
  onQuickView: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onQuickView }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || 'all';
  const searchParam = searchParams.get('search') || '';

  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam);
  const [searchQuery, setSearchQuery] = useState<string>(searchParam);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating'>('featured');

  // Update state if URL search parameters change
  React.useEffect(() => {
    if (categoryParam) setSelectedCategory(categoryParam);
    if (searchParam) setSearchQuery(searchParam);
  }, [categoryParam, searchParam]);

  const categories = [
    { id: 'all', name: 'All Jewellery' },
    { id: 'necklaces', name: 'Necklaces' },
    { id: 'earrings', name: 'Earrings' },
    { id: 'rings', name: 'Rings' },
    { id: 'bracelets', name: 'Bracelets' },
  ];

  const filteredProducts = useMemo(() => {
    return productsData
      .filter((p) => {
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        const matchesSearch =
          !searchQuery.trim() ||
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'rating') return b.rating - a.rating;
        return 0; // featured default order
      });
  }, [selectedCategory, searchQuery, sortBy]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    if (catId === 'all') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', catId);
    }
    setSearchParams(searchParams);
  };

  return (
    <main className="py-12 sm:py-16 bg-ivory min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="The Alongkar Catalogue"
          subtitle="Explore 24K City Gold Adornments"
        />

        {/* Filter & Search Toolbar */}
        <div className="bg-ivory-pearl p-4 sm:p-6 rounded-brand border border-gold/20 shadow-soft mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-4 py-2 text-xs uppercase tracking-widest font-semibold rounded-full transition-all whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-espresso text-ivory-pearl shadow-sm'
                    : 'bg-ivory text-espresso hover:bg-gold/15 border border-gold/20'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search Bar & Sorting */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-60">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog..."
                className="w-full bg-ivory text-xs text-espresso placeholder:text-gray-400 pl-8 pr-7 py-2 rounded-brand border border-gold/20 focus:outline-none focus:border-gold"
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gold" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-espresso"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Sort Select */}
            <div className="flex items-center gap-1.5 text-xs text-espresso font-medium">
              <SlidersHorizontal size={14} className="text-gold hidden sm:inline" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-ivory text-xs text-espresso py-2 px-3 rounded-brand border border-gold/20 focus:outline-none focus:border-gold font-medium cursor-pointer"
              >
                <option value="featured">Sort by Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Indicators */}
        {(selectedCategory !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-6 text-xs text-espresso-light">
            <span className="font-semibold text-espresso">Active Filters:</span>
            {selectedCategory !== 'all' && (
              <span className="bg-gold/20 text-espresso px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
                Category: {selectedCategory}
                <X size={12} className="cursor-pointer" onClick={() => handleCategoryChange('all')} />
              </span>
            )}
            {searchQuery && (
              <span className="bg-gold/20 text-espresso px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
                Search: &quot;{searchQuery}&quot;
                <X size={12} className="cursor-pointer" onClick={() => setSearchQuery('')} />
              </span>
            )}
          </div>
        )}

        {/* Product Count Header */}
        <div className="flex justify-between items-center text-xs text-gray-500 mb-6 font-medium">
          <span>Showing {filteredProducts.length} city gold products</span>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center bg-ivory-pearl rounded-brand border border-gold/20 p-8 space-y-3">
            <Filter size={40} className="mx-auto text-gold/40 stroke-1" />
            <h3 className="font-serif text-lg font-semibold text-espresso">No products match your criteria</h3>
            <p className="text-xs text-gray-500">Try adjusting your category filter or search terms.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="text-xs uppercase tracking-widest text-gold font-bold hover:underline pt-2"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};
