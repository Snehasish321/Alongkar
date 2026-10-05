import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { HomePage } from './pages/HomePage';

// Lazy-loaded routes for performance & code-splitting
const ShopPage = lazy(() => import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })));
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage }))
);
const CollectionsPage = lazy(() =>
  import('./pages/CollectionsPage').then((m) => ({ default: m.CollectionsPage }))
);
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const RequestJewelleryPage = lazy(() =>
  import('./pages/RequestJewelleryPage').then((m) => ({ default: m.RequestJewelleryPage }))
);
const JewelleryRequestsPage = lazy(() =>
  import('./pages/JewelleryRequestsPage').then((m) => ({ default: m.JewelleryRequestsPage }))
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const CartPage = lazy(() =>
  import('./pages/CartPage').then((m) => ({ default: m.CartPage }))
);
const WishlistPage = lazy(() =>
  import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage }))
);
const PlaceholderPage = lazy(() =>
  import('./pages/PlaceholderPage').then((m) => ({ default: m.PlaceholderPage }))
);
const AdminRouteGuard = lazy(() =>
  import('./components/admin/AdminRouteGuard').then((m) => ({ default: m.AdminRouteGuard }))
);
const AdminLayout = lazy(() =>
  import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout }))
);
const AdminProductsPage = lazy(() =>
  import('./pages/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage }))
);
const AdminJewelleryRequestsPage = lazy(() =>
  import('./pages/admin/AdminJewelleryRequestsPage').then((m) => ({
    default: m.AdminJewelleryRequestsPage,
  }))
);

function ScrollToTopOnNavigate() {
  const location = useLocation();

  useEffect(() => {
    const globalLenis = (
      window as unknown as {
        __lenis?: { scrollTo: (target: number, opts?: { immediate: boolean }) => void };
      }
    ).__lenis;

    if (globalLenis && typeof globalLenis.scrollTo === 'function') {
      globalLenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return null;
}

const RouteLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center bg-[#FFFDF8]" aria-busy="true">
    <div className="w-8 h-8 rounded-full border-2 border-[#E8C98A]/30 border-t-[#8C6C38] animate-spin" />
  </div>
);

export const AppContent: React.FC = () => {
  return (
    <>
      <ScrollToTopOnNavigate />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Customer Storefront Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/product/:slug" element={<ProductDetailPage />} />
          <Route path="/categories" element={<CollectionsPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/best-sellers" element={<ShopPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/request-jewellery" element={<RequestJewelleryPage />} />
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
            path="/orders"
            element={
              <PlaceholderPage
                title="My Orders"
                subtitle="View and track your jewellery purchases and order shipments."
              />
            }
          />
          <Route
            path="/jewellery-requests"
            element={<JewelleryRequestsPage />}
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
            <Route path="jewellery-requests" element={<AdminJewelleryRequestsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/shop" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

function DeferredLenis() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isCancelled = false;
    let lenisInstance: { destroy: () => void } | null = null;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const initialize = async () => {
      if (isCancelled) return;
      try {
        const { default: Lenis } = await import('lenis');
        if (isCancelled) return;

        lenisInstance = new Lenis({
          lerp: 0.09,
          duration: 1.2,
          smoothWheel: true,
          syncTouch: false,
          autoRaf: true,
        });

        (window as unknown as { __lenis?: unknown }).__lenis = lenisInstance;
      } catch (err) {
        console.error('Failed to dynamically initialize Lenis smooth scroll:', err);
      }
    };

    // Deliberate 5000ms post-mount delay to ensure critical rendering and LCP are 100% complete
    timerId = setTimeout(initialize, 5000);

    return () => {
      isCancelled = true;
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
      if (lenisInstance) {
        lenisInstance.destroy();
        (window as unknown as { __lenis?: unknown }).__lenis = null;
      }
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <>
      <DeferredLenis />
      <Router>
        <CartProvider>
          <WishlistProvider>
            <AppContent />
          </WishlistProvider>
        </CartProvider>
      </Router>
    </>
  );
}


