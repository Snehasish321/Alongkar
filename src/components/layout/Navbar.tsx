import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, Menu, User, Heart } from 'lucide-react';
import { useScrollPosition } from '../../hooks/useScrollPosition';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { SignInButton, Show, UserButton } from '@clerk/react';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSearch, onOpenMobileMenu }) => {
  const { scrolled } = useScrollPosition(10);
  const location = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { wishlist, setIsWishlistOpen } = useWishlist();

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
    <header
      className={`sticky top-0 z-40 bg-[#32060E]/95 backdrop-blur-md transition-all duration-300 border-b border-[#E8C98A]/25 text-[#F8F1E3] shadow-xs ${
        scrolled ? 'py-2.5 shadow-md' : 'py-3.5'
      }`}
    >
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-3 lg:grid-cols-12 items-center">
          
          {/* Mobile Left: Menu & Search */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={onOpenMobileMenu}
              className="p-1.5 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors rounded-md hover:bg-white/10 cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <Menu size={22} strokeWidth={1.75} />
            </button>
            <button
              onClick={onOpenSearch}
              className="p-1.5 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-md hover:bg-white/10 cursor-pointer"
              aria-label="Search"
            >
              <Search size={20} strokeWidth={1.75} />
            </button>
          </div>

          {/* Desktop Left: Clean Navigation Links */}
          <nav className="hidden lg:flex lg:col-span-5 items-center flex-wrap gap-x-5 xl:gap-x-6">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={`text-[12.5px] xl:text-[13px] tracking-[0.025em] transition-colors duration-150 py-1 ${
                    isActive
                      ? 'text-[#E8C98A] font-semibold'
                      : 'text-[#F8F1E3]/80 hover:text-[#E8C98A]'
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          {/* Center: Brand Logo */}
          <div className="lg:col-span-2 flex items-center justify-center">
            <Link to="/" className="flex items-center justify-center group py-0.5">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar Atelier"
                className="h-9 sm:h-10 md:h-12 lg:h-14 xl:h-16 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </Link>
          </div>

          {/* Right: Search, Clerk Account, Cart */}
          <div className="hidden lg:flex lg:col-span-5 items-center justify-end space-x-5">
            {/* Search Trigger */}
            <button
              onClick={onOpenSearch}
              className="p-1.5 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              aria-label="Search Products"
            >
              <Search size={19} strokeWidth={1.8} />
            </button>

            {/* Clerk Authentication / Profile Button */}
            <div className="flex items-center">
              <Show when="signed-in">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'w-7 h-7 ring-1 ring-[#E8C98A]/60',
                    },
                  }}
                />
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    className="p-1.5 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
                    aria-label="Sign In"
                  >
                    <User size={19} strokeWidth={1.8} />
                  </button>
                </SignInButton>
              </Show>
            </div>

            {/* Wishlist Button */}
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-1.5 text-[#F8F1E3]/90 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/10 cursor-pointer"
              aria-label="View Wishlist"
            >
              <Heart size={19} strokeWidth={1.8} />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {wishlist.length}
                </span>
              )}
            </button>

            {/* Cart Button with Numeric Badge */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-1.5 text-[#F8F1E3] hover:text-[#E8C98A] transition-transform active:scale-95 cursor-pointer rounded-full hover:bg-white/10"
              aria-label="Shopping Cart"
            >
              <ShoppingBag size={20} strokeWidth={1.8} />
              <span className="absolute -top-1 -right-1 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {totalItems}
              </span>
            </button>
          </div>

          {/* Mobile Right: Wishlist & Cart */}
          <div className="flex items-center justify-end lg:hidden gap-2">
            <button
              onClick={() => setIsWishlistOpen(true)}
              className="relative p-1.5 text-[#F8F1E3] hover:text-[#E8C98A] cursor-pointer"
              aria-label="View Wishlist"
            >
              <Heart size={20} strokeWidth={1.8} />
              {wishlist.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {wishlist.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-1.5 text-[#F8F1E3] hover:text-[#E8C98A] cursor-pointer"
              aria-label="Shopping Cart"
            >
              <ShoppingBag size={21} strokeWidth={1.8} />
              <span className="absolute -top-1 -right-1 bg-[#E8C98A] text-[#2A0008] text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {totalItems}
              </span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
