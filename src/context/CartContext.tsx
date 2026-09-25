import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import type { Product, CartItem } from '../types';
import { productsData } from '../data/products';

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

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastAddedProduct, setLastAddedProduct] = useState<Product | null>(null);

  // Helper to map API items ({ productId, quantity }) to frontend CartItem[]
  const mapServerItemsToCart = useCallback((serverItems: Array<{ productId: string; quantity: number }>): CartItem[] => {
    const result: CartItem[] = [];
    for (const item of serverItems) {
      const product = productsData.find((p) => p.id === item.productId);
      if (product) {
        result.push({
          product,
          quantity: item.quantity,
        });
      }
    }
    return result;
  }, []);

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
          const mapped = mapServerItemsToCart(data.items);
          setCart(mapped);
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
            body: JSON.stringify({ productId: product.id, quantity }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              setCart(mapServerItemsToCart(data.items));
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart add with server:', err);
      }
    }

    // Fallback or Signed-out guest in-memory state
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prevCart];
        updated[existingIndex].quantity += quantity;
        return updated;
      }
      return [...prevCart, { product, quantity }];
    });
  };

  const removeFromCart = async (productId: string) => {
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
              setCart(mapServerItemsToCart(data.items));
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart remove with server:', err);
      }
    }

    // Fallback or Signed-out guest in-memory state
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

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
            body: JSON.stringify({ productId, quantity }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.items) {
              setCart(mapServerItemsToCart(data.items));
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart update with server:', err);
      }
    }

    // Fallback or Signed-out guest in-memory state
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = async () => {
    if (isSignedIn && cart.length > 0) {
      try {
        const token = await getToken();
        if (token) {
          await Promise.all(
            cart.map((item) =>
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
    setCart([]);
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
