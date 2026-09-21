import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Phone, Mail } from 'lucide-react';
import { categoriesData } from '../../data/categories';
import { InstagramIcon, FacebookIcon } from '../ui/SocialIcons';
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/react';
import { User } from 'lucide-react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const location = useLocation();

  const mainLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop All', path: '/shop' },
    { name: 'Collections', path: '/collections' },
    { name: 'About Alongkar', path: '/about' },
    { name: 'Customer Support', path: '/contact' },
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
            className="fixed inset-0 bg-espresso/60 backdrop-blur-sm z-50 lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-ivory text-espresso z-50 flex flex-col justify-between shadow-2xl border-r border-gold/20 overflow-y-auto"
          >
            {/* Header */}
            <div>
              <div className="p-5 flex items-center justify-between" style={{ backgroundColor: '#2A0008', borderBottom: '1px solid rgba(232, 201, 138, 0.15)' }}>
                <Link to="/" onClick={onClose} className="flex items-center">
                  <img
                    src="/alongkar-logo.png"
                    alt="Alongkar — City Gold Jewellery"
                    className="h-9 object-contain"
                    style={{ maxWidth: '140px' }}
                  />
                </Link>
                <button
                  onClick={onClose}
                  className="p-2 text-[#F8F1E3] hover:text-[#E8C98A] transition-colors rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Account Section */}
              <div className="px-5 pt-4 pb-2 border-b border-gold/15">
                <Show when="signed-in">
                  <div className="flex items-center justify-between p-3 bg-gold/10 rounded-brand border border-gold/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-espresso">
                      Your Account
                    </span>
                    <UserButton />
                  </div>
                </Show>
                <Show when="signed-out">
                  <div className="flex gap-2">
                    <SignInButton mode="modal">
                      <button
                        onClick={onClose}
                        className="flex-1 py-3 px-3 bg-espresso text-ivory-pearl rounded-brand text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md hover:bg-gold hover:text-espresso transition-all"
                      >
                        <User size={14} />
                        <span>Sign In</span>
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button
                        onClick={onClose}
                        className="flex-1 py-3 px-3 bg-[#E8C98A] text-[#2A0008] font-semibold rounded-brand text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md hover:bg-[#F3DEB2] transition-all"
                      >
                        <span>Sign Up</span>
                      </button>
                    </SignUpButton>
                  </div>
                </Show>
              </div>


              {/* Links */}
              <nav className="p-5 space-y-1">
                {mainLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.name}
                      to={link.path}
                      onClick={onClose}
                      className={`flex items-center justify-between py-3 px-3 rounded-brand text-xs uppercase tracking-[0.18em] font-medium transition-colors ${
                        isActive
                          ? 'bg-gold/15 text-gold font-bold'
                          : 'text-espresso hover:bg-ivory-soft hover:text-gold'
                      }`}
                    >
                      <span>{link.name}</span>
                      <ChevronRight size={14} className="opacity-50" />
                    </Link>
                  );
                })}

                <div className="pt-6 pb-2">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-gold font-bold px-3">
                    Shop Categories
                  </span>
                </div>

                {categoriesData.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/shop?category=${cat.slug}`}
                    onClick={onClose}
                    className="flex items-center justify-between py-2.5 px-3 text-xs text-espresso-light hover:text-gold transition-colors"
                  >
                    <span>{cat.name}</span>
                    <span className="text-[10px] text-gray-400">({cat.itemCount})</span>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Footer */}
            <div className="p-5 bg-ivory-soft/40 border-t border-gold/20 space-y-4">
              <div className="text-xs text-espresso-light space-y-2">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gold" />
                  <span>+91 98765 43210</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gold" />
                  <span>care@alongkar.com</span>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-espresso/10 text-espresso">
                <a href="#" className="p-2 rounded-full hover:text-gold transition-colors" aria-label="Instagram">
                  <InstagramIcon size={18} />
                </a>
                <a href="#" className="p-2 rounded-full hover:text-gold transition-colors" aria-label="Facebook">
                  <FacebookIcon size={18} />
                </a>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
