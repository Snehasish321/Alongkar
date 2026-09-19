import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import type { Product } from '../types';

export type PendingAction =
  | { type: 'cart'; product: Product; quantity?: number }
  | { type: 'wishlist'; product: Product };

interface AuthContextType {
  isAuthModalOpen: boolean;
  openAuthModal: (pendingAction?: PendingAction) => void;
  closeAuthModal: () => void;
  pendingAction: PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
  executeActionWithAuth: (action: () => void, pendingAction?: PendingAction) => void;
  isSignedIn: boolean;
  isLoaded: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default publishable key fallback ensures production deployments don't crash with a blank screen
// if the environment variable hasn't been set in the deployment dashboard.
const FALLBACK_PUBLISHABLE_KEY = 'pk_test_bmF0aXZlLXdlZXZpbC02NjM0LmNsZXJrLmFjY291bnRzLmRldiQ';
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

export const AuthStateWatcher: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const onAuthenticatedCallbackRef = React.useRef<(() => void) | null>(null);

  const openAuthModal = (action?: PendingAction) => {
    if (action) {
      setPendingAction(action);
    }
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const executeActionWithAuth = (action: () => void, pending?: PendingAction) => {
    if (isSignedIn) {
      action();
    } else {
      onAuthenticatedCallbackRef.current = action;
      openAuthModal(pending);
    }
  };

  // Watch for successful authentication to automatically complete pending actions
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (onAuthenticatedCallbackRef.current) {
        const callback = onAuthenticatedCallbackRef.current;
        onAuthenticatedCallbackRef.current = null;
        callback();
      }
      setIsAuthModalOpen(false);
    }
  }, [isSignedIn, isLoaded]);

  return (
    <AuthContext.Provider
      value={{
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        pendingAction,
        setPendingAction,
        executeActionWithAuth,
        isSignedIn: !!isSignedIn,
        isLoaded: !!isLoaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AlongkarAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <AuthStateWatcher>{children}</AuthStateWatcher>
    </ClerkProvider>
  );
};

export const useAlongkarAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAlongkarAuth must be used within an AlongkarAuthProvider');
  }
  return context;
};
