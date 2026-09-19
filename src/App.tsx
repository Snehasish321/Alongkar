import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { AnnouncementBar } from './components/layout/AnnouncementBar';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { MobileMenu } from './components/layout/MobileMenu';
import { CartDrawer } from './components/layout/CartDrawer';
import { WishlistDrawer } from './components/layout/WishlistDrawer';
import { SearchModal } from './components/layout/SearchModal';
import { QuickViewModal } from './components/products/QuickViewModal';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { productsData } from './data/products';
import { AlongkarAuthProvider } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { SSOCallbackPage } from './pages/SSOCallbackPage';
import type { Product } from './types';

// ScrollToTop component to reset scroll position on route navigation
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export const AppContent: React.FC = () => {
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-ivory text-espresso">
      <ScrollToTop />
      <AnnouncementBar />
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      <div className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage onQuickView={(p) => setQuickViewProduct(p)} />} />
          <Route path="/shop" element={<ShopPage onQuickView={(p) => setQuickViewProduct(p)} />} />
          <Route path="/collections" element={<CollectionsPage onQuickView={(p) => setQuickViewProduct(p)} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/sso-callback" element={<SSOCallbackPage />} />

          {/* Placeholder Legal & Customer Care Routes */}
          <Route path="/shipping-policy" element={<PlaceholderPage title="Shipping & Delivery Policy" />} />
          <Route path="/return-policy" element={<PlaceholderPage title="7-Day Return & Replacement Policy" />} />
          <Route path="/privacy-policy" element={<PlaceholderPage title="Privacy Policy" />} />
          <Route path="/terms" element={<PlaceholderPage title="Terms & Conditions" />} />
          <Route path="/track-order" element={<PlaceholderPage title="Track Your Shipment" />} />
          <Route path="/faqs" element={<PlaceholderPage title="Care Instructions & FAQs" />} />

          {/* Fallback */}
          <Route path="*" element={<HomePage onQuickView={(p) => setQuickViewProduct(p)} />} />
        </Routes>
      </div>

      <Footer />

      {/* Global Overlays & Modals */}
      <CartDrawer />
      <WishlistDrawer />
      <AuthModal />
      <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectProduct={(productId) => {
          const found = productsData.find((p) => p.id === productId);
          if (found) setQuickViewProduct(found);
        }}
      />
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <AlongkarAuthProvider>
        <CartProvider>
          <WishlistProvider>
            <AppContent />
          </WishlistProvider>
        </CartProvider>
      </AlongkarAuthProvider>
    </Router>
  );
}
