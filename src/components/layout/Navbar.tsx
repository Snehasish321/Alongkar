import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Heart, ShoppingBag, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch, onOpenMobileMenu }) => {
  const { scrolled } = useScrollPosition(30);
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();

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
        scrolled || !isHomePage
          ? 'bg-ivory/95 backdrop-blur-md shadow-soft border-b border-gold/15 py-3'
          : 'bg-gradient-to-b from-espresso/80 via-espresso/40 to-transparent text-ivory-pearl py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Mobile Hamburger Menu Toggle */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={onOpenMobileMenu}
              className={`p-2 rounded-brand transition-colors ${
                scrolled || !isHomePage ? 'text-espresso hover:text-gold' : 'text-ivory hover:text-gold-champagne'
              }`}
              aria-label="Open Mobile Navigation Menu"
            >
              <Menu size={22} />
            </button>
            <button
              onClick={onOpenSearch}
              className={`p-2 rounded-brand transition-colors ml-1 ${
                scrolled || !isHomePage ? 'text-espresso hover:text-gold' : 'text-ivory hover:text-gold-champagne'
              }`}
              aria-label="Search"
            >
              <Search size={20} />
            </button>
          </div>

          {/* Brand Logo with Shimmer Animation */}
          <Link to="/" className="flex flex-col items-center group">
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center"
            >
              <span
                className={`font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-[0.2em] transition-colors ${
                  scrolled || !isHomePage
                    ? 'text-espresso group-hover:text-gold'
                    : 'text-gold-shimmer drop-shadow-md'
                }`}
              >
                ALONGKAR
              </span>
              <span
                className={`text-[9px] uppercase tracking-[0.35em] font-sans font-medium -mt-1 ${
                  scrolled || !isHomePage ? 'text-gold' : 'text-gold-champagne/90'
                }`}
              >
                City Gold Jewellery
              </span>
            </motion.div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`text-xs uppercase tracking-[0.2em] font-medium transition-all duration-300 relative py-1 ${
                    scrolled || !isHomePage
                      ? isActive
                        ? 'text-gold font-semibold'
                        : 'text-espresso hover:text-gold'
                      : isActive
                      ? 'text-gold-champagne font-semibold'
                      : 'text-ivory-pearl hover:text-gold-champagne'
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-gold rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Actions: Search, Wishlist, Cart */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Desktop Search Button */}
            <button
              onClick={onOpenSearch}
              className={`hidden lg:flex items-center gap-2 text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all ${
                scrolled || !isHomePage
                  ? 'border-espresso/15 text-espresso hover:border-gold hover:text-gold bg-ivory-pearl/60'
                  : 'border-ivory/30 text-ivory-pearl hover:border-gold-champagne hover:text-gold-champagne bg-espresso/30'
              }`}
            >
              <Search size={14} />
              <span>Search</span>
            </button>

            {/* Wishlist Button */}
            <button
              onClick={() => setIsWishlistOpen(true)}
              className={`relative p-2 rounded-full transition-colors ${
                scrolled || !isHomePage ? 'text-espresso hover:text-gold' : 'text-ivory-pearl hover:text-gold-champagne'
              }`}
              aria-label="Wishlist"
            >
              <Heart size={20} />
              {wishlist.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-0 right-0 w-4 h-4 bg-burgundy text-ivory-pearl text-[10px] font-bold flex items-center justify-center rounded-full"
                >
                  {wishlist.length}
                </motion.span>
              )}
            </button>

            {/* Shopping Bag Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className={`relative p-2 rounded-full transition-colors ${
                scrolled || !isHomePage ? 'text-espresso hover:text-gold' : 'text-ivory-pearl hover:text-gold-champagne'
              }`}
              aria-label="Shopping Bag"
            >
              <ShoppingBag size={21} />
              {totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-0 right-0 w-4 h-4 bg-gold text-espresso font-bold text-[10px] flex items-center justify-center rounded-full shadow-sm"
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
