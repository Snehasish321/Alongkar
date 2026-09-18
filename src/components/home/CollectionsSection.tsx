import React from 'react';
import { collectionsData } from '../../data/collections';
import { CollectionCard } from '../collections/CollectionCard';
import { SectionHeading } from '../ui/SectionHeading';

export const CollectionsSection: React.FC = () => {
  return (
    <section className="py-16 sm:py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Curated Collections"
          subtitle="Jewellery For Every Mood & Occasion"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {collectionsData.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      </div>
    </section>
  );
};
