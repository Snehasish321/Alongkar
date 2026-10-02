import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnnouncementBar } from './AnnouncementBar';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

// Lazy-load off-screen modals and drawers to eliminate critical-rendering-path main thread overhead
const SearchModal = lazy(() => import('./SearchModal').then((m) => ({ default: m.SearchModal })));
const CartDrawer = lazy(() => import('./CartDrawer').then((m) => ({ default: m.CartDrawer })));
const WishlistDrawer = lazy(() => import('./WishlistDrawer').then((m) => ({ default: m.WishlistDrawer })));
const MobileMenu = lazy(() => import('./MobileMenu').then((m) => ({ default: m.MobileMenu })));

interface StorefrontLayoutProps {
  children: React.ReactNode;
}

export const StorefrontLayout: React.FC<StorefrontLayoutProps> = ({ children }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  const [hasOpenedMobileMenu, setHasOpenedMobileMenu] = useState(false);
  const [hasOpenedCart, setHasOpenedCart] = useState(false);
  const [hasOpenedWishlist, setHasOpenedWishlist] = useState(false);

  const { isCartOpen } = useCart();
  const { isWishlistOpen } = useWishlist();
  const navigate = useNavigate();

  // Keep drawers in memory after first opening so AnimatePresence exit animations play smoothly
  useEffect(() => {
    if (isCartOpen && !hasOpenedCart) setHasOpenedCart(true);
  }, [isCartOpen, hasOpenedCart]);

  useEffect(() => {
    if (isWishlistOpen && !hasOpenedWishlist) setHasOpenedWishlist(true);
  }, [isWishlistOpen, hasOpenedWishlist]);

  const handleOpenSearch = () => {
    setHasOpenedSearch(true);
    setIsSearchOpen(true);
  };

  const handleOpenMobileMenu = () => {
    setHasOpenedMobileMenu(true);
    setIsMobileMenuOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col antialiased selection:bg-black selection:text-white">
      {/* Top Promotional Marquee Ticker */}
      <AnnouncementBar />

      {/* Clean 3-Zone Navigation Header */}
      <Navbar
        onOpenSearch={handleOpenSearch}
        onOpenMobileMenu={handleOpenMobileMenu}
      />

      {/* Main Page Content */}
      <div className="flex-1 w-full">
        {children}
      </div>

      {/* High-End Editorial Footer with Newsletter */}
      <Footer />

      {/* Off-screen Modals & Drawers: Deferred and mounted on demand with zero layout shift */}
      <Suspense fallback={null}>
        {/* Search Modal */}
        {(isSearchOpen || hasOpenedSearch) && (
          <SearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onSelectProduct={(slugOrId) => {
              setIsSearchOpen(false);
              navigate(`/product/${slugOrId}`);
            }}
          />
        )}

        {/* Slide-over Cart Drawer */}
        {(isCartOpen || hasOpenedCart) && <CartDrawer />}

        {/* Slide-over Wishlist Drawer */}
        {(isWishlistOpen || hasOpenedWishlist) && <WishlistDrawer />}

        {/* Responsive Mobile Drawer */}
        {(isMobileMenuOpen || hasOpenedMobileMenu) && (
          <MobileMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
};

