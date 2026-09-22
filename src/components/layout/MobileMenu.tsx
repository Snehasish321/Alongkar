import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Phone, Mail, Sparkles, User, ShieldCheck } from 'lucide-react';
import { categoriesData } from '../../data/categories';
import { InstagramIcon, FacebookIcon } from '../ui/SocialIcons';
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const location = useLocation();

  const mainLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop All Jewellery', path: '/shop' },
    { name: 'Curated Collections', path: '/collections' },
    { name: 'Our Heritage & Craft', path: '/about' },
    { name: 'VIP Concierge & Help', path: '/contact' },
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
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 lg:hidden"
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed top-0 left-0 bottom-0 w-[86%] max-w-sm bg-[#1C0106] text-[#F8F1E3] z-50 flex flex-col justify-between shadow-[0_0_50px_rgba(0,0,0,0.8)] border-r border-[#E8C98A]/20 overflow-y-auto"
          >
            {/* Header & Main Nav */}
            <div>
              <div className="p-5 flex items-center justify-between border-b border-[#E8C98A]/15 bg-[#2A0008]">
                <Link to="/" onClick={onClose} className="flex items-center">
                  <img
                    src="/alongkar-logo.png"
                    alt="Alongkar"
                    className="h-9 object-contain drop-shadow"
                    style={{ maxWidth: '140px' }}
                  />
                </Link>
                <button
                  onClick={onClose}
                  className="p-2 text-[#F8F1E3]/80 hover:text-[#E8C98A] transition-colors rounded-full hover:bg-white/5"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Account / VIP Section */}
              <div className="px-5 pt-4 pb-3 border-b border-[#E8C98A]/15 bg-gradient-to-b from-[#2A0008] to-[#1C0106]">
                <Show when="signed-in">
                  <div className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-[#E8C98A]/30 shadow-inner">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-[#E8C98A]" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#E8C98A]">
                        Atelier Member
                      </span>
                    </div>
                    <UserButton />
                  </div>
                </Show>
                <Show when="signed-out">
                  <div className="flex gap-2">
                    <SignInButton mode="modal">
                      <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-3 bg-white/[0.08] text-[#F8F1E3] rounded-md text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-1.5 border border-[#E8C98A]/20 hover:border-[#E8C98A]/50 transition-all"
                      >
                        <User size={13} />
                        <span>Sign In</span>
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button
                        onClick={onClose}
                        className="flex-1 py-2.5 px-3 bg-gradient-to-r from-[#E8C98A] to-[#C9A45D] text-[#1C0106] font-semibold rounded-md text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md hover:brightness-105 transition-all"
                      >
                        <Sparkles size={13} />
                        <span>Join VIP</span>
                      </button>
                    </SignUpButton>
                  </div>
                </Show>
              </div>

              {/* Main Navigation Links */}
              <nav className="p-4 space-y-1">
                {mainLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.name}
                      to={link.path}
                      onClick={onClose}
                      className={`flex items-center justify-between py-3 px-3 rounded-lg text-xs uppercase tracking-[0.2em] font-medium transition-colors ${
                        isActive
                          ? 'bg-[#E8C98A]/15 text-[#E8C98A] font-semibold border-l-2 border-[#E8C98A]'
                          : 'text-[#F8F1E3]/85 hover:bg-white/[0.04] hover:text-[#E8C98A]'
                      }`}
                    >
                      <span>{link.name}</span>
                      <ChevronRight size={14} className="opacity-40" />
                    </Link>
                  );
                })}

                <div className="pt-5 pb-2 px-3">
                  <span className="text-[10px] uppercase tracking-[0.28em] text-[#E8C98A] font-semibold flex items-center gap-1.5">
                    <Sparkles size={10} />
                    <span>Signature Categories</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 px-1">
                  {categoriesData.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/shop?category=${cat.slug}`}
                      onClick={onClose}
                      className="p-2.5 rounded bg-white/[0.03] border border-[#E8C98A]/10 hover:border-[#E8C98A]/35 text-xs text-[#E9DDC8] hover:text-[#E8C98A] transition-all flex flex-col"
                    >
                      <span className="font-medium text-[11px] uppercase tracking-wider">{cat.name}</span>
                      <span className="text-[10px] text-gray-400 font-light">{cat.itemCount} pieces</span>
                    </Link>
                  ))}
                </div>
              </nav>
            </div>

            {/* Quality Seal & Footer */}
            <div className="p-5 bg-[#140104] border-t border-[#E8C98A]/15 space-y-4">
              <div className="flex items-center gap-2 p-2.5 rounded bg-white/[0.02] border border-[#E8C98A]/15 text-[11px] text-[#E9DDC8]">
                <ShieldCheck size={16} className="text-[#E8C98A] shrink-0" />
                <span>24K Micron Gold • Anti-Tarnish Lifetime Promise</span>
              </div>

              <div className="text-xs text-[#E9DDC8]/80 space-y-2">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-[#E8C98A]" />
                  <span>+91 98765 43210</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-[#E8C98A]" />
                  <span>care@alongkar.com</span>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-white/10 text-[#F8F1E3]/75">
                <a href="#" className="p-1 hover:text-[#E8C98A] transition-colors" aria-label="Instagram">
                  <InstagramIcon size={16} />
                </a>
                <a href="#" className="p-1 hover:text-[#E8C98A] transition-colors" aria-label="Facebook">
                  <FacebookIcon size={16} />
                </a>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
