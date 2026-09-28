import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchProducts } from '../services/productApi';
import { ProductCard } from '../components/products/ProductCard';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import type { Product } from '../types';
import { Filter, X, Loader2, AlertCircle, RefreshCw, ShoppingBag, ArrowRight } from 'lucide-react';
import { SectionHeading } from '../components/ui/SectionHeading';

interface ShopPageProps {
  onQuickView?: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onQuickView }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || 'all';

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam);
  const [prevCategoryParam, setPrevCategoryParam] = useState(categoryParam);

  if (prevCategoryParam !== categoryParam) {
    setPrevCategoryParam(categoryParam);
    setSelectedCategory(categoryParam);
  }

  const loadProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchProducts();
      setProducts(data);
    } catch (err: any) {
      console.error('Failed to load shop products from database:', err);
      setError(err?.message || 'Unable to connect to the product catalogue. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = [
    { id: 'all', name: 'All Jewellery' },
    { id: 'necklaces', name: 'Necklaces' },
    { id: 'earrings', name: 'Earrings' },
    { id: 'rings', name: 'Rings' },
    { id: 'bracelets', name: 'Bracelets' },
    { id: 'chains', name: 'Chains' },
    { id: 'pendants', name: 'Pendants' },
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      return selectedCategory === 'all' || p.category?.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [products, selectedCategory]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    const newParams = new URLSearchParams(searchParams);
    if (catId === 'all') {
      newParams.delete('category');
    } else {
      newParams.set('category', catId);
    }
    setSearchParams(newParams);
  };

  return (
    <StorefrontLayout>
      <main className="py-12 sm:py-16 bg-[#FFFDF8] min-h-[80vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            title="The Alongkar Catalogue"
            subtitle="Explore 24K City Gold Adornments"
          />

          {/* Category Toolbar */}
          <div className="bg-[#FAF7F2] p-4 sm:p-6 rounded-xl border border-[#E8C98A]/25 shadow-xs mb-8 flex items-center">
            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto w-full no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`px-4 py-2 text-xs uppercase tracking-widest font-semibold rounded-full transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-[#2A0008] text-[#E8C98A] shadow-sm'
                      : 'bg-[#FFFDF8] text-[#211A17] hover:bg-[#E8C98A]/20 border border-[#E8C98A]/30'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Active Filter Indicators */}
          {selectedCategory !== 'all' && (
            <div className="flex items-center gap-2 mb-6 text-xs text-gray-600">
              <span className="font-semibold text-[#211A17]">Active Filter:</span>
              <span className="bg-[#E8C98A]/25 text-[#2A0008] px-2.5 py-1 rounded-full flex items-center gap-1 font-medium border border-[#E8C98A]/40">
                Category: {selectedCategory}
                <X size={12} className="cursor-pointer hover:text-black" onClick={() => handleCategoryChange('all')} />
              </span>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-24 text-center bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20 p-8 space-y-4">
              <Loader2 size={36} className="mx-auto text-[#B08D57] animate-spin" />
              <h3 className="font-serif text-lg font-semibold text-[#211A17]">
                Retrieving Royal Jewellery Collection
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto font-light">
                Fetching handcrafted 24K micron city gold pieces directly from our live database...
              </p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="py-16 text-center bg-[#FAF7F2] rounded-xl border border-red-200 p-8 space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <h3 className="font-serif text-lg font-semibold text-red-900">
                Failed to Load Products
              </h3>
              <p className="text-xs text-red-700/80 max-w-md mx-auto">{error}</p>
              <button
                onClick={loadProducts}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2A0008] text-[#E8C98A] text-xs font-semibold uppercase tracking-wider hover:bg-[#3D0010] transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Retry Loading</span>
              </button>
            </div>
          )}

          {/* Database Empty State */}
          {!isLoading && !error && products.length === 0 && (
            <div className="py-20 text-center bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20 p-8 space-y-3">
              <ShoppingBag size={40} className="mx-auto text-[#B08D57]/50" />
              <h3 className="font-serif text-lg font-semibold text-[#211A17]">No products in catalogue</h3>
              <p className="text-xs text-gray-500">Products created via the Admin Panel will appear here automatically.</p>
            </div>
          )}

          {/* Filtered Results Empty State */}
          {!isLoading && !error && products.length > 0 && filteredProducts.length === 0 && (
            <div className="py-20 text-center bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20 p-8 space-y-3">
              <Filter size={40} className="mx-auto text-[#B08D57]/40 stroke-1" />
              <h3 className="font-serif text-lg font-semibold text-[#211A17]">No products found in this category</h3>
              <p className="text-xs text-gray-500">Try selecting a different jewellery category.</p>
              <button
                onClick={() => handleCategoryChange('all')}
                className="text-xs uppercase tracking-widest text-[#B08D57] font-bold hover:underline pt-2 cursor-pointer"
              >
                View All Jewellery ({products.length})
              </button>
            </div>
          )}

          {/* Product Grid & Count */}
          {!isLoading && !error && filteredProducts.length > 0 && (
            <>
              {/* Product Count Header */}
              <div className="flex justify-between items-center text-xs text-gray-500 mb-6 font-medium">
                <span>
                  Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
                  {selectedCategory !== 'all' ? ` in ${selectedCategory}` : ' in catalogue'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
                ))}
              </div>
            </>
          )}

          {/* Custom Jewellery Sourcing CTA Banner */}
          {!isLoading && !error && (
            <div className="mt-16 p-6 sm:p-8 bg-ivory-pearl rounded-brand border border-gold/25 shadow-soft flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1.5 text-center md:text-left">
                <span className="text-[11px] uppercase tracking-[0.2em] text-gold font-bold">
                  Bespoke Sourcing Atelier
                </span>
                <h3 className="font-serif text-lg sm:text-xl font-bold text-espresso">
                  Can&apos;t find your dream jewellery design?
                </h3>
                <p className="text-xs text-gray-500 max-w-xl">
                  Send us an inspiration image and your requirements. Our Kolkata goldsmith atelier will try to source a matching piece for you.
                </p>
              </div>
              <Link
                to="/request-jewellery"
                className="shrink-0 px-6 py-3 bg-espresso text-ivory-pearl text-xs font-semibold uppercase tracking-wider rounded-brand hover:bg-espresso-charcoal transition-all border border-espresso cursor-pointer flex items-center gap-2"
              >
                <span>Request Custom Jewellery</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </main>
    </StorefrontLayout>
  );
};
