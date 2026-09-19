import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, ArrowRight, ShieldCheck, CheckCircle2, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useSignIn, useSignUp, useAuth } from '@clerk/clerk-react';
import { useAlongkarAuth } from '../../context/AuthContext';
import { SparkleParticles } from '../ui/SparkleParticles';

const COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', name: 'UK', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
];

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, pendingAction } = useAlongkarAuth();
  const { isSignedIn } = useAuth();
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const [authMethod, setAuthMethod] = useState<'selection' | 'phone'>('selection');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer effect
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Focus first OTP box when OTP screen opens
  useEffect(() => {
    if (isOtpSent) {
      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 150);
    }
  }, [isOtpSent]);

  if (!isAuthModalOpen || isSignedIn) return null;

  // Google OAuth Flow
  const handleGoogleSignIn = async () => {
    setErrorMessage(null);

    if (!isSignInLoaded || !signIn) {
      setErrorMessage('Clerk authentication service is still initializing. Please check that your Clerk Publishable Key is valid in .env.local.');
      return;
    }

    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (err: any) {
      console.error('Google OAuth Error:', err);
      // If sign in says account doesn't exist, attempt sign up with redirect
      if (err?.errors?.[0]?.code === 'form_identifier_not_found' && signUp) {
        try {
          await signUp.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/',
          });
          return;
        } catch (signUpErr: any) {
          console.error('Google SignUp Error:', signUpErr);
          setErrorMessage(signUpErr?.errors?.[0]?.longMessage || signUpErr?.errors?.[0]?.message || 'Google OAuth failed.');
          return;
        }
      }
      setErrorMessage(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || 'Failed to start Google OAuth.');
    }
  };

  // Helper to format full E.164 phone number
  const getE164Phone = () => {
    const rawNumber = phoneNumber.trim().replace(/\D/g, '');
    const cleanCountry = countryCode.replace(/\D/g, '');

    // Avoid duplicating country code if user typed it
    if (rawNumber.startsWith(cleanCountry)) {
      return `+${rawNumber}`;
    }
    return `${countryCode}${rawNumber}`;
  };

  // Send real SMS OTP via Clerk
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const cleanDigits = phoneNumber.trim().replace(/\D/g, '');
    if (cleanDigits.length < 8) {
      setErrorMessage('Please enter a valid mobile number.');
      return;
    }

    if (!isSignUpLoaded && !isSignInLoaded) {
      setErrorMessage('Clerk authentication service is not loaded. Please verify your Clerk publishable key.');
      return;
    }

    setIsSendingOtp(true);
    const fullPhone = getE164Phone();

    try {
      // First attempt: Create user sign-up with phone number
      if (signUp) {
        try {
          await signUp.create({ phoneNumber: fullPhone });
          await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
          setIsOtpSent(true);
          setResendCountdown(45);
          setIsSendingOtp(false);
          return;
        } catch (signUpErr: any) {
          console.log('SignUp Phone Response:', signUpErr);
          // If identifier already exists, user already registered -> use signIn flow
          if (
            signUpErr?.errors?.[0]?.code === 'form_identifier_exists' ||
            signUpErr?.errors?.[0]?.message?.toLowerCase().includes('already exists')
          ) {
            if (signIn) {
              const { supportedFirstFactors } = await signIn.create({ identifier: fullPhone });
              const phoneCodeFactor = supportedFirstFactors?.find(
                (f: any) => f.strategy === 'phone_code'
              ) as any;

              if (phoneCodeFactor) {
                await signIn.prepareFirstFactor({
                  strategy: 'phone_code',
                  phoneNumberId: phoneCodeFactor.phoneNumberId,
                });
                setIsOtpSent(true);
                setResendCountdown(45);
                setIsSendingOtp(false);
                return;
              }
            }
          }
          throw signUpErr;
        }
      } else if (signIn) {
        const { supportedFirstFactors } = await signIn.create({ identifier: fullPhone });
        const phoneCodeFactor = supportedFirstFactors?.find(
          (f: any) => f.strategy === 'phone_code'
        ) as any;

        if (phoneCodeFactor) {
          await signIn.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneCodeFactor.phoneNumberId,
          });
          setIsOtpSent(true);
          setResendCountdown(45);
          setIsSendingOtp(false);
          return;
        }
      }

      throw new Error('Unable to prepare SMS verification on this account.');
    } catch (err: any) {
      console.error('Clerk Send SMS Error:', err);
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        'Unable to send SMS OTP. Please ensure your Clerk app has SMS configured.';
      setErrorMessage(msg);
      setIsSendingOtp(false);
    }
  };

  // Handle individual OTP Box change
  const handleOtpBoxChange = (index: number, value: string) => {
    // Only allow single numeric digit
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned && value !== '') return;

    const newValues = [...otpValues];
    newValues[index] = cleaned.slice(-1);
    setOtpValues(newValues);

    // Auto move focus to next box
    if (cleaned && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    // Auto verify if all 6 digits entered
    const combined = newValues.join('');
    if (combined.length === 6) {
      triggerVerifyOtp(combined);
    }
  };

  // Handle Backspace and arrow navigation
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpValues[index] && index > 0) {
        // Box is empty, go to previous box and clear it
        const newValues = [...otpValues];
        newValues[index - 1] = '';
        setOtpValues(newValues);
        otpInputsRef.current[index - 1]?.focus();
      } else {
        const newValues = [...otpValues];
        newValues[index] = '';
        setOtpValues(newValues);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle Paste 6 digits across all boxes
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newValues = [...otpValues];
    for (let i = 0; i < 6; i++) {
      newValues[i] = pastedData[i] || '';
    }
    setOtpValues(newValues);

    const focusIndex = Math.min(pastedData.length, 5);
    otpInputsRef.current[focusIndex]?.focus();

    if (pastedData.length === 6) {
      triggerVerifyOtp(pastedData);
    }
  };

  // Verify OTP with Clerk
  const triggerVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || otpValues.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter all 6 digits of the OTP code.');
      return;
    }

    setErrorMessage(null);
    setIsVerifyingOtp(true);

    try {
      // If verifying in sign-up flow
      if (signUp && signUp.status === 'missing_requirements') {
        const completeSignUp = await signUp.attemptPhoneNumberVerification({ code });
        if (completeSignUp.status === 'complete' && setSignUpActive) {
          await setSignUpActive({ session: completeSignUp.createdSessionId });
          closeAuthModal();
          return;
        }
      }

      // If verifying in sign-in flow
      if (signIn) {
        const completeSignIn = await signIn.attemptFirstFactor({ strategy: 'phone_code', code });
        if (completeSignIn.status === 'complete' && setSignInActive) {
          await setSignInActive({ session: completeSignIn.createdSessionId });
          closeAuthModal();
          return;
        }
      }

      setErrorMessage('Verification could not be completed. Please request a new code.');
      setIsVerifyingOtp(false);
    } catch (err: any) {
      console.error('Clerk OTP Verification Error:', err);
      setErrorMessage(
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        'Invalid or expired verification code. Please check and try again.'
      );
      setIsVerifyingOtp(false);
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
          <div className="p-6">
            {errorMessage && (
              <div className="mb-4 p-3.5 bg-burgundy/10 border border-burgundy/30 text-burgundy rounded-brand text-xs font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Screen 1: Auth Options Selection */}
            {authMethod === 'selection' && (
              <div className="space-y-4">
                <p className="text-xs text-center text-espresso-light">
                  Sign in with your preferred authentication method to continue.
                </p>

                {/* Continue with Google */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-3.5 px-4 bg-ivory border border-gold/40 hover:border-gold hover:bg-gold/10 rounded-brand text-xs font-semibold uppercase tracking-wider text-espresso flex items-center justify-center gap-3 transition-all shadow-sm group active:scale-[0.99]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                </button>

                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gold/25" />
                  </div>
                  <span className="relative px-3 bg-ivory-pearl text-[10px] uppercase tracking-widest text-espresso/50 font-semibold">
                    OR
                  </span>
                </div>

                {/* Continue with Mobile Number */}
                <button
                  type="button"
                  onClick={() => setAuthMethod('phone')}
                  className="w-full py-3.5 px-4 bg-espresso text-ivory-pearl hover:bg-gold hover:text-espresso rounded-brand text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99]"
                >
                  <Smartphone size={16} />
                  <span>CONTINUE WITH MOBILE NUMBER</span>
                </button>
              </div>
            )}

            {/* Screen 2: Mobile Number & 6-Box OTP Flow */}
            {authMethod === 'phone' && (
              <div>
                {!isOtpSent ? (
                  /* Step 2A: Phone Number Input Form */
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div className="text-center mb-1">
                      <h3 className="font-serif text-lg font-semibold text-espresso">Enter Mobile Number</h3>
                      <p className="text-[11px] text-espresso/60">We will send a real 6-digit verification code via SMS</p>
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-wider font-semibold text-espresso mb-1.5">
                        Mobile Number
                      </label>
                      <div className="flex gap-2">
                        {/* Country Code Select */}
                        <select
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                          className="bg-ivory px-2.5 py-2.5 rounded-brand border border-gold/30 text-xs font-medium text-espresso focus:outline-none focus:border-gold cursor-pointer"
                        >
                          {COUNTRY_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.code}
                            </option>
                          ))}
                        </select>

                        {/* Phone Number Input */}
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="98428 37703"
                          className="flex-1 bg-ivory px-3 py-2.5 rounded-brand border border-gold/30 text-sm focus:outline-none focus:border-gold font-medium"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSendingOtp}
                      className="w-full py-3 px-4 bg-espresso text-ivory-pearl hover:bg-gold hover:text-espresso rounded-brand text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                    >
                      {isSendingOtp ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>SENDING SMS OTP...</span>
                        </>
                      ) : (
                        <>
                          <span>SEND OTP</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuthMethod('selection')}
                      className="w-full text-center text-xs text-gold hover:underline pt-1"
                    >
                      Back to options
                    </button>
                  </form>
                ) : (
                  /* Step 2B: Exactly Six Separate OTP Input Boxes */
                  <div className="space-y-5">
                    <div className="text-center">
                      <CheckCircle2 size={32} className="mx-auto text-gold mb-1" />
                      <h3 className="font-serif text-lg font-semibold text-espresso">Enter Verification Code</h3>
                      <p className="text-[11px] text-espresso/60 mt-0.5">
                        6-digit OTP sent via SMS to{' '}
                        <span className="font-semibold text-espresso">
                          {countryCode} {phoneNumber}
                        </span>
                      </p>
                    </div>

                    {/* Six Individual OTP Input Boxes */}
                    <div className="flex justify-between gap-2 sm:gap-2.5">
                      {otpValues.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => {
                            otpInputsRef.current[idx] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onPaste={handleOtpPaste}
                          className="w-11 h-12 sm:w-12 sm:h-13 bg-ivory rounded-brand border border-gold/40 text-center font-serif text-xl font-bold text-espresso focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold shadow-sm transition-all"
                        />
                      ))}
                    </div>

                    {/* Verify Button */}
                    <button
                      type="button"
                      onClick={() => triggerVerifyOtp()}
                      disabled={isVerifyingOtp || otpValues.join('').length !== 6}
                      className="w-full py-3 px-4 bg-espresso text-ivory-pearl hover:bg-gold hover:text-espresso rounded-brand text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                    >
                      {isVerifyingOtp ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>VERIFYING CODE...</span>
                        </>
                      ) : (
                        <>
                          <span>VERIFY &amp; CONTINUE</span>
                          <CheckCircle2 size={14} />
                        </>
                      )}
                    </button>

                    {/* Resend OTP & Back to Mobile Number */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-gold/15">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOtpSent(false);
                          setOtpValues(['', '', '', '', '', '']);
                          setErrorMessage(null);
                        }}
                        className="text-espresso/70 hover:text-espresso underline"
                      >
                        Change number
                      </button>

                      {resendCountdown > 0 ? (
                        <span className="text-[11px] text-espresso/50">
                          Resend in <span className="font-semibold text-gold">{resendCountdown}s</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendOtp()}
                          disabled={isSendingOtp}
                          className="inline-flex items-center gap-1 text-gold font-semibold hover:underline"
                        >
                          <RotateCcw size={12} />
                          <span>Resend OTP</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Luxury Footer Note */}
          <div className="py-3 px-6 bg-ivory text-center border-t border-gold/15 text-[10px] text-espresso/50">
            Secure 24K Jewellery Account via Clerk Authentication
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
