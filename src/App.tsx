import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ReactLenis, useLenis } from 'lenis/react';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { AdminRouteGuard } from './components/admin/AdminRouteGuard';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminProductsPage } from './pages/admin/AdminProductsPage';

function ScrollToTopOnNavigate() {
  const location = useLocation();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) {
      lenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, lenis]);

  return null;
}

export const AppContent: React.FC = () => {
  return (
    <>
      <ScrollToTopOnNavigate />
      <Routes>
        {/* Customer Storefront Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
        <Route path="/categories" element={<CollectionsPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/best-sellers" element={<ShopPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route
          path="/returns"
          element={
            <PlaceholderPage
              title="Return & Exchange Policy"
              subtitle="We offer a hassle-free 7-day exchange and replacement guarantee on all 24K city gold jewellery."
            />
          }
        />
        <Route
          path="/pre-orders"
          element={
            <PlaceholderPage
              title="Pre-Order Updates"
              subtitle="Track production milestones for handcrafted artisan jewelry orders."
            />
          }
        />
        <Route
          path="/track"
          element={
            <PlaceholderPage
              title="Track Your Order"
              subtitle="Enter your order tracking identifier to view live dispatch and delivery status."
            />
          }
        />

        {/* Protected Alongkar Atelier Admin Dashboard */}
        <Route
          path="/admin"
          element={
            <AdminRouteGuard>
              <AdminLayout />
            </AdminRouteGuard>
          }
        >
          <Route index element={<Navigate to="/admin/products" replace />} />
          <Route path="products" element={<AdminProductsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/shop" replace />} />
      </Routes>
    </>
  );
};

export default function App() {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.09,
        duration: 1.2,
        smoothWheel: true,
        syncTouch: false,
        autoRaf: true,
      }}
    >
      <Router>
        <CartProvider>
          <WishlistProvider>
            <AppContent />
          </WishlistProvider>
        </CartProvider>
      </Router>
    </ReactLenis>
  );
}
