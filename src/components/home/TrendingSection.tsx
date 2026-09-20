import React, { useState } from 'react';
import { productsData } from '../../data/products';
import { ProductCard } from '../products/ProductCard';
import { SectionHeading } from '../ui/SectionHeading';
import type { Product } from '../../types';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';

interface TrendingSectionProps {
  onQuickView: (product: Product) => void;
}

export const TrendingSection: React.FC<TrendingSectionProps> = ({ onQuickView }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'necklaces' | 'earrings' | 'rings' | 'bracelets' | 'chains' | 'pendants'>('all');

  const filteredProducts = activeTab === 'all'
    ? productsData.slice(0, 8)
    : productsData.filter((p) => p.category === activeTab).slice(0, 8);

  const tabs = [
    { id: 'all', label: 'All Trending' },
    { id: 'necklaces', label: 'Necklaces' },
    { id: 'earrings', label: 'Earrings' },
    { id: 'rings', label: 'Rings' },
    { id: 'bracelets', label: 'Bracelets' },
    { id: 'chains', label: 'Chains' },
    { id: 'pendants', label: 'Pendants' },
  ];

  return (
    <section className="py-16 sm:py-24 bg-ivory-pearl border-y border-gold/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Trending Now"
          subtitle="Most Loved Adornments Of The Season"
        />

        {/* Category Tabs */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar pb-6 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs uppercase tracking-widest font-medium rounded-full transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-espresso text-ivory-pearl shadow-soft border border-espresso'
                  : 'bg-ivory text-espresso hover:bg-gold/15 border border-gold/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/shop">
            <Button variant="outline" size="lg" className="border-espresso/30">
              VIEW ALL PRODUCTS
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
