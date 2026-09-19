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

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const AuthStateWatcher: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [onAuthenticatedCallback, setOnAuthenticatedCallback] = useState<(() => void) | null>(null);

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
      setOnAuthenticatedCallback(() => action);
      openAuthModal(pending);
    }
  };

  // Watch for successful authentication to automatically complete pending actions
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      if (onAuthenticatedCallback) {
        onAuthenticatedCallback();
        setOnAuthenticatedCallback(null);
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
  if (!PUBLISHABLE_KEY) {
    console.warn('VITE_CLERK_PUBLISHABLE_KEY is missing in environment variables.');
  }

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY || ''}>
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
