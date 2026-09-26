import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, Sparkles, Check } from 'lucide-react';
import { InstagramIcon, FacebookIcon } from '../ui/SocialIcons';
import { SkyBackground } from '../ui/SkyBackground';

export const Footer: React.FC = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail) {
      setSubscribed(true);
      setNewsletterEmail('');
      setTimeout(() => setSubscribed(false), 4000);
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
                className="h-10 w-auto object-contain block drop-shadow"
              />
            </Link>
            <p className="text-xs text-[#FDF8F0]/90 leading-relaxed max-w-sm font-normal drop-shadow-sm">
              ALONGKAR is a modern Indian jewellery house specializing in 24K micron city-gold masterworks. Fusing Bengal&apos;s centuries-old royal goldsmithing traditions with contemporary poise.
            </p>

            <form onSubmit={handleSubscribe} className="pt-2 max-w-sm">
              <label htmlFor="footer-newsletter" className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#FFE3C7] font-bold mb-2.5 drop-shadow-sm">
                <Sparkles size={11} className="text-[#FFE3C7]" />
                <span>Join The VIP Alongkar Circle</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="footer-newsletter"
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  className="bg-black/25 text-xs text-[#FDF8F0] placeholder:text-[#F2B8A0]/70 px-3.5 py-2.5 rounded-md border border-[#FFE3C7]/30 focus:outline-none focus:border-[#FFE3C7] flex-1 backdrop-blur-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-gradient-to-r from-[#F2B8A0] to-[#FFE3C7] text-[#3D1E4E] font-bold rounded-md text-xs hover:brightness-110 transition-all flex items-center justify-center cursor-pointer shadow-md"
                >
                  <ArrowRight size={15} />
                </button>
              </div>
              {subscribed && (
                <p className="text-[11px] text-[#FFE3C7] font-semibold mt-2 flex items-center gap-1">
                  <Check size={12} />
                  <span>Welcome to the VIP circle! Your invitation is confirmed.</span>
                </p>
              )}
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
              <li><Link to="/collections" className="hover:text-[#FFE3C7] transition-colors">New Royal Curations</Link></li>
            </ul>
          </div>

          {/* Column 3: Customer Concierge */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold drop-shadow-sm">VIP Concierge</h4>
            <ul className="space-y-2 text-xs text-[#FDF8F0]/90 font-normal">
              <li><Link to="/contact" className="hover:text-[#FFE3C7] transition-colors">Bespoke Inquiries</Link></li>
              <li><Link to="/track-order" className="hover:text-[#FFE3C7] transition-colors">Track Shipment</Link></li>
              <li><Link to="/faqs" className="hover:text-[#FFE3C7] transition-colors">Jewellery Care Guide</Link></li>
              <li><Link to="/about" className="hover:text-[#FFE3C7] transition-colors">Bengal Heritage Archive</Link></li>
            </ul>
          </div>

          {/* Column 4: Client Policies & Social */}
          <div className="space-y-5">
            <div>
              <h4 className="text-xs uppercase tracking-[0.22em] text-[#FFE3C7] font-extrabold mb-3 drop-shadow-sm">Privileges & Terms</h4>
              <ul className="space-y-2 text-xs text-[#FDF8F0]/90 font-normal">
                <li><Link to="/shipping-policy" className="hover:text-[#FFE3C7] transition-colors">Insured Shipping Policy</Link></li>
                <li><Link to="/return-policy" className="hover:text-[#FFE3C7] transition-colors">7-Day Return Guarantee</Link></li>
                <li><Link to="/privacy-policy" className="hover:text-[#FFE3C7] transition-colors">Client Confidentiality</Link></li>
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
                <a href="mailto:care@alongkar.com" className="p-2.5 rounded-full bg-black/25 backdrop-blur-sm hover:text-[#3D1E4E] hover:bg-[#FFE3C7] transition-all border border-[#FFE3C7]/30 shadow-sm" aria-label="Email Concierge">
                  <Mail size={15} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Assured Payments */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#2A123B] font-semibold gap-4">
          <p>© {new Date().getFullYear()} ALONGKAR Haute Joaillerie. All Rights Reserved.</p>
          <div className="flex items-center gap-2.5 text-xs">
            <span className="border border-[#7A5E9E]/30 px-2 py-0.5 rounded text-[9px] text-[#3D1E4E] font-mono bg-white/50 backdrop-blur-sm shadow-sm">100% ENCRYPTED</span>
            <span className="border border-[#7A5E9E]/30 px-2 py-0.5 rounded text-[9px] text-[#3D1E4E] font-mono bg-white/50 backdrop-blur-sm shadow-sm">UPI</span>
            <span className="border border-[#7A5E9E]/30 px-2 py-0.5 rounded text-[9px] text-[#3D1E4E] font-mono bg-white/50 backdrop-blur-sm shadow-sm">VISA</span>
            <span className="border border-[#7A5E9E]/30 px-2 py-0.5 rounded text-[9px] text-[#3D1E4E] font-mono bg-white/50 backdrop-blur-sm shadow-sm">MASTERCARD</span>
            <span className="border border-[#7A5E9E]/30 px-2 py-0.5 rounded text-[9px] text-[#3D1E4E] font-mono bg-white/50 backdrop-blur-sm shadow-sm">COD AVAILABLE</span>
          </div>
        </div>
      </div>
    </div>
  </footer>
  );
};
