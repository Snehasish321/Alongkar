/**
 * Regression Test Suite: Cart Initialization Race Condition & Authentication Lifecycle
 * 
 * Verifies:
 * 1. Initial mount with unresolved Clerk authentication (!isLoaded) does NOT display stale guest-cart items.
 * 2. Authenticated reload (server cart = 1 item, stale guest storage = 10 items) never flashes 10 items.
 * 3. Genuine signed-out guest cart from localStorage is loaded and displayed once Clerk confirms visitor is signed out.
 * 4. Strict guest / authenticated cart separation:
 *    - Login: Guest cart in localStorage is preserved (not merged into DB, not wiped).
 *    - Logout: Guest cart is restored from localStorage; authenticated items never leak to localStorage.
 * 5. Out-of-order & stale asynchronous responses (slow network, account switching) never overwrite active cart.
 * 6. Cart mutations (add, update, remove, clear) maintain proper state and versioning.
 */

import assert from 'assert';

console.log('====================================================');
console.log('TEST SUITE: CART INITIALIZATION RACE CONDITION FIX');
console.log('====================================================\n');

let passedCount = 0;
let failedCount = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✅ [PASS] ${name}`);
        passedCount++;
      }).catch((err) => {
        console.error(`❌ [FAIL] ${name}:`, err.message);
        failedCount++;
      });
    } else {
      console.log(`✅ [PASS] ${name}`);
      passedCount++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failedCount++;
  }
}

// Mock localStorage implementation
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const GUEST_CART_STORAGE_KEY = 'alongkar_guest_cart_v1';
const MAX_ITEM_QUANTITY = 99;

interface CartItem {
  product: { id: string; name: string; price: number };
  quantity: number;
}

/**
 * Headless CartManager that mirrors the exact logic in CartContext.tsx
 */
class HeadlessCartManager {
  cart: CartItem[] = [];
  isCartOpen = false;
  lastAddedProduct: any = null;

  private prevIsSignedIn: boolean | null = null;
  private prevUserId: string | null | undefined = undefined;
  private currentUserId: string | null | undefined = undefined;
  private serverSyncVersion = 0;
  private isGuestLoaded = false;
  private localStorage: MockLocalStorage;
  private serverApiMock: (token: string, userId: string) => Promise<{ items: Array<{ productId: string; quantity: number }> }>;
  private productApiMock: (productId: string) => Promise<{ id: string; name: string; price: number }>;

  // Track state history for assertions (e.g. to ensure stale counts never flash)
  stateHistory: number[] = [];

  constructor(
    storage: MockLocalStorage,
    serverApi: (token: string, userId: string) => Promise<{ items: Array<{ productId: string; quantity: number }> }>,
    productApi: (productId: string) => Promise<{ id: string; name: string; price: number }>
  ) {
    this.localStorage = storage;
    this.serverApiMock = serverApi;
    this.productApiMock = productApi;
    // Initial state: starts as empty array while Clerk auth is unresolved
    this.cart = [];
    this.stateHistory.push(this.totalItems);
  }

  get totalItems(): number {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  get totalAmount(): number {
    return this.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }

  private loadGuestCart(): CartItem[] {
    try {
      const saved = this.localStorage.getItem(GUEST_CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) => item?.product?.id && typeof item?.quantity === 'number' && item.quantity > 0
          );
        }
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  }

  private persistGuestCart(): void {
    try {
      this.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(this.cart));
    } catch {
      // Ignore storage errors
    }
  }

  private async mapServerItemsToCart(serverItems: Array<{ productId: string; quantity: number }>): Promise<CartItem[]> {
    const result: CartItem[] = [];
    for (const item of serverItems) {
      const product = await this.productApiMock(item.productId);
      if (product) {
        result.push({
          product,
          quantity: Math.min(MAX_ITEM_QUANTITY, Math.max(1, item.quantity)),
        });
      }
    }
    return result;
  }

  /**
   * Simulates Clerk authentication lifecycle change (useEffect in CartContext.tsx)
   */
  async syncAuthState(params: {
    isLoaded: boolean;
    isSignedIn: boolean;
    userId?: string | null;
    getToken: () => Promise<string | null>;
  }): Promise<void> {
    const { isLoaded, isSignedIn, userId, getToken } = params;

    this.currentUserId = userId;

    // 1. If Clerk has not resolved yet (!isLoaded), do nothing: cart remains empty []
    if (!isLoaded) {
      return;
    }

    const wasSignedIn = this.prevIsSignedIn;
    const prevUserId = this.prevUserId;
    this.prevIsSignedIn = isSignedIn;
    this.prevUserId = userId;

    if (isSignedIn) {
      // Authenticated visitor: guest cart is not active
      this.isGuestLoaded = false;

      const isUserSwitch = wasSignedIn === true && prevUserId !== undefined && prevUserId !== userId;
      const isInitialOrLogin = wasSignedIn !== true || isUserSwitch;
      if (isInitialOrLogin) {
        this.cart = [];
        this.stateHistory.push(this.totalItems);
      }

      const syncVersion = ++this.serverSyncVersion;
      const targetUserId = userId;

      const token = await getToken();
      if (!token) return;

      const serverData = await this.serverApiMock(token, targetUserId!);
      if (
        this.serverSyncVersion === syncVersion &&
        this.currentUserId === targetUserId
      ) {
        const mapped = await this.mapServerItemsToCart(serverData.items);
        if (
          this.serverSyncVersion === syncVersion &&
          this.currentUserId === targetUserId
        ) {
          this.cart = mapped;
          this.stateHistory.push(this.totalItems);
        }
      }
    } else {
      // Signed out: cancel pending server operations and restore guest cart
      ++this.serverSyncVersion;
      const guestItems = this.loadGuestCart();
      this.cart = guestItems;
      this.isGuestLoaded = true;
      this.stateHistory.push(this.totalItems);
    }
  }

  // Mutation: Add to cart
  async addToCart(
    product: { id: string; name: string; price: number },
    quantity = 1,
    authContext: { isSignedIn: boolean; userId?: string | null; getToken: () => Promise<string | null> }
  ): Promise<void> {
    const safeQty = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(quantity)));

    const existingIndex = this.cart.findIndex((item) => item.product.id === product.id);
    if (existingIndex > -1) {
      const combined = Math.min(MAX_ITEM_QUANTITY, this.cart[existingIndex].quantity + safeQty);
      this.cart[existingIndex] = { ...this.cart[existingIndex], quantity: combined };
    } else {
      this.cart.push({ product, quantity: safeQty });
    }
    this.stateHistory.push(this.totalItems);

    if (!authContext.isSignedIn && this.isGuestLoaded) {
      this.persistGuestCart();
    }
  }

  // Mutation: Update quantity
  updateQuantity(productId: string, quantity: number, authContext: { isSignedIn: boolean }): void {
    if (quantity <= 0) {
      this.cart = this.cart.filter((item) => item.product.id !== productId);
    } else {
      const safeQty = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(quantity)));
      this.cart = this.cart.map((item) => (item.product.id === productId ? { ...item, quantity: safeQty } : item));
    }
    this.stateHistory.push(this.totalItems);

    if (!authContext.isSignedIn && this.isGuestLoaded) {
      this.persistGuestCart();
    }
  }

  // Mutation: Remove from cart
  removeFromCart(productId: string, authContext: { isSignedIn: boolean }): void {
    this.cart = this.cart.filter((item) => item.product.id !== productId);
    this.stateHistory.push(this.totalItems);

    if (!authContext.isSignedIn && this.isGuestLoaded) {
      this.persistGuestCart();
    }
  }

  // Mutation: Clear cart
  clearCart(authContext: { isSignedIn: boolean }): void {
    this.cart = [];
    ++this.serverSyncVersion;
    this.stateHistory.push(this.totalItems);

    if (!authContext.isSignedIn) {
      this.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Executions
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
  const mockStorage = new MockLocalStorage();
  const mockProducts: Record<string, { id: string; name: string; price: number }> = {
    'prod-server-1': { id: 'prod-server-1', name: '24K Gold Kundan Necklace', price: 12500 },
    'prod-guest-1': { id: 'prod-guest-1', name: 'Artisan Jhumka Earrings', price: 3200 },
    'prod-guest-2': { id: 'prod-guest-2', name: 'Polki Heritage Choker', price: 8500 },
  };

  const productApiMock = async (id: string) => mockProducts[id] || { id, name: 'Unknown', price: 1000 };

  // ─── Test 1: Authenticated Reload with Stale 10-Item Guest Cart in Storage ───
  await test('Authenticated reload: Stale guest count (10) NEVER appears; transitions 0 -> 1', async () => {
    mockStorage.clear();
    // Pre-populate guest localStorage with 10 units of an item
    mockStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ product: mockProducts['prod-guest-1'], quantity: 10 }])
    );

    // Server has 1 item
    const serverApiMock = async () => ({
      items: [{ productId: 'prod-server-1', quantity: 1 }],
    });

    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // Step A: Initial mount, Clerk authentication is unresolved (!isLoaded)
    await manager.syncAuthState({
      isLoaded: false,
      isSignedIn: false,
      getToken: async () => null,
    });

    assert.strictEqual(manager.cart.length, 0, 'Cart must be empty while isLoaded is false');
    assert.strictEqual(manager.totalItems, 0, 'Total items must be 0 while isLoaded is false');

    // Step B: Clerk resolves as authenticated (isSignedIn: true)
    await manager.syncAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_clerk_123',
      getToken: async () => 'test_jwt_token',
    });

    assert.strictEqual(manager.cart.length, 1, 'Cart now has 1 authenticated item');
    assert.strictEqual(manager.cart[0].product.id, 'prod-server-1', 'Contains server product');
    assert.strictEqual(manager.totalItems, 1, 'Total items is 1');

    // Verify history: Count should ONLY have been [0, 1] (or [0, 0, 1]), NEVER 10!
    assert.ok(
      !manager.stateHistory.includes(10),
      `Stale guest count 10 must NEVER appear in state history. History: ${JSON.stringify(manager.stateHistory)}`
    );
  });

  // ─── Test 2: Genuine Guest Cart Load when Signed Out ────────────────────────
  await test('Guest visitor: Genuine guest items loaded once signed-out confirmed', async () => {
    mockStorage.clear();
    mockStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([
        { product: mockProducts['prod-guest-1'], quantity: 2 },
        { product: mockProducts['prod-guest-2'], quantity: 3 },
      ])
    );

    const serverApiMock = async () => ({ items: [] });
    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // Initial mount: unresolved
    await manager.syncAuthState({ isLoaded: false, isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 0, 'Unresolved state shows 0 items');

    // Clerk confirms visitor is signed out
    await manager.syncAuthState({ isLoaded: true, isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 5, 'Guest cart loaded: 2 + 3 = 5 items');
    assert.strictEqual(manager.cart.length, 2, '2 distinct items in guest cart');
  });

  // ─── Test 3: Guest Cart Persistence ─────────────────────────────────────────
  await test('Guest persistence: Updating guest cart persists changes to localStorage', async () => {
    mockStorage.clear();
    const serverApiMock = async () => ({ items: [] });
    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // Mount as signed-out visitor
    await manager.syncAuthState({ isLoaded: true, isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 0);

    // Guest adds item
    await manager.addToCart(mockProducts['prod-guest-1'], 2, { isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 2);

    // Check localStorage
    const saved = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY) || '[]');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].quantity, 2);

    // Guest updates quantity to 4
    manager.updateQuantity('prod-guest-1', 4, { isSignedIn: false });
    assert.strictEqual(manager.totalItems, 4);
    const updated = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY) || '[]');
    assert.strictEqual(updated[0].quantity, 4);
  });

  // ─── Test 4: Strict Guest & Authenticated Cart Separation on Login & Logout ──
  await test('Login / Logout: Guest cart in localStorage is preserved and isolated; DB cart never leaked', async () => {
    mockStorage.clear();
    // Guest has 2 units in localStorage
    mockStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ product: mockProducts['prod-guest-1'], quantity: 2 }])
    );

    // User has 1 unit of a different product in database
    const serverApiMock = async () => ({
      items: [{ productId: 'prod-server-1', quantity: 1 }],
    });

    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // 1. Start as guest
    await manager.syncAuthState({ isLoaded: true, isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 2, 'Guest cart has 2 items');

    // 2. User logs in
    await manager.syncAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_xyz',
      getToken: async () => 'valid_token',
    });

    // Active cart must now be server cart ONLY (1 item)
    assert.strictEqual(manager.totalItems, 1, 'Authenticated cart has 1 server item');
    assert.strictEqual(manager.cart[0].product.id, 'prod-server-1');

    // Crucial: localStorage guest cart must NOT have been overwritten with server item!
    const storedGuestCartWhileLoggedIn = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY) || '[]');
    assert.strictEqual(storedGuestCartWhileLoggedIn.length, 1, 'Guest cart still stored');
    assert.strictEqual(storedGuestCartWhileLoggedIn[0].product.id, 'prod-guest-1', 'Guest item preserved');
    assert.strictEqual(storedGuestCartWhileLoggedIn[0].quantity, 2, 'Guest quantity preserved');

    // 3. User logs out
    await manager.syncAuthState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: async () => null,
    });

    // Active cart immediately restores the guest cart from localStorage
    assert.strictEqual(manager.totalItems, 2, 'Guest cart restored upon logout');
    assert.strictEqual(manager.cart[0].product.id, 'prod-guest-1');
  });

  // ─── Test 5: Out-of-Order / Stale Async Responses ────────────────────────────
  await test('Out-of-order responses: Slow network response does not overwrite newer state', async () => {
    mockStorage.clear();
    let resolveSlowFetch: (val: any) => void;
    const slowServerPromise = new Promise<{ items: Array<{ productId: string; quantity: number }> }>((resolve) => {
      resolveSlowFetch = resolve;
    });

    let currentServerCall = 0;
    const serverApiMock = async (_token: string, userId: string) => {
      currentServerCall++;
      if (currentServerCall === 1) {
        // Slow call (e.g. initial login for user A)
        return slowServerPromise;
      }
      // Fast call (e.g. login for user B)
      return { items: [{ productId: 'prod-server-1', quantity: 5 }] };
    };

    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // User A logs in (triggers slow call 1)
    const loginUserAPromise = manager.syncAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_A',
      getToken: async () => 'token_A',
    });

    // While User A call is in-flight, user switches to User B (triggers fast call 2)
    await manager.syncAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_B',
      getToken: async () => 'token_B',
    });

    assert.strictEqual(manager.totalItems, 5, 'User B cart is active with 5 items');

    // Now slow call 1 for User A resolves late with 1 item
    resolveSlowFetch!({ items: [{ productId: 'prod-server-1', quantity: 1 }] });
    await loginUserAPromise;

    // Verify User A's stale response was safely DISCARDED
    assert.strictEqual(manager.totalItems, 5, 'User B cart remains 5 items; User A stale response was dropped');
  });

  // ─── Test 6: Delayed Server Response After Logout ───────────────────────────
  await test('Logout while fetch in-flight: Late server response does not overwrite guest cart', async () => {
    mockStorage.clear();
    mockStorage.setItem(
      GUEST_CART_STORAGE_KEY,
      JSON.stringify([{ product: mockProducts['prod-guest-1'], quantity: 3 }])
    );

    let resolveSlowFetch: (val: any) => void;
    const slowServerPromise = new Promise<{ items: Array<{ productId: string; quantity: number }> }>((resolve) => {
      resolveSlowFetch = resolve;
    });

    const serverApiMock = async () => slowServerPromise;
    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    // Mount and authenticate User X (triggers slow fetch)
    const loginPromise = manager.syncAuthState({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_X',
      getToken: async () => 'token_X',
    });

    // User logs out before slow fetch returns
    await manager.syncAuthState({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken: async () => null,
    });

    assert.strictEqual(manager.totalItems, 3, 'Guest cart active with 3 items');

    // Server fetch for user_X now finishes
    resolveSlowFetch!({ items: [{ productId: 'prod-server-1', quantity: 10 }] });
    await loginPromise;

    // Stale server response must be discarded; guest cart must remain intact
    assert.strictEqual(manager.totalItems, 3, 'Guest cart remains 3; server response was discarded after logout');
    const saved = JSON.parse(mockStorage.getItem(GUEST_CART_STORAGE_KEY) || '[]');
    assert.strictEqual(saved[0].quantity, 3, 'localStorage never corrupted with server response');
  });

  // ─── Test 7: Clear Cart State ───────────────────────────────────────────────
  await test('Clear cart: Wipes in-memory items and invalidates pending responses', async () => {
    mockStorage.clear();
    const serverApiMock = async () => ({ items: [] });
    const manager = new HeadlessCartManager(mockStorage, serverApiMock, productApiMock);

    await manager.syncAuthState({ isLoaded: true, isSignedIn: false, getToken: async () => null });
    await manager.addToCart(mockProducts['prod-guest-1'], 2, { isSignedIn: false, getToken: async () => null });
    assert.strictEqual(manager.totalItems, 2);

    manager.clearCart({ isSignedIn: false });
    assert.strictEqual(manager.totalItems, 0, 'Cart is cleared');
    assert.strictEqual(mockStorage.getItem(GUEST_CART_STORAGE_KEY), null, 'localStorage item removed');
  });

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
