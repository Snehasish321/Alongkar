import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  ChevronDown,
  User,
  Sparkles,
  ShoppingBag,
  PackageSearch,
  HelpCircle,
  RotateCcw,
  Clock,
  Package,
  Settings,
  LogOut,
} from 'lucide-react';
import { SignInButton, Show, useUser, useClerk } from '@clerk/react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user } = useUser();
  const clerk = useClerk();
  const [isShopExpanded, setIsShopExpanded] = useState(false);

  const categories = [
    { name: 'All Products', path: '/shop' },
    { name: 'Necklaces & Chokers', path: '/shop?category=necklaces' },
    { name: 'Earrings & Jhumkas', path: '/shop?category=earrings' },
    { name: 'Rings & Polki', path: '/shop?category=rings' },
    { name: 'Bangles & Bracelets', path: '/shop?category=bracelets' },
    { name: 'Artisan Chains', path: '/shop?category=chains' },
    { name: 'Medallion Pendants', path: '/shop?category=pendants' },
    { name: 'Explore All Categories', path: '/categories' },
  ];

  const secondaryLinks = [
    { name: 'Track Order', path: '/track', icon: PackageSearch },
    { name: 'Pre-Order Updates', path: '/pre-orders', icon: Clock },
    { name: 'Return & Exchange', path: '/returns', icon: RotateCcw },
    { name: 'Contact Us', path: '/contact', icon: HelpCircle },
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
            className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 left-0 bottom-0 w-[86%] max-w-sm bg-[#1C0307] text-[#F8F1E3] z-50 flex flex-col justify-between shadow-2xl border-r border-[#E8C98A]/20 overflow-y-auto"
            data-lenis-prevent
          >
            <div>
              {/* Header */}
              <div className="p-4 sm:p-5 flex items-center justify-between border-b border-[#E8C98A]/20 bg-[#28040B]">
                <Link to="/" onClick={onClose} className="flex items-center" aria-label="Alongkar Atelier Homepage">
                  <img
                    src="/alongkar-logo.png"
                    alt="Alongkar Atelier"
                    className="h-8 sm:h-9 w-auto object-contain"
                  />
                </Link>
                <button
                  onClick={onClose}
                  className="p-1.5 text-[#F8F1E3]/80 hover:text-[#E8C98A] transition-colors rounded-md hover:bg-white/10 cursor-pointer"
                  aria-label="Close navigation menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Primary Navigation Links */}
              <nav className="p-4 space-y-2">
                {/* 1. Shop (Expandable Category Accordion) */}
                <div className="border-b border-white/10 pb-2">
                  <button
                    onClick={() => setIsShopExpanded((prev) => !prev)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium tracking-wide transition-colors text-[#F8F1E3] hover:bg-white/5 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <ShoppingBag size={17} className="text-[#E8C98A]" />
                      <span>Shop Jewellery</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-[#E8C98A] transition-transform duration-200 ${isShopExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isShopExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden pl-7 pr-2 pt-1 space-y-1"
                      >
                        {categories.map((cat) => {
                          const isActive = location.pathname + location.search === cat.path;
                          return (
                            <Link
                              key={cat.name}
                              to={cat.path}
                              onClick={onClose}
                              className={`block px-3 py-2 rounded-md text-xs tracking-wide transition-colors ${
                                isActive
                                  ? 'bg-[#E8C98A]/20 text-[#FFE3C7] font-semibold'
                                  : 'text-[#F8F1E3]/75 hover:text-[#FFE3C7] hover:bg-white/5'
                              }`}
                            >
                              {cat.name}
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 2. Request Jewellery - Core USP Highlight */}
                <Link
                  to="/request-jewellery"
                  onClick={onClose}
                  className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-gradient-to-r from-[#E8C98A]/20 via-[#E8C98A]/10 to-transparent border border-[#E8C98A]/40 text-[#FFE3C7] font-semibold text-sm tracking-wide shadow-xs transition-all hover:bg-[#E8C98A]/25"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles size={16} className="text-[#E8C98A]" />
                    <span>Request Jewellery</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#E8C98A] text-[#2A0008] tracking-widest">
                    USP
                  </span>
                </Link>

                {/* 3. Best Sellers */}
                <Link
                  to="/best-sellers"
                  onClick={onClose}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium tracking-wide transition-colors ${
                    location.pathname === '/best-sellers'
                      ? 'bg-white/10 text-[#E8C98A] font-semibold'
                      : 'text-[#F8F1E3]/90 hover:bg-white/5 hover:text-[#E8C98A]'
                  }`}
                >
                  <span>Best Sellers</span>
                  <ChevronRight size={15} className="text-[#E8C98A]/60" />
                </Link>

                {/* 4. Collections */}
                <Link
                  to="/collections"
                  onClick={onClose}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium tracking-wide transition-colors ${
                    location.pathname === '/collections'
                      ? 'bg-white/10 text-[#E8C98A] font-semibold'
                      : 'text-[#F8F1E3]/90 hover:bg-white/5 hover:text-[#E8C98A]'
                  }`}
                >
                  <span>Collections</span>
                  <ChevronRight size={15} className="text-[#E8C98A]/60" />
                </Link>

                {/* Secondary Navigation Section */}
                <div className="pt-4 mt-4 border-t border-white/10 space-y-1">
                  <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-widest text-[#E8C98A]/60">
                    Client Services
                  </div>
                  {secondaryLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.name}
                        to={link.path}
                        onClick={onClose}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-[#F8F1E3]/70 hover:text-[#FFE3C7] hover:bg-white/5 transition-colors"
                      >
                        <Icon size={14} className="text-[#E8C98A]/70" />
                        <span>{link.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>

            {/* Footer / Account Authentication */}
            <div className="p-4 border-t border-white/10 bg-[#28040B]/80 space-y-3">
              <Show when="signed-in">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt={user.fullName || 'User'}
                        className="w-9 h-9 rounded-full object-cover border border-[#E8C98A]/40 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#E8C98A]/20 border border-[#E8C98A]/40 flex items-center justify-center text-[#E8C98A] shrink-0 font-serif font-bold text-xs">
                        {(user?.fullName || user?.firstName || 'A').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#FFE3C7] truncate">
                        {user?.fullName || user?.firstName || 'Alongkar Client'}
                      </p>
                      {user?.primaryEmailAddress?.emailAddress && (
                        <p className="text-[10px] text-[#F8F1E3]/60 truncate font-normal">
                          {user.primaryEmailAddress.emailAddress}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                    <Link
                      to="/orders"
                      onClick={onClose}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-[#E8C98A]/15 border border-[#E8C98A]/20 text-[11px] font-medium text-[#FFE3C7] transition-colors"
                    >
                      <Package size={14} className="text-[#E8C98A]" />
                      <span>My Orders</span>
                    </Link>
                    <Link
                      to="/jewellery-requests"
                      onClick={onClose}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-[#E8C98A]/15 border border-[#E8C98A]/20 text-[11px] font-medium text-[#FFE3C7] transition-colors"
                    >
                      <Sparkles size={14} className="text-[#E8C98A]" />
                      <span>Requests</span>
                    </Link>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-[#F8F1E3]/70">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        clerk.openUserProfile();
                      }}
                      className="hover:text-[#E8C98A] transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Settings size={13} />
                      <span>Account Settings</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        onClose();
                        await clerk.signOut();
                      }}
                      className="text-red-300 hover:text-red-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <LogOut size={13} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    onClick={onClose}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-[#E8C98A] to-[#FFE3C7] text-[#2A0008] text-xs font-bold uppercase tracking-wider rounded-lg hover:brightness-105 transition-all shadow-md cursor-pointer"
                  >
                    <User size={15} />
                    <span>Sign In / Register</span>
                  </button>
                </SignInButton>
              </Show>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
