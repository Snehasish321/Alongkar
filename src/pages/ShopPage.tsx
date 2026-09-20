import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productsData } from '../data/products';
import { ProductCard } from '../components/products/ProductCard';
import type { Product } from '../types';
import { Filter, X } from 'lucide-react';
import { SectionHeading } from '../components/ui/SectionHeading';

interface ShopPageProps {
  onQuickView: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({ onQuickView }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || 'all';

  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam);
  const [prevCategoryParam, setPrevCategoryParam] = useState(categoryParam);

  if (prevCategoryParam !== categoryParam) {
    setPrevCategoryParam(categoryParam);
    setSelectedCategory(categoryParam);
  }

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
    return productsData.filter((p) => {
      return selectedCategory === 'all' || p.category === selectedCategory;
    });
  }, [selectedCategory]);

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

        {/* Category Toolbar */}
        <div className="bg-ivory-pearl p-4 sm:p-6 rounded-brand border border-gold/20 shadow-soft mb-8 flex items-center">
          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto w-full no-scrollbar">
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
        </div>

        {/* Active Filter Indicators */}
        {selectedCategory !== 'all' && (
          <div className="flex items-center gap-2 mb-6 text-xs text-espresso-light">
            <span className="font-semibold text-espresso">Active Filter:</span>
            <span className="bg-gold/20 text-espresso px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
              Category: {selectedCategory}
              <X size={12} className="cursor-pointer" onClick={() => handleCategoryChange('all')} />
            </span>
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
            <h3 className="font-serif text-lg font-semibold text-espresso">No products found in this category</h3>
            <p className="text-xs text-gray-500">Try selecting a different jewellery category.</p>
            <button
              onClick={() => handleCategoryChange('all')}
              className="text-xs uppercase tracking-widest text-gold font-bold hover:underline pt-2"
            >
              View All Jewellery
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
