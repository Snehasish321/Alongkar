import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnnouncementBar } from '../components/layout/AnnouncementBar';
import { Navbar } from '../components/layout/Navbar';
import { HeroSection } from '../components/home/HeroSection';
import { SecondaryTicker } from '../components/home/SecondaryTicker';
import { ShowcaseSlider } from '../components/home/ShowcaseSlider';
import { CategorySection } from '../components/home/CategorySection';
import { FeaturedGrid } from '../components/home/FeaturedGrid';
import { ShopWithConfidence } from '../components/home/ShopWithConfidence';
import { AlongkarStorySection } from '../components/home/AlongkarStorySection';
import { CustomerStoriesSection } from '../components/home/CustomerStoriesSection';
import { SocialGallerySection } from '../components/home/SocialGallerySection';
import { Footer } from '../components/layout/Footer';
import { SearchModal } from '../components/layout/SearchModal';
import { CartDrawer } from '../components/layout/CartDrawer';
import { WishlistDrawer } from '../components/layout/WishlistDrawer';
import { MobileMenu } from '../components/layout/MobileMenu';
import { productsData } from '../data/products';

const showcaseItems = [
  {
    title: 'Royal Kundan Temple Choker Set',
    badge: 'SALE' as const,
    price: 2499,
    originalPrice: 4899,
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop',
    link: '/product/prod-nk-1',
  },
  {
    title: 'Mayura Heritage Chandbali Jhumkas',
    badge: 'LIMITED' as const,
    price: 1399,
    originalPrice: 2499,
    image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?q=80&w=800&auto=format&fit=crop',
    link: '/product/prod-er-1',
  },
  {
    title: 'Gaja Heritage Open Cuff Bangle',
    badge: 'SALE' as const,
    price: 1499,
    originalPrice: 2799,
    image: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=800&auto=format&fit=crop',
    link: '/product/prod-br-2',
  },
  {
    title: 'Padmavati Lotus Kundan Statement Ring',
    badge: 'SOLD OUT' as const,
    price: 899,
    originalPrice: 1599,
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=800&auto=format&fit=crop',
    link: '/product/prod-rg-4',
  },
];

export const HomePage: React.FC = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const trendingProducts = productsData
    .filter((p) => p.isTrending || p.isBestSeller)
    .slice(0, 4);

  const statementProducts = productsData
    .filter((p) => p.collectionId === 'statement' || p.category === 'necklaces')
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col antialiased selection:bg-black selection:text-white">
      {/* Top Promotional Marquee Ticker */}
      <AnnouncementBar />

      {/* Clean 3-Zone Navigation Header */}
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Main High-Fashion Content Sections */}
      <main className="flex-1 w-full overflow-x-clip">
        {/* Editorial Split-Typography Hero Banner */}
        <HeroSection />

        {/* Mid-Page Scrolling Gold Marquee Ticker */}
        <SecondaryTicker />

        {/* 4-Card Category Showcase & Full-Width Statement Banner */}
        <CategorySection />

        {/* 2-Up Curated Drops Showcase Slider with Badges */}
        <ShowcaseSlider
          title="Exclusive Atelier Drops"
          items={showcaseItems}
        />

        {/* 4-Column Best Sellers Grid with Quick Add */}
        <FeaturedGrid
          title="Trending Masterworks"
          viewAllLink="/shop"
          products={trendingProducts}
        />

        {/* Purchase Reassurance & Trust Grid (COD, Exchange, 24K Micron Gold, Express Shipping) */}
        <ShopWithConfidence />

        {/* Royal Bengali Craft Story & Karigar Heritage */}
        <AlongkarStorySection />

        {/* 4-Column Statement Pieces Grid */}
        <FeaturedGrid
          title="Heirloom Statement Pieces"
          viewAllLink="/shop?category=necklaces"
          products={statementProducts}
        />

        {/* Verified Patron Testimonials */}
        <CustomerStoriesSection />

        {/* Social Instagram Lookbook & Community Grid */}
        <SocialGallerySection />
      </main>

      {/* High-End Editorial Footer with Newsletter */}
      <Footer />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectProduct={(productId) => {
          setIsSearchOpen(false);
          navigate(`/product/${productId}`);
        }}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer />

      {/* Slide-over Wishlist Drawer */}
      <WishlistDrawer />

      {/* Responsive Mobile Drawer */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
    </div>
  );
};
