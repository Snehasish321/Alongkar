import React from 'react';
import { useUser, SignInButton } from '@clerk/react';
import { ShieldAlert, LogIn, Lock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ children }) => {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#0F0814] flex flex-col items-center justify-center text-white px-4">
        <div className="w-12 h-12 border-3 border-[#D6B878]/30 border-t-[#D6B878] rounded-full animate-spin mb-4" />
        <p className="text-sm text-[#EDE4D5]/70 font-sans tracking-wide">
          Verifying security credentials...
        </p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-[#0F0814] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-[#180F20] border border-[#D6B878]/20 rounded-2xl p-8 text-center shadow-2xl text-white">
          <div className="w-16 h-16 bg-[#40000D] border border-[#D6B878]/30 text-[#D6B878] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#F8F4EC] mb-2">
            Alongkar Atelier Admin
          </h2>
          <p className="text-sm text-[#EDE4D5]/70 mb-8 leading-relaxed">
            Authentication is required to access the catalog management dashboard. Please sign in with an authorized administrator account.
          </p>
          <div className="space-y-4">
            <SignInButton mode="modal">
              <button className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-[#B08D57] to-[#D6B878] text-[#211A17] font-semibold text-sm hover:brightness-110 transition shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                <LogIn className="w-4 h-4" />
                <span>Sign In to Admin Console</span>
              </button>
            </SignInButton>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#EDE4D5]/60 hover:text-[#D6B878] transition pt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Storefront</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Client-side UX check (Server-side requireAdmin remains authoritative security boundary)
  const role =
    (user.publicMetadata as any)?.role ||
    (user.unsafeMetadata as any)?.role;

  const isAdmin = role === 'admin';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0F0814] flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full bg-[#180F20] border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl text-white">
          <div className="w-16 h-16 bg-red-950/50 border border-red-500/40 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#F8F4EC] mb-2">
            Access Restricted
          </h2>
          <p className="text-sm text-[#EDE4D5]/80 mb-4 leading-relaxed">
            Signed in as <strong>{user.primaryEmailAddress?.emailAddress || user.username}</strong>. This account does not currently have administrator privileges.
          </p>
          <div className="p-4 bg-black/40 border border-white/10 rounded-xl text-left text-xs font-mono text-[#D6B878]/90 mb-6 space-y-1.5">
            <p className="text-white/60 font-sans text-[11px] uppercase tracking-wider font-semibold">
              Developer Assignment Instruction:
            </p>
            <p className="text-white/80">To grant admin access, run the server CLI:</p>
            <p className="text-emerald-400 select-all font-semibold">
              node scripts/set-admin.js {user.id}
            </p>
            <p className="text-white/50 text-[11px]">Or assign {`{"role": "admin"}`} in Clerk Dashboard Public Metadata.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="py-2.5 px-5 rounded-xl bg-white/10 text-[#F8F4EC] text-xs font-semibold hover:bg-white/15 transition flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Storefront</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
