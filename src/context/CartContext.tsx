import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import type { Product, CartItem } from '../types';
import { fetchProductById, fetchProducts } from '../services/productApi';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalAmount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  lastAddedProduct: Product | null;
}

const LOCAL_STORAGE_KEY = 'alongkar_cart_items_v2';

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => item?.product?.id && typeof item?.quantity === 'number');
        }
      }
    } catch {
      // Ignore localStorage parse errors
    }
    return [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastAddedProduct, setLastAddedProduct] = useState<Product | null>(null);

  // Sync state to localStorage for offline / guest persistence
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage limit errors
    }
  }, [cart]);

  // Helper to map API server items ({ productId, quantity }) to frontend CartItem[]
  const mapServerItemsToCart = useCallback(
    async (
      serverItems: Array<{ productId: string; quantity: number }>
    ): Promise<CartItem[]> => {
      if (!serverItems || serverItems.length === 0) return [];

      const productMap = new Map<string, Product>();

      try {
        const allDbProducts = await fetchProducts();
        allDbProducts.forEach((p) => {
          productMap.set(p.id, p);
        });
      } catch {
        // Fallback: individually fetch missing products
        await Promise.all(
          serverItems.map(async (item) => {
            try {
              const prod = await fetchProductById(item.productId);
              if (prod) productMap.set(prod.id, prod);
            } catch {}
          })
        );
      }

      const result: CartItem[] = [];
      for (const item of serverItems) {
        const product = productMap.get(item.productId);
        if (product) {
          result.push({
            product,
            quantity: item.quantity,
          });
        }
      }
      return result;
    },
    []
  );

  // Fetch cart from server when signed in
  useEffect(() => {
    let isCancelled = false;

    async function loadServerCart() {
      if (!isLoaded || !isSignedIn) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/cart', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!isCancelled && data.items) {
          const mapped = await mapServerItemsToCart(data.items);
          if (!isCancelled) {
            setCart(mapped);
          }
        }
      } catch (err) {
        console.error('Failed to load cart from server:', err);
      }
    }

    loadServerCart();

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, mapServerItemsToCart]);

  const addToCart = async (product: Product, quantity: number = 1) => {
    setLastAddedProduct(product);
    setIsCartOpen(true);

    const safeQty = Math.max(1, Math.floor(quantity));

    // Update local state immediately
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prevCart];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + safeQty,
        };
        return updated;
      }
      return [...prevCart, { product, quantity: safeQty }];
    });

    // If signed in, sync with server
    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) {
          const res = await fetch('/api/cart', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ productId: product.id, quantity: safeQty }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              const mapped = await mapServerItemsToCart(data.items);
              setCart(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart add with server:', err);
      }
    }
  };

  const removeFromCart = async (productId: string) => {
    // Update local state immediately
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));

    // If signed in, sync with server
    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) {
          const res = await fetch('/api/cart', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ productId }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              const mapped = await mapServerItemsToCart(data.items);
              setCart(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart remove with server:', err);
      }
    }
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const safeQty = Math.floor(quantity);

    // Update local state immediately
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId ? { ...item, quantity: safeQty } : item
      )
    );

    // If signed in, sync with server
    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) {
          const res = await fetch('/api/cart', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ productId, quantity: safeQty }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              const mapped = await mapServerItemsToCart(data.items);
              setCart(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart update with server:', err);
      }
    }
  };

  const clearCart = async () => {
    const itemsToClear = [...cart];
    setCart([]);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {}

    if (isSignedIn && itemsToClear.length > 0) {
      try {
        const token = await getToken();
        if (token) {
          await Promise.all(
            itemsToClear.map((item) =>
              fetch('/api/cart', {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ productId: item.product.id }),
              })
            )
          );
        }
      } catch (err) {
        console.error('Failed to clear cart on server:', err);
      }
    }
  };

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalAmount = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalAmount,
        isCartOpen,
        setIsCartOpen,
        lastAddedProduct,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
