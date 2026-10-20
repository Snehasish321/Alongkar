import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
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

const GUEST_CART_STORAGE_KEY = 'alongkar_guest_cart_v1';
const MAX_ITEM_QUANTITY = 99;

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded, getToken, userId } = useAuth();

  // Helper to load unauthenticated guest cart from localStorage
  const loadGuestCart = (): CartItem[] => {
    try {
      const saved = localStorage.getItem(GUEST_CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) => item?.product?.id && typeof item?.quantity === 'number' && item.quantity > 0
          );
        }
      }
    } catch {
      // Ignore localStorage parse errors
    }
    return [];
  };

  // Cart starts empty while Clerk authentication is unresolved (!isLoaded)
  // to prevent displaying stale guest-cart quantities before auth state is known.
  const [cart, setCart] = useState<CartItem[]>([]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastAddedProduct, setLastAddedProduct] = useState<Product | null>(null);

  // Track authentication state transitions to handle login, logout, and account switches cleanly
  const prevIsSignedInRef = useRef<boolean | null>(null);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const currentUserIdRef = useRef<string | null | undefined>(userId);
  currentUserIdRef.current = userId;

  // Monotonically increasing counter to prevent out-of-order or stale async responses from overwriting cart
  const serverSyncVersionRef = useRef<number>(0);

  // Flag ensuring localStorage is only written when guest cart is actively in use
  const isGuestLoadedRef = useRef<boolean>(false);

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
        let product = productMap.get(item.productId);
        if (!product) {
          try {
            const fetched = await fetchProductById(item.productId);
            if (fetched) {
              product = fetched;
              productMap.set(fetched.id, fetched);
            }
          } catch {}
        }
        if (product) {
          result.push({
            product,
            quantity: Math.min(MAX_ITEM_QUANTITY, Math.max(1, item.quantity)),
          });
        }
      }
      return result;
    },
    []
  );

  // ─── Authentication Lifecycle Effect ──────────────────────────────────────────
  // Strict separation: When logged in, fetch ONLY the user's PostgreSQL cart.
  // When logged out, switch to the isolated guest cart without writing server items.
  useEffect(() => {
    let isCancelled = false;

    // Do nothing while Clerk authentication is unresolved
    if (!isLoaded) return;

    const wasSignedIn = prevIsSignedInRef.current;
    const prevUserId = prevUserIdRef.current;
    prevIsSignedInRef.current = isSignedIn;
    prevUserIdRef.current = userId;

    if (isSignedIn) {
      // Visitor is confirmed authenticated: guest cart must not be active
      isGuestLoadedRef.current = false;

      // When transitioning to authenticated or switching user accounts,
      // reset in-memory cart until authoritative server cart arrives.
      const isUserSwitch = wasSignedIn === true && prevUserId !== undefined && prevUserId !== userId;
      const isInitialOrLogin = wasSignedIn !== true || isUserSwitch;
      if (isInitialOrLogin) {
        setCart([]);
      }

      const syncVersion = ++serverSyncVersionRef.current;
      const targetUserId = userId;

      async function loadServerCart() {
        try {
          const token = await getToken();
          if (!token || isCancelled) return;

          const res = await fetch('/api/cart', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (
              !isCancelled &&
              data.items &&
              serverSyncVersionRef.current === syncVersion &&
              currentUserIdRef.current === targetUserId
            ) {
              const mapped = await mapServerItemsToCart(data.items);
              if (
                !isCancelled &&
                serverSyncVersionRef.current === syncVersion &&
                currentUserIdRef.current === targetUserId
              ) {
                setCart(mapped);
              }
            }
          } else {
            console.error('Failed to load server cart, status:', res.status);
          }
        } catch (err) {
          console.error('Failed to fetch authenticated cart from server:', err);
        }
      }

      loadServerCart();
    } else {
      // Visitor is confirmed signed out: cancel pending server operations and restore guest cart
      ++serverSyncVersionRef.current;
      const guestItems = loadGuestCart();
      setCart(guestItems);
      isGuestLoadedRef.current = true;
    }

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, getToken, mapServerItemsToCart]);

  // ─── Guest Cart Persistence Effect ───────────────────────────────────────────
  // ONLY persist to localStorage when unauthenticated and after guest cart has been loaded,
  // so authenticated database carts are never copied or leaked into the guest cart storage.
  useEffect(() => {
    if (isLoaded && !isSignedIn && isGuestLoadedRef.current) {
      try {
        localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(cart));
      } catch {
        // Ignore storage limit errors
      }
    }
  }, [cart, isLoaded, isSignedIn]);

  // ─── Add to Cart ─────────────────────────────────────────────────────────────
  const addToCart = async (product: Product, quantity: number = 1) => {
    setLastAddedProduct(product);

    const safeQty = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(quantity)));

    // Update active React cart state
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prevCart];
        const combinedQty = Math.min(
          MAX_ITEM_QUANTITY,
          updated[existingIndex].quantity + safeQty
        );
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: combinedQty,
        };
        return updated;
      }
      return [...prevCart, { product, quantity: safeQty }];
    });

    // If signed in, synchronize exclusively with the authenticated user's PostgreSQL cart
    if (isSignedIn) {
      const mutationVersion = ++serverSyncVersionRef.current;
      const requestUserId = userId;
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
            if (
              data.items &&
              serverSyncVersionRef.current === mutationVersion &&
              currentUserIdRef.current === requestUserId &&
              isSignedIn
            ) {
              const mapped = await mapServerItemsToCart(data.items);
              if (
                serverSyncVersionRef.current === mutationVersion &&
                currentUserIdRef.current === requestUserId &&
                isSignedIn
              ) {
                setCart(mapped);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart add with server:', err);
      }
    }
  };

  // ─── Remove from Cart ────────────────────────────────────────────────────────
  const removeFromCart = async (productId: string) => {
    // Update active React cart state
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));

    // If signed in, remove from authenticated user's database cart
    if (isSignedIn) {
      const mutationVersion = ++serverSyncVersionRef.current;
      const requestUserId = userId;
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
            if (
              data.items &&
              serverSyncVersionRef.current === mutationVersion &&
              currentUserIdRef.current === requestUserId &&
              isSignedIn
            ) {
              const mapped = await mapServerItemsToCart(data.items);
              if (
                serverSyncVersionRef.current === mutationVersion &&
                currentUserIdRef.current === requestUserId &&
                isSignedIn
              ) {
                setCart(mapped);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart remove with server:', err);
      }
    }
  };

  // ─── Update Quantity ─────────────────────────────────────────────────────────
  const updateQuantity = async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const safeQty = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(quantity)));

    // Update active React cart state
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.product.id === productId ? { ...item, quantity: safeQty } : item
      )
    );

    // If signed in, update authenticated user's database cart
    if (isSignedIn) {
      const mutationVersion = ++serverSyncVersionRef.current;
      const requestUserId = userId;
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
            if (
              data.items &&
              serverSyncVersionRef.current === mutationVersion &&
              currentUserIdRef.current === requestUserId &&
              isSignedIn
            ) {
              const mapped = await mapServerItemsToCart(data.items);
              if (
                serverSyncVersionRef.current === mutationVersion &&
                currentUserIdRef.current === requestUserId &&
                isSignedIn
              ) {
                setCart(mapped);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync cart update with server:', err);
      }
    }
  };

  // ─── Clear Cart ──────────────────────────────────────────────────────────────
  const clearCart = async () => {
    setCart([]);
    ++serverSyncVersionRef.current;

    if (!isSignedIn) {
      try {
        localStorage.removeItem(GUEST_CART_STORAGE_KEY);
      } catch {}
    } else {
      // Clear authenticated database cart via atomic DELETE
      try {
        const token = await getToken();
        if (token) {
          await fetch('/api/cart', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ clearAll: true }),
          });
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
