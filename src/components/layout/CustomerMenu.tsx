import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/react';
import {
  Package,
  Sparkles,
  Settings,
  Logout,
  ChevronRight,
  User as UserIcon,
} from 'reicon-react';

interface CustomerMenuProps {
  className?: string;
}

export const CustomerMenu: React.FC<CustomerMenuProps> = ({ className = '' }) => {
  const { user } = useUser();
  const clerk = useClerk();
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);


  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  const displayName = user.fullName || user.firstName || 'Alongkar Client';
  const emailAddress = user.primaryEmailAddress?.emailAddress || '';
  const avatarUrl = user.imageUrl;

  const isOrdersActive = location.pathname === '/orders';
  const isRequestsActive = location.pathname === '/jewellery-requests';

  const handleOpenAccountSettings = () => {
    setIsOpen(false);
    clerk.openUserProfile();
  };

  const handleSignOut = async () => {
    setIsOpen(false);
    await clerk.signOut();
    navigate('/');
  };

  return (
    <div ref={menuRef} className={`relative inline-block text-left ${className}`}>
      {/* Avatar Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-center p-0.5 rounded-full ring-1.5 ring-[#E8C98A]/60 hover:ring-[#E8C98A] transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E8C98A]"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Open Alongkar customer account menu"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full bg-[#E8C98A]/20 flex items-center justify-center text-[#E8C98A]">
            <UserIcon size={16} />
          </div>
        )}
      </button>

      {/* Custom Alongkar Dropdown Menu Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-2.5 w-72 sm:w-80 rounded-xl bg-[#28040B]/98 backdrop-blur-xl border border-[#E8C98A]/30 shadow-2xl text-[#F8F1E3] p-2.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 origin-top-right"
        >
          {/* Header: User Profile Info */}
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover border border-[#E8C98A]/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#E8C98A]/20 border border-[#E8C98A]/40 flex items-center justify-center text-[#E8C98A] shrink-0 font-serif font-bold text-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-serif text-sm font-bold text-[#FFE3C7] truncate">
                {displayName}
              </p>
              {emailAddress && (
                <p className="text-[11px] text-[#F8F1E3]/70 truncate mt-0.5 font-normal">
                  {emailAddress}
                </p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#E8C98A]/20 my-2"></div>

          {/* Primary Navigation: Customer Activity */}
          <div className="space-y-1">
            {/* 1. My Orders */}
            <Link
              to="/orders"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-150 group cursor-pointer ${
                isOrdersActive
                  ? 'bg-[#E8C98A]/20 border border-[#E8C98A]/40 text-[#FFE3C7]'
                  : 'hover:bg-white/10 hover:border-white/10 border border-transparent text-[#F8F1E3]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#E8C98A]/15 border border-[#E8C98A]/30 flex items-center justify-center text-[#E8C98A] shrink-0 group-hover:scale-105 transition-transform">
                  <Package size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-[#FFE3C7]">
                    My Orders
                  </p>
                  <p className="text-[10.5px] text-[#F8F1E3]/65 truncate">
                    View & track your purchases
                  </p>
                </div>
              </div>
              <ChevronRight
                size={14}
                className="text-[#E8C98A]/70 group-hover:text-[#E8C98A] group-hover:translate-x-0.5 transition-all shrink-0 ml-2"
              />
            </Link>

            {/* 2. Jewellery Requests */}
            <Link
              to="/jewellery-requests"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className={`flex items-center justify-between p-2.5 rounded-lg transition-all duration-150 group cursor-pointer ${
                isRequestsActive
                  ? 'bg-[#E8C98A]/20 border border-[#E8C98A]/40 text-[#FFE3C7]'
                  : 'hover:bg-white/10 hover:border-white/10 border border-transparent text-[#F8F1E3]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#E8C98A]/15 border border-[#E8C98A]/30 flex items-center justify-center text-[#E8C98A] shrink-0 group-hover:scale-105 transition-transform">
                  <Sparkles size={17} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-[#FFE3C7]">
                    Jewellery Requests
                  </p>
                  <p className="text-[10.5px] text-[#F8F1E3]/65 truncate">
                    Track your custom requests
                  </p>
                </div>
              </div>
              <ChevronRight
                size={14}
                className="text-[#E8C98A]/70 group-hover:text-[#E8C98A] group-hover:translate-x-0.5 transition-all shrink-0 ml-2"
              />
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-[#E8C98A]/20 my-2"></div>

          {/* Secondary Navigation: Settings & Sign Out */}
          <div className="space-y-1">
            {/* Account Settings */}
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenAccountSettings}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-[#F8F1E3]/85 hover:text-[#FFE3C7] transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Settings size={15} className="text-[#E8C98A]/80" />
                <div className="text-left">
                  <p className="text-xs font-medium">Account Settings</p>
                  <p className="text-[10px] text-[#F8F1E3]/55">Manage your account</p>
                </div>
              </div>
              <ChevronRight
                size={13}
                className="text-white/40 group-hover:text-white/70 transition-transform"
              />
            </button>

            {/* Sign Out */}
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-red-950/40 text-red-300 hover:text-red-200 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Logout size={15} className="text-red-400" />
                <span className="text-xs font-medium">Sign Out</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
