import React from 'react';
import { collectionsData } from '../data/collections';
import { productsData } from '../data/products';
import { CollectionCard } from '../components/collections/CollectionCard';
import { ProductCard } from '../components/products/ProductCard';
import { SectionHeading } from '../components/ui/SectionHeading';
import type { Product } from '../types';

interface CollectionsPageProps {
  onQuickView: (product: Product) => void;
}

export const CollectionsPage: React.FC<CollectionsPageProps> = ({ onQuickView }) => {
  return (
    <main className="py-12 sm:py-16 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Curated Collections"
          subtitle="Jewellery Designed For Every Milestone"
        />

        {/* Collections Overview Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {collectionsData.map((col) => (
            <CollectionCard key={col.id} collection={col} />
          ))}
        </div>

        {/* Detailed Collection Showcases */}
        <div className="space-y-16">
          {collectionsData.map((collection) => {
            const collectionProducts = productsData.filter(
              (p) => p.collectionId === collection.id
            );

            return (
              <section
                key={collection.id}
                id={collection.slug}
                className="scroll-mt-24 p-6 sm:p-8 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft"
              >
                <div className="mb-8 border-b border-gold/15 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <span className="text-xs uppercase tracking-[0.25em] text-gold font-semibold">
                      CURATED COLLECTION
                    </span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-espresso mt-1">
                      {collection.name}
                    </h2>
                    <p className="text-xs sm:text-sm text-espresso-light font-light max-w-2xl mt-1">
                      {collection.description}
                    </p>
                  </div>
                </div>

                {/* Product Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {collectionProducts.map((product) => (
                    <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
};
