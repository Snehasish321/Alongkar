import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import type { Product } from '../types';
import { fetchProductById, fetchProducts } from '../services/productApi';

interface WishlistContextType {
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  isWishlistOpen: boolean;
  setIsWishlistOpen: (open: boolean) => void;
}

const LOCAL_STORAGE_KEY = 'alongkar_wishlist_items_v2';

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((p) => p && p.id);
        }
      }
    } catch {
      // Ignore localStorage parse errors
    }
    return [];
  });

  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  // Sync state to localStorage for offline / guest persistence
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // Ignore storage limit errors
    }
  }, [wishlist]);

  // Helper to map API server items ({ productId }) to frontend Product[]
  const mapServerItemsToWishlist = useCallback(
    async (serverItems: Array<{ productId: string }>): Promise<Product[]> => {
      if (!serverItems || serverItems.length === 0) return [];

      const productMap = new Map<string, Product>();

      try {
        const allDbProducts = await fetchProducts();
        allDbProducts.forEach((p) => {
          productMap.set(p.id, p);
        });
      } catch {
        await Promise.all(
          serverItems.map(async (item) => {
            try {
              const prod = await fetchProductById(item.productId);
              if (prod) productMap.set(prod.id, prod);
            } catch {}
          })
        );
      }

      const result: Product[] = [];
      for (const item of serverItems) {
        const product = productMap.get(item.productId);
        if (product) {
          result.push(product);
        }
      }
      return result;
    },
    []
  );

  // Fetch wishlist from server when signed in
  useEffect(() => {
    let isCancelled = false;

    async function loadServerWishlist() {
      if (!isLoaded || !isSignedIn) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/wishlist', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!isCancelled && data.items) {
          const mapped = await mapServerItemsToWishlist(data.items);
          if (!isCancelled) {
            setWishlist(mapped);
          }
        }
      } catch (err) {
        console.error('Failed to load wishlist from server:', err);
      }
    }

    loadServerWishlist();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, mapServerItemsToWishlist]);

  const toggleWishlist = async (product: Product) => {
    const exists = wishlist.some((p) => p.id === product.id);

    // Update local state immediately
    setWishlist((prev) => {
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });

    // If signed in, sync with server
    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) {
          const method = exists ? 'DELETE' : 'POST';
          const res = await fetch('/api/wishlist', {
            method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ productId: product.id }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              const mapped = await mapServerItemsToWishlist(data.items);
              setWishlist(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync wishlist toggle with server:', err);
      }
    }
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some((p) => p.id === productId);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        toggleWishlist,
        isInWishlist,
        isWishlistOpen,
        setIsWishlistOpen,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
