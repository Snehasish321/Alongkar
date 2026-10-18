import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AccountSettingsModal } from '../components/account/AccountSettingsModal';

interface AccountModalContextType {
  isAccountModalOpen: boolean;
  openAccountModal: () => void;
  closeAccountModal: () => void;
  activeTab: 'profile' | 'security';
  setActiveTab: (tab: 'profile' | 'security') => void;
}

const AccountModalContext = createContext<AccountModalContextType | undefined>(undefined);

export const AccountModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('oauth_linked') || params.has('oauth_error');
  });
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>(() => {
    if (typeof window === 'undefined') return 'profile';
    const params = new URLSearchParams(window.location.search);
    return params.has('oauth_linked') || params.has('oauth_error') ? 'security' : 'profile';
  });

  const openAccountModal = useCallback(() => {
    setIsAccountModalOpen(true);
  }, []);

  const closeAccountModal = useCallback(() => {
    setIsAccountModalOpen(false);
  }, []);

  return (
    <AccountModalContext.Provider
      value={{
        isAccountModalOpen,
        openAccountModal,
        closeAccountModal,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
      <AccountSettingsModal isOpen={isAccountModalOpen} onClose={closeAccountModal} />
    </AccountModalContext.Provider>
  );
};

export const useAccountModal = (): AccountModalContextType => {
  const context = useContext(AccountModalContext);
  if (!context) {
    throw new Error('useAccountModal must be used within an AccountModalProvider');
  }
  return context;
};
