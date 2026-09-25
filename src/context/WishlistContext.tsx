import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import type { Product } from '../types';
import { productsData } from '../data/products';

interface WishlistContextType {
  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  isWishlistOpen: boolean;
  setIsWishlistOpen: (open: boolean) => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  // Helper to map API items ({ productId }) to frontend Product[]
  const mapServerItemsToWishlist = useCallback((serverItems: Array<{ productId: string }>): Product[] => {
    const result: Product[] = [];
    for (const item of serverItems) {
      const product = productsData.find((p) => p.id === item.productId);
      if (product) {
        result.push(product);
      }
    }
    return result;
  }, []);

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
          const mapped = mapServerItemsToWishlist(data.items);
          setWishlist(mapped);
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
              setWishlist(mapServerItemsToWishlist(data.items));
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync wishlist toggle with server:', err);
      }
    }

    // Fallback or Signed-out guest in-memory state
    setWishlist((prev) => {
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
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
