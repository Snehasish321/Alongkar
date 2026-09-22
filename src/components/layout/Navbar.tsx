import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Heart, ShoppingBag, Menu, User, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/react';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch, onOpenMobileMenu }) => {
  const { scrolled } = useScrollPosition(25);
  const location = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop All', path: '/shop' },
    { name: 'Collections', path: '/collections' },
    { name: 'Heritage', path: '/about' },
    { name: 'Concierge', path: '/contact' },
  ];

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-500 ${
        scrolled
          ? 'bg-[#1C0106]/92 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] py-2.5'
          : 'bg-[#2A0008]/96 backdrop-blur-md py-3.5'
      }`}
      style={{
        borderBottom: scrolled
          ? '1px solid rgba(232, 201, 138, 0.2)'
          : '1px solid rgba(232, 201, 138, 0.1)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">

          {/* Left: Mobile Hamburger & Search / Desktop Brand Logo */}
          <div className="flex items-center gap-1.5 lg:gap-0">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/5 cursor-pointer"
              aria-label="Open Mobile Navigation Menu"
            >
              <Menu size={22} />
            </button>

            {/* Mobile Search */}
            <button
              onClick={onOpenSearch}
              className="lg:hidden p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/5 cursor-pointer"
              aria-label="Search Catalog"
            >
              <Search size={19} />
            </button>

            {/* Brand Logo — Desktop: left-aligned with nav */}
            <Link to="/" className="hidden lg:flex items-center group">
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative flex items-center"
              >
                <img
                  src="/alongkar-logo.png"
                  alt="Alongkar — Haute Jewellery"
                  className={`transition-all duration-300 object-contain drop-shadow-[0_2px_12px_rgba(232,201,138,0.2)] ${
                    scrolled ? 'h-9' : 'h-11'
                  }`}
                  style={{ maxWidth: '185px' }}
                />
              </motion.div>
            </Link>
          </div>

          {/* Center: Mobile Logo */}
          <Link to="/" className="lg:hidden flex items-center justify-center">
            <img
              src="/alongkar-logo.png"
              alt="Alongkar"
              className="h-9 object-contain drop-shadow-sm"
              style={{ maxWidth: '150px' }}
            />
          </Link>

          {/* Desktop Navigation Links with Gold Glow Hover */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`text-[11px] uppercase tracking-[0.24em] font-medium transition-all duration-300 relative py-1.5 ${
                    isActive
                      ? 'text-[#E8C98A] font-semibold drop-shadow-[0_0_8px_rgba(232,201,138,0.4)]'
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

          {/* User Actions: Search Pill, Clerk Auth, Wishlist, Cart Drawer */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Desktop Search Button */}
            <button
              onClick={onOpenSearch}
              className="hidden lg:flex items-center gap-2.5 text-[11px] uppercase tracking-widest px-3.5 py-1.5 rounded-full transition-all text-[#F8F1E3]/80 hover:text-[#E8C98A] bg-white/[0.04] border border-[#E8C98A]/20 hover:border-[#E8C98A]/50 hover:bg-[#E8C98A]/10 cursor-pointer shadow-sm"
            >
              <Search size={13} className="text-[#E8C98A]" />
              <span className="font-light">Search Atelier</span>
              <kbd className="text-[9px] bg-black/40 text-[#E8C98A]/70 px-1.5 py-0.5 rounded border border-[#E8C98A]/20">⌘K</kbd>
            </button>

            {/* Auth Controls */}
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full transition-all text-[#F8F1E3]/85 hover:text-[#E8C98A] border border-white/15 hover:border-[#E8C98A]/40 hover:bg-white/5 cursor-pointer"
                  aria-label="Sign In"
                >
                  <User size={13} />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all bg-gradient-to-r from-[#E8C98A] to-[#C9A45D] text-[#1C0106] hover:brightness-110 shadow-[0_2px_12px_rgba(232,201,138,0.25)] cursor-pointer"
                  aria-label="Sign Up"
                >
                  <Sparkles size={12} />
                  <span>Join VIP</span>
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <div className="flex items-center pl-1">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'w-8 h-8 rounded-full border border-[#E8C98A]/50 shadow-md',
                    },
                  }}
                />
              </div>
            </Show>

            {/* Wishlist Button */}
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-2 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/5 cursor-pointer"
              aria-label="Wishlist"
            >
              <Heart size={19} />
              {wishlist.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#E8C98A] text-[#1C0106] text-[10px] font-bold flex items-center justify-center rounded-full shadow-[0_0_8px_rgba(232,201,138,0.6)]"
                >
                  {wishlist.length}
                </motion.span>
              )}
            </button>

            {/* Shopping Bag Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/5 cursor-pointer"
              aria-label="Shopping Bag"
            >
              <ShoppingBag size={20} />
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#E8C98A] text-[#1C0106] font-bold text-[10px] flex items-center justify-center rounded-full shadow-[0_0_8px_rgba(232,201,138,0.6)]"
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
