import React, { useState } from 'react';
import { productsData } from '../../data/products';
import { ProductCard } from '../products/ProductCard';
import { SectionHeading } from '../ui/SectionHeading';
import type { Product } from '../../types';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

interface TrendingSectionProps {
  onQuickView: (product: Product) => void;
}

export const TrendingSection: React.FC<TrendingSectionProps> = ({ onQuickView }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'necklaces' | 'earrings' | 'rings' | 'bracelets' | 'chains' | 'pendants'>('all');

  const filteredProducts = activeTab === 'all'
    ? productsData.slice(0, 8)
    : productsData.filter((p) => p.category === activeTab).slice(0, 8);

  const tabs = [
    { id: 'all', label: 'All Masterpieces' },
    { id: 'necklaces', label: 'Necklaces' },
    { id: 'earrings', label: 'Earrings' },
    { id: 'rings', label: 'Rings' },
    { id: 'bracelets', label: 'Bracelets' },
    { id: 'chains', label: 'Chains' },
    { id: 'pendants', label: 'Pendants' },
  ];

  return (
    <section className="py-20 sm:py-28 bg-[#FFFDF8] border-y border-[#E8C98A]/20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Trending Atelier Pieces"
          subtitle="Most Coveted 24K Micron City Gold Creations of the Season"
        />

        {/* Category Tabs */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-6 mb-10 pt-2">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 sm:px-5 py-2 sm:py-2.5 text-[11px] uppercase tracking-[0.2em] font-medium rounded-full transition-all duration-300 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-[#2A0008] text-[#E8C98A] shadow-[0_4px_16px_rgba(42,0,8,0.25)] border border-[#E8C98A]/50 font-semibold'
                    : 'bg-white text-[#211A17] hover:border-[#E8C98A] border border-[#B08D57]/20 shadow-xs'
                }`}
              >
                {isSelected && <Sparkles size={11} className="inline mr-1.5 text-[#E8C98A]" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
          ))}
        </div>

        {/* View All CTA */}
        <div className="text-center mt-14">
          <Link to="/shop">
            <button className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md border-2 border-[#2A0008] text-[#2A0008] hover:bg-[#2A0008] hover:text-[#F8F1E3] transition-all duration-300 text-xs uppercase tracking-[0.22em] font-semibold cursor-pointer shadow-sm group">
              <span>EXPLORE ALL {productsData.length} CREATIONS</span>
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
};
