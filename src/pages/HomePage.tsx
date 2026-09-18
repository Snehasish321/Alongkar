import React from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { CategorySection } from '../components/home/CategorySection';
import { TrendingSection } from '../components/home/TrendingSection';
import { CollectionsSection } from '../components/home/CollectionsSection';
import { AlongkarStorySection } from '../components/home/AlongkarStorySection';
import { WhyAlongkarSection } from '../components/home/WhyAlongkarSection';
import { CustomerStoriesSection } from '../components/home/CustomerStoriesSection';
import { SocialGallerySection } from '../components/home/SocialGallerySection';
import type { Product } from '../types';

interface HomePageProps {
  onQuickView: (product: Product) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onQuickView }) => {
  return (
    <main className="overflow-hidden">
      <HeroSection />
      <CategorySection />
      <TrendingSection onQuickView={onQuickView} />
      <CollectionsSection />
      <AlongkarStorySection />
      <WhyAlongkarSection />
      <CustomerStoriesSection />
      <SocialGallerySection />
    </main>
  );
};
