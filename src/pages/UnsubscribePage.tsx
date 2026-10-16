import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Warning, Sms } from 'reicon-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';
import { Button } from '../components/ui/Button';

export const UnsubscribePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Safely capture initial token from URL searchParams into component state
  const [token] = useState<string | null>(() => {
    return searchParams.get('token');
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Unsubscribe | Alongkar VIP Circle';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        'Manage your Alongkar VIP Circle newsletter subscription preferences.'
      );
    }

    // Set restrictive referrer policy for this page to prevent any token or URL leakage
    let metaReferrer = document.querySelector('meta[name="referrer"]');
    let createdMeta = false;
    if (!metaReferrer) {
      metaReferrer = document.createElement('meta');
      metaReferrer.setAttribute('name', 'referrer');
      metaReferrer.setAttribute('content', 'no-referrer');
      document.head.appendChild(metaReferrer);
      createdMeta = true;
    } else {
      metaReferrer.setAttribute('content', 'no-referrer');
    }

    // Safely remove token query parameter from browser address bar & history
    // while preserving it in component state for explicit confirmation POST.
    if (searchParams.has('token')) {
      navigate('/unsubscribe', { replace: true });
    }

    return () => {
      if (createdMeta && metaReferrer?.parentNode) {
        metaReferrer.parentNode.removeChild(metaReferrer);
      }
    };
  }, [navigate, searchParams]);

  const handleConfirmUnsubscribe = async () => {
    if (!token) return;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(
          data.error ||
            'Unable to process your unsubscribe request. The link may have expired or is invalid.'
        );
      }
    } catch {
      setStatus('error');
      setErrorMessage(
        'A network error occurred. Please check your internet connection and try again.'
      );
    }
  };

  return (
    <StorefrontLayout>
      <main className="py-16 sm:py-24 bg-[#FFFDF8] min-h-[75vh] flex items-center justify-center text-[#211A17]">
        <div className="max-w-lg w-full mx-auto px-4 sm:px-6">
          <div className="bg-[#FAF6F0] rounded-2xl border border-[#E8C98A]/40 shadow-xl p-8 sm:p-10 text-center space-y-6">
            {/* Header Icon */}
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto transition-colors bg-[#E8C98A]/20 text-[#8C6C38]">
              {status === 'success' ? (
                <Check size={28} className="text-emerald-700" />
              ) : status === 'error' ? (
                <Warning size={28} className="text-amber-700" />
              ) : (
                <Sms size={28} />
              )}
            </div>

            {/* Subtle Brand Ribbon */}
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#B08D57] font-bold">
              <span>ALONGKAR CIRCLE PREFERENCES</span>
            </div>

            {/* State: Missing Token */}
            {!token && status !== 'success' ? (
              <div className="space-y-4">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17]">
                  Invalid Unsubscribe Link
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-light">
                  No valid unsubscribe authorization token was found. If you wish to opt out of the Alongkar Circle newsletter, please use the direct unsubscribe link provided at the bottom of your welcome email, or contact our concierge.
                </p>
                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                  <a
                    href="mailto:alongkar.official@gmail.com?subject=Unsubscribe%20Request"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-[#E8C98A] text-xs font-semibold text-[#8C6C38] hover:bg-[#E8C98A]/10 transition-colors"
                  >
                    Contact Concierge
                  </a>
                  <Link to="/">
                    <Button variant="gold" size="md" className="w-full sm:w-auto text-xs">
                      Return to Store
                    </Button>
                  </Link>
                </div>
              </div>
            ) : status === 'success' ? (
              /* State: Success */
              <div className="space-y-4">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17]">
                  Successfully Unsubscribed
                </h1>
                <div className="w-12 h-[1.5px] bg-[#E8C98A]/60 mx-auto" />
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-light">
                  You have been removed from the Alongkar Circle newsletter. You will no longer receive our curated jewellery announcements or atelier publications.
                </p>
                <p className="text-[11px] text-gray-500 italic">
                  Note: Essential transactional emails regarding existing or future jewellery orders will still be delivered.
                </p>
                <div className="pt-4">
                  <Link to="/">
                    <Button variant="gold" size="md" className="gap-2 text-xs">
                      <ArrowLeft size={14} />
                      <span>RETURN TO ATELIER</span>
                    </Button>
                  </Link>
                </div>
              </div>
            ) : status === 'error' ? (
              /* State: Error */
              <div className="space-y-4">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17]">
                  Request Could Not Be Completed
                </h1>
                <div className="w-12 h-[1.5px] bg-amber-400/60 mx-auto" />
                <p className="text-xs sm:text-sm text-red-800 leading-relaxed font-light bg-red-50 p-3 rounded-lg border border-red-200">
                  {errorMessage || 'This unsubscribe link is invalid or has expired.'}
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  You may also opt out at any time by emailing us directly at{' '}
                  <a
                    href="mailto:alongkar.official@gmail.com?subject=Unsubscribe%20Request"
                    className="text-[#8C6C38] underline font-semibold hover:text-[#5E4720]"
                  >
                    alongkar.official@gmail.com
                  </a>
                  .
                </p>
                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('idle');
                      setErrorMessage(null);
                    }}
                    className="px-4 py-2.5 rounded-lg border border-[#E8C98A] text-xs font-semibold text-[#8C6C38] hover:bg-[#E8C98A]/10 transition-colors"
                  >
                    Try Again
                  </button>
                  <Link to="/">
                    <Button variant="gold" size="md" className="w-full sm:w-auto text-xs">
                      Return to Home
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              /* State: Idle / Pending Confirmation (Protects against web scanner bots) */
              <div className="space-y-4">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#211A17]">
                  Unsubscribe Confirmation
                </h1>
                <div className="w-12 h-[1.5px] bg-[#E8C98A]/60 mx-auto" />
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-light">
                  Are you sure you want to stop receiving the Alongkar Circle newsletter and bespoke jewellery curations?
                </p>
                <div className="pt-4 space-y-3">
                  <button
                    type="button"
                    onClick={handleConfirmUnsubscribe}
                    disabled={status === 'loading'}
                    className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#8C6C38] hover:from-[#E5C158] hover:to-[#9E7D44] text-[#FAF6F0] font-bold text-xs uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-[#FAF6F0]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>Confirm Unsubscribe</span>
                    )}
                  </button>

                  <div>
                    <Link
                      to="/"
                      className="text-xs text-gray-500 hover:text-gray-800 transition-colors underline"
                    >
                      Never mind, keep my subscription
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </StorefrontLayout>
  );
};
