import React, { useState, lazy, Suspense } from 'react';
import { AnnouncementBar } from './AnnouncementBar';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

// Lazy-load off-screen modals and drawers to eliminate critical-rendering-path main thread overhead
const MobileMenu = lazy(() => import('./MobileMenu').then((m) => ({ default: m.MobileMenu })));

interface StorefrontLayoutProps {
  children: React.ReactNode;
}

export const StorefrontLayout: React.FC<StorefrontLayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasOpenedMobileMenu, setHasOpenedMobileMenu] = useState(false);

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


