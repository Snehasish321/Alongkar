import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, Menu, User, Heart, ChevronDown, Sparkles, ArrowRight } from 'lucide-react';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { SignInButton, Show } from '@clerk/react';
import { CustomerMenu } from './CustomerMenu';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch, onOpenMobileMenu }) => {
  const { scrolled } = useScrollPosition(10);
  const location = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();

  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on route change
  useEffect(() => {
    setIsShopDropdownOpen(false);
  }, [location.pathname]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsShopDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMouseEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    setIsShopDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setIsShopDropdownOpen(false);
    }, 150);
  };

  const categories = [
    { name: 'Necklaces & Chokers', path: '/shop?category=necklaces' },
    { name: 'Earrings & Jhumkas', path: '/shop?category=earrings' },
    { name: 'Rings & Polki', path: '/shop?category=rings' },
    { name: 'Bangles & Bracelets', path: '/shop?category=bracelets' },
    { name: 'Artisan Chains', path: '/shop?category=chains' },
    { name: 'Medallion Pendants', path: '/shop?category=pendants' },
  ];

  const isShopActive = location.pathname === '/shop' || location.pathname === '/categories';
  const isCollectionsActive = location.pathname === '/collections';
  const isBestSellersActive = location.pathname === '/best-sellers';
  const isRequestActive = location.pathname === '/request-jewellery';

  return (
    <header
      className={`sticky top-0 z-40 bg-[#32060E]/95 backdrop-blur-md transition-all duration-300 border-b border-[#E8C98A]/20 text-[#F8F1E3] ${
        scrolled ? 'py-2.5 shadow-md shadow-black/20' : 'py-3.5 shadow-xs'
      }`}
    >
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          
          {/* Mobile Left: Hamburger Menu & Quick Search */}
          <div className="flex items-center gap-1.5 lg:hidden flex-1">
            <button
              onClick={onOpenMobileMenu}
              className="p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <Menu size={22} strokeWidth={1.75} />
            </button>
            <button
              onClick={onOpenSearch}
              className="p-2 text-[#F8F1E3]/85 hover:text-[#E8C98A] transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
              aria-label="Search Catalogue"
            >
              <Search size={20} strokeWidth={1.75} />
            </button>
          </div>

          {/* Desktop Left: Primary Navigation */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8 flex-1">
            {/* Shop Dropdown */}
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                onClick={() => setIsShopDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 text-[13px] xl:text-[13.5px] font-medium tracking-[0.03em] transition-colors py-1 cursor-pointer ${
                  isShopActive ? 'text-[#E8C98A] font-semibold' : 'text-[#F8F1E3]/90 hover:text-[#E8C98A]'
                }`}
                aria-expanded={isShopDropdownOpen}
                aria-haspopup="true"
              >
                <span>Shop</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${isShopDropdownOpen ? 'rotate-180 text-[#E8C98A]' : 'opacity-70'}`}
                />
              </button>

              {/* Shop Dropdown Panel */}
              {isShopDropdownOpen && (
                <div className="absolute top-full left-0 pt-2 w-72 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="bg-[#28040B]/98 backdrop-blur-xl border border-[#E8C98A]/30 rounded-xl shadow-2xl p-3.5 text-[#F8F1E3]">
                    {/* All Products Primary Link */}
                    <Link
                      to="/shop"
                      onClick={() => setIsShopDropdownOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/5 hover:bg-[#E8C98A]/15 border border-[#E8C98A]/20 text-[#FFE3C7] text-xs font-semibold tracking-wide transition-all group mb-2"
                    >
                      <span className="flex items-center gap-2">
                        <ShoppingBag size={14} className="text-[#E8C98A]" />
                        <span>All Products</span>
                      </span>
                      <ArrowRight size={13} className="text-[#E8C98A] transition-transform group-hover:translate-x-0.5" />
                    </Link>

                    {/* Category List */}
                    <div className="space-y-0.5 border-t border-white/10 pt-2">
                      <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-widest text-[#E8C98A]/80">
                        Categories
                      </div>
                      {categories.map((cat) => (
                        <Link
                          key={cat.name}
                          to={cat.path}
                          onClick={() => setIsShopDropdownOpen(false)}
                          className="block px-3 py-2 text-xs text-[#F8F1E3]/80 hover:text-[#FFE3C7] hover:bg-white/5 rounded-md transition-colors"
                        >
                          {cat.name}
                        </Link>
                      ))}
                    </div>

                    {/* Explore Collections Link */}
                    <div className="border-t border-white/10 mt-2 pt-2">
                      <Link
                        to="/categories"
                        onClick={() => setIsShopDropdownOpen(false)}
                        className="block px-3 py-1.5 text-[11px] text-[#E8C98A] hover:underline font-medium"
                      >
                        Explore Category Showcase →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Collections Link */}
            <Link
              to="/collections"
              className={`text-[13px] xl:text-[13.5px] font-medium tracking-[0.03em] transition-colors py-1 ${
                isCollectionsActive ? 'text-[#E8C98A] font-semibold' : 'text-[#F8F1E3]/90 hover:text-[#E8C98A]'
              }`}
            >
              Collections
            </Link>

            {/* Best Sellers Link */}
            <Link
              to="/best-sellers"
              className={`text-[13px] xl:text-[13.5px] font-medium tracking-[0.03em] transition-colors py-1 ${
                isBestSellersActive ? 'text-[#E8C98A] font-semibold' : 'text-[#F8F1E3]/90 hover:text-[#E8C98A]'
              }`}
            >
              Best Sellers
            </Link>

            {/* Request Jewellery - High-Priority Core USP Highlight */}
            <Link
              to="/request-jewellery"
              className={`group relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] xl:text-[13px] font-medium tracking-[0.02em] transition-all duration-200 cursor-pointer ${
                isRequestActive
                  ? 'bg-[#E8C98A] text-[#2A0008] font-semibold shadow-md shadow-[#E8C98A]/20'
                  : 'bg-gradient-to-r from-[#E8C98A]/15 to-[#FFE3C7]/10 text-[#FFE3C7] hover:text-[#FFFFFF] border border-[#E8C98A]/40 hover:border-[#E8C98A] hover:bg-[#E8C98A]/25 shadow-xs'
              }`}
            >
              <Sparkles size={13} className={`transition-transform duration-300 group-hover:rotate-12 ${isRequestActive ? 'text-[#2A0008]' : 'text-[#E8C98A]'}`} />
              <span>Request Jewellery</span>
            </Link>
          </nav>

          {/* Center: Brand Logo (Single Homepage Navigation Element) */}
          <div className="flex items-center justify-center shrink-0 px-2">
            <Link to="/" className="flex items-center justify-center group py-0.5" aria-label="Alongkar Atelier Homepage">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar Atelier"
                className="h-9 sm:h-10 md:h-12 lg:h-13 xl:h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-sm"
              />
            </Link>
          </div>

          {/* Desktop Right: Actions (Search, Wishlist, Account, Cart) */}
          <div className="hidden lg:flex items-center justify-end gap-5 xl:gap-6 flex-1">
            {/* Search Trigger */}
            <button
              onClick={onOpenSearch}
              className="p-2 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              aria-label="Search Products"
            >
              <Search size={19} strokeWidth={1.8} />
            </button>

            {/* Wishlist Button */}
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-2 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              aria-label="View Wishlist"
            >
              <Heart size={19} strokeWidth={1.8} />
              {wishlist.length > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {wishlist.length}
                </span>
              )}
            </button>

            {/* Clerk Authentication / Profile Button */}
            <div className="flex items-center">
              <Show when="signed-in">
                <CustomerMenu />
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    className="p-2 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
                    aria-label="Sign In"
                  >
                    <User size={19} strokeWidth={1.8} />
                  </button>
                </SignInButton>
              </Show>
            </div>

            {/* Cart Button with Numeric Badge */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-transform active:scale-95 cursor-pointer rounded-full hover:bg-white/10"
              aria-label="Shopping Cart"
            >
              <ShoppingBag size={20} strokeWidth={1.8} />
              <span className="absolute top-0.5 right-0.5 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {totalItems}
              </span>
            </button>
          </div>

          {/* Mobile Right: Wishlist & Cart */}
          <div className="flex items-center justify-end lg:hidden gap-1.5 flex-1">
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-2 text-[#F8F1E3] hover:text-[#E8C98A] cursor-pointer"
              aria-label="View Wishlist"
            >
              <Heart size={20} strokeWidth={1.8} />
              {wishlist.length > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {wishlist.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-[#F8F1E3] hover:text-[#E8C98A] cursor-pointer"
              aria-label="Shopping Cart"
            >
              <ShoppingBag size={21} strokeWidth={1.8} />
              <span className="absolute top-0.5 right-0.5 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {totalItems}
              </span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
