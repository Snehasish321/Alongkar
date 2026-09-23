import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, User } from 'lucide-react';
import { SignInButton, Show, UserButton } from '@clerk/react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop By Category', path: '/categories' },
    { name: 'All Products', path: '/shop' },
    { name: 'Best Seller', path: '/best-sellers' },
    { name: 'Return & Exchange', path: '/returns' },
    { name: 'Pre-Order Updates', path: '/pre-orders' },
    { name: 'Contact Us', path: '/contact' },
    { name: 'Track Order', path: '/track' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 left-0 bottom-0 w-[84%] max-w-xs bg-white text-neutral-900 z-50 flex flex-col justify-between shadow-2xl border-r border-neutral-200 overflow-y-auto"
            data-lenis-prevent
          >
            <div>
              {/* Header */}
              <div className="p-5 flex items-center justify-between border-b border-neutral-100">
                <Link to="/" onClick={onClose} className="flex flex-col">
                  <span className="font-bold text-lg tracking-[0.16em] uppercase text-black">
                    ALONGKAR
                  </span>
                  <span className="text-[7.5px] tracking-[0.3em] uppercase text-neutral-400">
                    ATELIER
                  </span>
                </Link>
                <button
                  onClick={onClose}
                  className="p-1.5 text-neutral-500 hover:text-black transition-colors rounded-md hover:bg-neutral-100 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Links */}
              <nav className="p-4 space-y-1">
                {navLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.name}
                      to={link.path}
                      onClick={onClose}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm tracking-wide transition-colors ${
                        isActive
                          ? 'bg-neutral-100 font-semibold text-black'
                          : 'text-neutral-700 hover:bg-neutral-50 hover:text-black'
                      }`}
                    >
                      <span>{link.name}</span>
                      <ChevronRight size={14} className="text-neutral-400" />
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Footer / Account */}
            <div className="p-5 border-t border-neutral-100 bg-neutral-50">
              <div className="flex items-center justify-between">
                <Show when="signed-in">
                  <div className="flex items-center gap-3">
                    <UserButton />
                    <span className="text-xs font-medium text-neutral-700">Account</span>
                  </div>
                </Show>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      onClick={onClose}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-md hover:bg-neutral-800 transition-colors"
                    >
                      <User size={15} />
                      <span>Sign In / Register</span>
                    </button>
                  </SignInButton>
                </Show>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
