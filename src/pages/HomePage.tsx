import React, { useState, useEffect, useMemo } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { SecondaryTicker } from '../components/home/SecondaryTicker';
import { ShowcaseSlider, type ShowcaseItem } from '../components/home/ShowcaseSlider';
import { CategorySection } from '../components/home/CategorySection';
import { FeaturedGrid } from '../components/home/FeaturedGrid';
import { AlongkarStorySection } from '../components/home/AlongkarStorySection';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { fetchProducts } from '../services/productApi';
import type { Product } from '../types';

export const HomePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const data = await fetchProducts();
        if (isMounted) {
          setProducts(data);
        }
      } catch (err) {
        console.error('Failed to load homepage products from database:', err);
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  // Trending & Bestsellers section derived from database
  const trendingProducts = useMemo(() => {
    if (products.length === 0) return [];
    const filtered = products.filter((p) => p.isTrending || p.isBestSeller);
    return (filtered.length >= 4 ? filtered : products).slice(0, 4);
  }, [products]);

  // Statement Pieces section derived from database
  const statementProducts = useMemo(() => {
    if (products.length === 0) return [];
    const filtered = products.filter(
      (p) => p.collectionId === 'statement' || p.category?.toLowerCase() === 'necklaces'
    );
    return (filtered.length >= 4 ? filtered : products.slice(4, 8)).slice(0, 4);
  }, [products]);

  // Showcase Atelier Slider items dynamically derived with slug URLs
  const showcaseItems: ShowcaseItem[] = useMemo(() => {
    if (products.length === 0) {
      return [];
    }

    // Select up to 6 prominent items for the slider
    const prominent = products.filter((p) => p.isNew || p.discountPercent > 0 || p.isBestSeller);
    const selected = (prominent.length >= 4 ? prominent : products).slice(0, 6);

    return selected.map((p) => {
      let badge: ShowcaseItem['badge'] = undefined;
      if (!p.inStock) {
        badge = 'SOLD OUT';
      } else if (p.isNew) {
        badge = 'NEW';
      } else if (p.discountPercent > 0) {
        badge = 'SALE';
      } else if (p.isBestSeller) {
        badge = 'LIMITED';
      }

      return {
        id: p.id,
        title: p.name,
        badge,
        price: p.price,
        originalPrice: p.originalPrice,
        image: p.image,
        link: `/product/${p.slug || p.id}`,
      };
    });
  }, [products]);

  return (
    <StorefrontLayout>
      <main className="flex-1 w-full overflow-x-clip">
        {/* Editorial Split-Typography Hero Banner */}
        <HeroSection />

        {/* Mid-Page Scrolling Gold Marquee Ticker */}
        <SecondaryTicker />

        {/* 4-Card Category Showcase & Full-Width Statement Banner */}
        <CategorySection />

        {/* 2-Up Curated Drops Showcase Slider with Badges & Slug URLs */}
        {showcaseItems.length > 0 && (
          <ShowcaseSlider
            title="Exclusive Atelier Drops"
            items={showcaseItems}
          />
        )}

        {/* 4-Column Best Sellers Grid with Quick Add */}
        {trendingProducts.length > 0 && (
          <FeaturedGrid
            title="Trending Masterworks"
            viewAllLink="/shop"
            products={trendingProducts}
          />
        )}

        {/* Royal Bengali Craft Story & Karigar Heritage */}
        <AlongkarStorySection />

        {/* 4-Column Statement Pieces Grid */}
        {statementProducts.length > 0 && (
          <FeaturedGrid
            title="Heirloom Statement Pieces"
            viewAllLink="/shop?category=necklaces"
            products={statementProducts}
          />
        )}
      </main>
    </StorefrontLayout>
  );
};
