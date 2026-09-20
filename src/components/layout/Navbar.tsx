import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Heart, ShoppingBag, Menu, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { UserButton } from '@clerk/clerk-react';
import { useAlongkarAuth } from '../../context/AuthContext';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch, onOpenMobileMenu }) => {
  const { scrolled } = useScrollPosition(30);
  const location = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();
  const { isSignedIn, openAuthModal } = useAlongkarAuth();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop All', path: '/shop' },
    { name: 'Collections', path: '/collections' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-500 ${
        scrolled
          ? 'bg-[#2A0008] shadow-[0_2px_20px_rgba(0,0,0,0.3)] py-2'
          : 'bg-[#40000D] py-3'
      }`}
      style={{
        borderBottom: scrolled
          ? '1px solid rgba(232, 201, 138, 0.12)'
          : '1px solid rgba(232, 201, 138, 0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Left: Logo (desktop) / Hamburger + Search (mobile) */}
          <div className="flex items-center gap-1 lg:gap-0">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors"
              aria-label="Open Mobile Navigation Menu"
            >
              <Menu size={22} />
            </button>

            {/* Mobile Search */}
            <button
              onClick={onOpenSearch}
              className="lg:hidden p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors"
              aria-label="Search"
            >
              <Search size={19} />
            </button>

            {/* Brand Logo — Desktop: left-aligned with nav */}
            <Link to="/" className="hidden lg:flex items-center group">
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <img
                  src="/alongkar-logo.png"
                  alt="Alongkar — City Gold Jewellery"
                  className={`transition-all duration-300 object-contain ${
                    scrolled ? 'h-9' : 'h-11'
                  }`}
                  style={{ maxWidth: '180px' }}
                />
              </motion.div>
            </Link>
          </div>

          {/* Center: Logo (mobile) */}
          <Link to="/" className="lg:hidden flex items-center justify-center">
            <img
              src="/alongkar-logo.png"
              alt="Alongkar — City Gold Jewellery"
              className="h-9 object-contain"
              style={{ maxWidth: '150px' }}
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-7">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`text-[11px] uppercase tracking-[0.2em] font-medium transition-all duration-300 relative py-1 ${
                    isActive
                      ? 'text-[#E8C98A] font-semibold'
                      : 'text-[#F8F1E3]/85 hover:text-[#E8C98A]'
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className="absolute bottom-0 left-0 right-0 h-[1.5px] rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, transparent, #E8C98A, transparent)',
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Actions: Search, Auth, Wishlist, Cart */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Desktop Search Button */}
            <button
              onClick={onOpenSearch}
              className="hidden lg:flex items-center gap-2 text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full transition-all text-[#F8F1E3]/80 hover:text-[#E8C98A] border border-[#F8F1E3]/15 hover:border-[#E8C98A]/40"
            >
              <Search size={13} />
              <span>Search</span>
            </button>

            {/* Auth Button / User Account Button */}
            {isSignedIn ? (
              <div className="flex items-center">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'w-8 h-8 rounded-full border border-[#E8C98A]/40 shadow-sm',
                    },
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => openAuthModal()}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all text-[#F8F1E3]/85 hover:text-[#E8C98A] border border-[#F8F1E3]/15 hover:border-[#E8C98A]/40"
                aria-label="Sign In"
              >
                <User size={14} />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {/* Wishlist Button */}
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-2 text-[#F8F1E3]/85 hover:text-[#E8C98A] transition-colors"
              aria-label="Wishlist"
            >
              <Heart size={19} />
              {wishlist.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-0 right-0 w-4 h-4 bg-[#E8C98A] text-[#40000D] text-[10px] font-bold flex items-center justify-center rounded-full"
                >
                  {wishlist.length}
                </motion.span>
              )}
            </button>

            {/* Shopping Bag Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-[#F8F1E3]/85 hover:text-[#E8C98A] transition-colors"
              aria-label="Shopping Bag"
            >
              <ShoppingBag size={20} />
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-0 right-0 w-4 h-4 bg-[#E8C98A] text-[#40000D] font-bold text-[10px] flex items-center justify-center rounded-full"
                >
                  {totalItems}
                </motion.span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
