import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sms, ArrowRight, Check } from 'reicon-react';
import { InstagramIcon, FacebookIcon } from '../ui/SocialIcons';
import { SkyBackground } from '../ui/SkyBackground';

export const Footer: React.FC = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isEmailValid = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    newsletterEmail.trim()
  );
  const canSubmit = isEmailValid && consent && !isSubmitting;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newsletterEmail.trim(),
          consent: true,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        setFeedback({
          type: 'success',
          message:
            data.message ||
            "Thanks for joining the Alongkar Circle. If your email is eligible, we'll send your welcome email shortly.",
        });
        setNewsletterEmail('');
        setConsent(false);
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Unable to complete subscription. Please try again.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Network error. Please check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className="relative overflow-hidden text-[#1A0B2E] pt-16 pb-10 border-t border-[#7A5E9E]/30 shadow-2xl">
      {/* Authentic FeralUI Live Sky Canvas Background (Madder dusk) */}
      <SkyBackground
        speed={20}
        overlayOpacity={0}
      />

      <div className="relative z-10">

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#E8C98A]/15">
          {/* Column 1: Brand & Newsletter */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/" className="inline-block">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar — Haute Jewellery"
                className="h-14 sm:h-16 w-auto object-contain block drop-shadow"
              />
            </Link>
            <p className="text-xs text-[#FDF8F0]/90 leading-relaxed max-w-sm font-normal drop-shadow-sm">
              ALONGKAR is a modern Indian jewellery house specializing in 24K micron city-gold masterworks. Fusing Bengal&apos;s centuries-old royal goldsmithing traditions with contemporary poise.
            </p>

            <form onSubmit={handleSubscribe} className="pt-2 max-w-sm" noValidate>
              <label htmlFor="footer-newsletter" className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#FFE3C7] font-bold mb-2.5 drop-shadow-sm">
                <span>Join The VIP Alongkar Circle</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="footer-newsletter"
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => {
                    setNewsletterEmail(e.target.value);
                    if (feedback) setFeedback(null);
                  }}
                  placeholder="Enter your email address"
                  required
                  disabled={isSubmitting}
                  aria-required="true"
                  aria-describedby="footer-newsletter-feedback footer-newsletter-consent-label"
                  className="bg-black/25 text-xs text-[#FDF8F0] placeholder:text-[#F2B8A0]/70 px-3.5 py-2.5 rounded-md border border-[#FFE3C7]/30 focus:outline-none focus:border-[#FFE3C7] flex-1 backdrop-blur-sm disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-label="Subscribe to newsletter"
                  className={`px-4 py-2.5 bg-gradient-to-r from-[#F2B8A0] to-[#FFE3C7] text-[#3D1E4E] font-bold rounded-md text-xs transition-all flex items-center justify-center shadow-md ${
                    canSubmit
                      ? 'hover:brightness-110 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? (
                    <svg className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-[#3D1E4E]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <ArrowRight size={15} />
                  )}
                </button>
              </div>

              {/* Minimal Consent Checkbox & Disclosure */}
              <div className="flex items-start gap-2 pt-2.5">
                <input
                  id="footer-newsletter-consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (feedback) setFeedback(null);
                  }}
                  disabled={isSubmitting}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#FFE3C7]/40 bg-black/30 text-[#FFE3C7] focus:ring-1 focus:ring-[#FFE3C7] focus:ring-offset-0 cursor-pointer disabled:opacity-50 accent-[#FFE3C7]"
                  required
                  aria-required="true"
                />
                <label
                  id="footer-newsletter-consent-label"
                  htmlFor="footer-newsletter-consent"
                  className="text-[10px] leading-snug text-[#FDF8F0]/80 cursor-pointer select-none"
                >
                  I consent to receive the welcome email and occasional Alongkar marketing newsletters. View our{' '}
                  <Link to="/privacy-policy" className="underline hover:text-[#FFE3C7] transition-colors focus:outline-none focus:ring-1 focus:ring-[#FFE3C7] rounded">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>

              {/* Accessible status message */}
              <div id="footer-newsletter-feedback" role="status" aria-live="polite">
                {feedback && (
                  <p
                    className={`text-[11px] font-semibold mt-2.5 flex items-start gap-1.5 ${
                      feedback.type === 'success' ? 'text-[#FFE3C7]' : 'text-[#FFB4AB]'
                    }`}
                  >
                    {feedback.type === 'success' && <Check size={13} className="shrink-0 mt-0.5" />}
                    <span>{feedback.message}</span>
                  </p>
                )}
              </div>
            </form>
          </div>

          {/* Column 2: Collections */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold drop-shadow-sm">Atelier Vault</h4>
            <ul className="space-y-2 text-xs text-[#FDF8F0]/90 font-normal">
              <li><Link to="/shop?category=necklaces" className="hover:text-[#FFE3C7] transition-colors">Necklaces & Chokers</Link></li>
              <li><Link to="/shop?category=earrings" className="hover:text-[#FFE3C7] transition-colors">Jhumkas & Chaandbalis</Link></li>
              <li><Link to="/shop?category=rings" className="hover:text-[#FFE3C7] transition-colors">Kundan & Polki Rings</Link></li>
              <li><Link to="/shop?category=bracelets" className="hover:text-[#FFE3C7] transition-colors">Bangles & Kadas</Link></li>
            </ul>
          </div>

          {/* Column 3: Customer Concierge */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold drop-shadow-sm">VIP Concierge</h4>
            <ul className="space-y-2 text-xs text-[#FDF8F0]/90 font-normal">
              <li><Link to="/request-jewellery" className="hover:text-[#FFE3C7] transition-colors">Request Custom Jewellery</Link></li>
              <li><Link to="/contact" className="hover:text-[#FFE3C7] transition-colors">Bespoke Inquiries & Contact</Link></li>
              <li><Link to="/track" className="hover:text-[#FFE3C7] transition-colors">Track Order Shipment</Link></li>
              <li><Link to="/pre-orders" className="hover:text-[#FFE3C7] transition-colors">Pre-Order Production Updates</Link></li>
              <li><Link to="/about" className="hover:text-[#FFE3C7] transition-colors">Bengal Heritage Archive</Link></li>
            </ul>
          </div>

          {/* Column 4: Client Policies & Social */}
          <div className="space-y-5">
            <div>
              <h4 className="text-xs uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold mb-3 drop-shadow-sm">Privileges & Terms</h4>
              <ul className="space-y-2 text-xs text-[#FDF8F0]/90 font-normal">
                <li><Link to="/returns" className="hover:text-[#FFE3C7] transition-colors">7-Day Return Policy</Link></li>
                <li><Link to="/shipping-policy" className="hover:text-[#FFE3C7] transition-colors">Insured Shipping Policy</Link></li>
                <li><Link to="/privacy-policy" className="hover:text-[#FFE3C7] transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-[#FFE3C7] transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold mb-2 drop-shadow-sm">Connect</h4>
              <div className="flex gap-2.5 text-[#FFE3C7]">
                <a href="https://www.instagram.com/alongkar.official/" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full bg-black/25 backdrop-blur-sm hover:text-[#3D1E4E] hover:bg-[#FFE3C7] transition-all border border-[#FFE3C7]/30 shadow-sm" aria-label="Instagram">
                  <InstagramIcon size={15} />
                </a>
                <a href="#" className="p-2.5 rounded-full bg-black/25 backdrop-blur-sm hover:text-[#3D1E4E] hover:bg-[#FFE3C7] transition-all border border-[#FFE3C7]/30 shadow-sm" aria-label="Facebook">
                  <FacebookIcon size={15} />
                </a>
                <a href="mailto:alongkar.official@gmail.com" className="p-2.5 rounded-full bg-black/25 backdrop-blur-sm hover:text-[#3D1E4E] hover:bg-[#FFE3C7] transition-all border border-[#FFE3C7]/30 shadow-sm" aria-label="Email Concierge">
                  <Sms size={15} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright */}
        <div className="pt-8 flex items-center justify-center text-center text-[11px] text-[#2A123B] font-semibold">
          <p>© {new Date().getFullYear()} ALONGKAR Haute Joaillerie. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  </footer>
  );
};
