import React, { useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/react';
import {
  Gem,
  ShoppingBag,
  Users,
  BarChart3,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { user } = useUser();
  const { signOut } = useClerk();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      name: 'Products',
      path: '/admin/products',
      icon: Gem,
      active: location.pathname === '/admin' || location.pathname === '/admin/products',
    },
    {
      name: 'Orders',
      path: '#',
      icon: ShoppingBag,
      disabled: true,
      badge: 'Coming Soon',
    },
    {
      name: 'Customers',
      path: '#',
      icon: Users,
      disabled: true,
      badge: 'Coming Soon',
    },
    {
      name: 'Analytics',
      path: '#',
      icon: BarChart3,
      disabled: true,
      badge: 'Coming Soon',
    },
    {
      name: 'Settings',
      path: '#',
      icon: Settings,
      disabled: true,
      badge: 'Coming Soon',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0F0814] text-[#F8F4EC] flex flex-col md:flex-row font-sans selection:bg-[#B08D57]/30">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#180F20] border-b border-[#D6B878]/20 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <img
            src="/alongkar-logo.png"
            alt="Alongkar"
            className="h-8 w-auto object-contain"
          />
          <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-[#40000D] border border-[#D6B878]/30 text-[#D6B878]">
            Admin
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-white/5 border border-white/10 text-[#EDE4D5]"
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Desktop Sidebar / Mobile Drawer */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-[#140B1A] border-r border-[#D6B878]/20 flex flex-col justify-between transition-transform duration-300 md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 space-y-6">
          {/* Logo & Brand Identity */}
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <Link to="/admin" className="flex items-center gap-2.5">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar"
                className="h-9 w-auto object-contain"
              />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#D6B878] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#D6B878]" /> Atelier Admin
                </span>
                <span className="text-[9px] text-white/40">Database Management</span>
              </div>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1 text-white/50 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <p className="px-3 text-[10px] uppercase tracking-wider font-semibold text-white/40 mb-2">
              Catalog Management
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              if (item.disabled) {
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-white/30 cursor-not-allowed select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 opacity-50" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-white/40 font-mono">
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={() =>
                    `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                      item.active
                        ? 'bg-gradient-to-r from-[#40000D] to-[#2A0008] text-[#FFE3C7] border border-[#D6B878]/30 shadow-md'
                        : 'text-[#EDE4D5]/75 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-[#D6B878]" />
                    <span>{item.name}</span>
                  </div>
                  <Sparkles className="w-3 h-3 text-[#D6B878]/70" />
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: User profile & Storefront Link */}
        <div className="p-4 border-t border-white/10 bg-[#0F0814]/70 space-y-3">
          <Link
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-[#EDE4D5]/80 hover:text-white transition border border-white/10"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-[#D6B878]" />
              <span>Live Storefront</span>
            </span>
            <span className="text-[10px] text-white/40 font-mono">alongkar.com</span>
          </Link>

          {/* Admin User info & signout */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={user?.imageUrl || 'https://placehold.co/100x100?text=Admin'}
                alt={user?.fullName || 'Admin'}
                className="w-8 h-8 rounded-full border border-[#D6B878]/40 object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#F8F4EC] truncate">
                  {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Admin'}
                </p>
                <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Role: Administrator
                </p>
              </div>
            </div>

            <button
              onClick={() => signOut({ redirectUrl: '/' })}
              className="p-1.5 text-white/40 hover:text-red-400 rounded-lg hover:bg-red-950/40 transition cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-[#0F0814] overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
};
