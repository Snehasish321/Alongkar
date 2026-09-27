import React, { useState, useEffect } from 'react';
import { collectionsData } from '../data/collections';
import { fetchProducts } from '../services/productApi';
import { CollectionCard } from '../components/collections/CollectionCard';
import { ProductCard } from '../components/products/ProductCard';
import { SectionHeading } from '../components/ui/SectionHeading';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import type { Product } from '../types';
import { Loader2 } from 'lucide-react';

interface CollectionsPageProps {
  onQuickView?: (product: Product) => void;
}

export const CollectionsPage: React.FC<CollectionsPageProps> = ({ onQuickView }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setIsLoading(true);
        const data = await fetchProducts();
        if (isMounted) {
          setProducts(data);
        }
      } catch (err) {
        console.error('Failed to load products for collections:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <StorefrontLayout>
      <main className="py-12 sm:py-16 bg-[#FFFDF8]">
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
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#B08D57]" />
              <p className="text-xs uppercase tracking-widest text-[#8C6C38] font-medium">
                Loading Curated Collections...
              </p>
            </div>
          ) : (
            <div className="space-y-16">
              {collectionsData.map((collection) => {
                const collectionProducts = products.filter(
                  (p) => p.collectionId === collection.id
                );

                if (collectionProducts.length === 0) return null;

                return (
                  <section
                    key={collection.id}
                    id={collection.slug}
                    className="scroll-mt-24 p-6 sm:p-8 bg-[#FAF7F2] rounded-xl border border-[#E8C98A]/20 shadow-xs"
                  >
                    <div className="mb-8 border-b border-[#E8C98A]/20 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div>
                        <span className="text-xs uppercase tracking-[0.25em] text-[#B08D57] font-semibold">
                          CURATED COLLECTION
                        </span>
                        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17] mt-1">
                          {collection.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-600 font-light max-w-2xl mt-1">
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
          )}
        </div>
      </main>
    </StorefrontLayout>
  );
};
