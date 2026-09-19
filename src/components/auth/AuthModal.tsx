import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useSignIn, useSignUp, useAuth } from '@clerk/clerk-react';
import { useAlongkarAuth } from '../../context/AuthContext';
import { SparkleParticles } from '../ui/SparkleParticles';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, pendingAction } = useAlongkarAuth();
  const { isSignedIn } = useAuth();
  const { isLoaded: isSignInLoaded, signIn } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp } = useSignUp();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isAuthModalOpen || isSignedIn) return null;

  // Google OAuth Flow
  const handleGoogleSignIn = async () => {
    setErrorMessage(null);

    if (!isSignInLoaded || !signIn) {
      setErrorMessage('Clerk authentication service is still initializing. Please try again in a moment.');
      return;
    }

    setIsLoading(true);

    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (err: any) {
      console.error('Google OAuth Error:', err);
      // If sign in says account doesn't exist, attempt sign up with redirect
      if (err?.errors?.[0]?.code === 'form_identifier_not_found' && signUp && isSignUpLoaded) {
        try {
          await signUp.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/',
          });
          return;
        } catch (signUpErr: any) {
          console.error('Google SignUp Error:', signUpErr);
          setErrorMessage(signUpErr?.errors?.[0]?.longMessage || signUpErr?.errors?.[0]?.message || 'Google authentication failed.');
          setIsLoading(false);
          return;
        }
      }
      setErrorMessage(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Failed to start Google authentication.');
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-espresso/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-ivory-pearl rounded-brand border border-gold/35 shadow-elevated overflow-hidden text-espresso"
        >
          {/* Luxury Header Banner */}
          <div className="relative py-6 px-6 bg-gradient-to-r from-espresso via-espresso-charcoal to-espresso text-ivory-pearl text-center border-b border-gold/25">
            <SparkleParticles />
            <button
              onClick={closeAuthModal}
              className="absolute top-4 right-4 p-1.5 rounded-full text-ivory/75 hover:text-ivory hover:bg-gold/20 transition-colors z-20"
              aria-label="Close authentication modal"
            >
              <X size={18} />
            </button>

            <h2 className="font-serif text-2xl font-bold tracking-wide text-gold-shimmer">
              Welcome to Alongkar
            </h2>
            <p className="text-xs text-gold-champagne/90 mt-1 font-sans tracking-wider">
              24K City Gold Jewellery
            </p>

            {pendingAction && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-gold/20 rounded-full border border-gold/30 text-[11px] font-medium text-ivory-pearl">
                <ShieldCheck size={13} className="text-gold-champagne" />
                <span>
                  Sign in to {pendingAction.type === 'cart' ? 'add product to your Cart' : 'save to your Wishlist'}
                </span>
              </div>
            )}
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-5">
            {errorMessage && (
              <div className="p-3.5 bg-burgundy/10 border border-burgundy/30 text-burgundy rounded-brand text-xs font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}

            <div className="text-center space-y-1.5">
              <h3 className="font-serif text-lg font-semibold text-espresso">
                Sign In to Your Account
              </h3>
              <p className="text-xs text-espresso-light leading-relaxed">
                Enjoy seamless order tracking, express checkout, and personalized wishlist across all your devices.
              </p>
            </div>

            {/* Continue with Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-white border border-gold/40 hover:border-gold hover:bg-gold/5 rounded-brand text-xs font-semibold uppercase tracking-wider text-espresso flex items-center justify-center gap-3 transition-all shadow-sm group active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin text-gold" />
                  <span>CONNECTING TO GOOGLE...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.39 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.61 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>CONTINUE WITH GOOGLE</span>
                </>
              )}
            </button>
          </div>

          {/* Luxury Footer Note */}
          <div className="py-3.5 px-6 bg-ivory text-center border-t border-gold/15 text-[10px] text-espresso/50">
            Secure Authentication powered by Clerk
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
