import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ShieldCheck, Truck, RefreshCw, Award, ArrowRight, Sparkles, Check } from 'lucide-react';
import { InstagramIcon, FacebookIcon } from '../ui/SocialIcons';

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
    <footer className="bg-[#140104] text-[#F8F1E3] pt-16 pb-10 border-t border-[#E8C98A]/20 relative">
      {/* Brand Trust Badges Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 mb-12 border-b border-[#E8C98A]/15">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-white/[0.02] border border-[#E8C98A]/10 hover:border-[#E8C98A]/30 transition-colors">
            <Award className="text-[#E8C98A]" size={26} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-[#F8F1E3]">24K Micron Gold</h4>
            <p className="text-[11px] text-[#E9DDC8]/60 font-light">Laboratory inspected anti-tarnish electroplating</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-white/[0.02] border border-[#E8C98A]/10 hover:border-[#E8C98A]/30 transition-colors">
            <ShieldCheck className="text-[#E8C98A]" size={26} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-[#F8F1E3]">Royal Velvet Packaging</h4>
            <p className="text-[11px] text-[#E9DDC8]/60 font-light">Tamper-proof bespoke presentation coffret</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-white/[0.02] border border-[#E8C98A]/10 hover:border-[#E8C98A]/30 transition-colors">
            <Truck className="text-[#E8C98A]" size={26} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-[#F8F1E3]">Insured Express Delivery</h4>
            <p className="text-[11px] text-[#E9DDC8]/60 font-light">Priority dispatched across 20,000+ PIN codes</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-white/[0.02] border border-[#E8C98A]/10 hover:border-[#E8C98A]/30 transition-colors">
            <RefreshCw className="text-[#E8C98A]" size={26} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-[#F8F1E3]">7-Day Privilege Exchange</h4>
            <p className="text-[11px] text-[#E9DDC8]/60 font-light">Hassle-free guarantee for absolute peace of mind</p>
          </div>
        </div>
      </div>

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
            <p className="text-xs text-[#E9DDC8]/70 leading-relaxed max-w-sm font-light">
              ALONGKAR is a modern Indian jewellery house specializing in 24K micron city-gold masterworks. Fusing Bengal&apos;s centuries-old royal goldsmithing traditions with contemporary poise.
            </p>

            <form onSubmit={handleSubscribe} className="pt-2 max-w-sm">
              <label htmlFor="footer-newsletter" className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-[#E8C98A] font-semibold mb-2.5">
                <Sparkles size={11} />
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
                  className="bg-white/[0.05] text-xs text-[#F8F1E3] placeholder:text-gray-500 px-3.5 py-2.5 rounded-md border border-[#E8C98A]/25 focus:outline-none focus:border-[#E8C98A] flex-1"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-gradient-to-r from-[#E8C98A] to-[#C9A45D] text-[#140104] font-semibold rounded-md text-xs hover:brightness-110 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                >
                  <ArrowRight size={15} />
                </button>
              </div>
              {subscribed && (
                <p className="text-[11px] text-[#E8C98A] mt-2 flex items-center gap-1">
                  <Check size={12} />
                  <span>Welcome to the VIP circle! Your invitation is confirmed.</span>
                </p>
              )}
            </form>
          </div>

          {/* Column 2: Collections */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.22em] text-[#E8C98A] font-bold">Atelier Vault</h4>
            <ul className="space-y-2 text-xs text-[#E9DDC8]/80 font-light">
              <li><Link to="/shop?category=necklaces" className="hover:text-[#E8C98A] transition-colors">Necklaces & Chokers</Link></li>
              <li><Link to="/shop?category=earrings" className="hover:text-[#E8C98A] transition-colors">Jhumkas & Chaandbalis</Link></li>
              <li><Link to="/shop?category=rings" className="hover:text-[#E8C98A] transition-colors">Kundan & Polki Rings</Link></li>
              <li><Link to="/shop?category=bracelets" className="hover:text-[#E8C98A] transition-colors">Bangles & Kadas</Link></li>
              <li><Link to="/collections" className="hover:text-[#E8C98A] transition-colors">New Royal Curations</Link></li>
            </ul>
          </div>

          {/* Column 3: Customer Concierge */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.22em] text-[#E8C98A] font-bold">VIP Concierge</h4>
            <ul className="space-y-2 text-xs text-[#E9DDC8]/80 font-light">
              <li><Link to="/contact" className="hover:text-[#E8C98A] transition-colors">Bespoke Inquiries</Link></li>
              <li><Link to="/track-order" className="hover:text-[#E8C98A] transition-colors">Track Shipment</Link></li>
              <li><Link to="/faqs" className="hover:text-[#E8C98A] transition-colors">Jewellery Care Guide</Link></li>
              <li><Link to="/about" className="hover:text-[#E8C98A] transition-colors">Bengal Heritage Archive</Link></li>
            </ul>
          </div>

          {/* Column 4: Client Policies & Social */}
          <div className="space-y-5">
            <div>
              <h4 className="text-xs uppercase tracking-[0.22em] text-[#E8C98A] font-bold mb-3">Privileges & Terms</h4>
              <ul className="space-y-2 text-xs text-[#E9DDC8]/80 font-light">
                <li><Link to="/shipping-policy" className="hover:text-[#E8C98A] transition-colors">Insured Shipping Policy</Link></li>
                <li><Link to="/return-policy" className="hover:text-[#E8C98A] transition-colors">7-Day Return Guarantee</Link></li>
                <li><Link to="/privacy-policy" className="hover:text-[#E8C98A] transition-colors">Client Confidentiality</Link></li>
                <li><Link to="/terms" className="hover:text-[#E8C98A] transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-[0.22em] text-[#E8C98A] font-bold mb-2">Connect</h4>
              <div className="flex gap-2.5 text-[#E9DDC8]">
                <a href="https://www.instagram.com/alongkar.official/" target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-full bg-white/[0.05] hover:text-[#E8C98A] hover:bg-[#E8C98A]/15 transition-all border border-[#E8C98A]/20" aria-label="Instagram">
                  <InstagramIcon size={15} />
                </a>
                <a href="#" className="p-2.5 rounded-full bg-white/[0.05] hover:text-[#E8C98A] hover:bg-[#E8C98A]/15 transition-all border border-[#E8C98A]/20" aria-label="Facebook">
                  <FacebookIcon size={15} />
                </a>
                <a href="mailto:care@alongkar.com" className="p-2.5 rounded-full bg-white/[0.05] hover:text-[#E8C98A] hover:bg-[#E8C98A]/15 transition-all border border-[#E8C98A]/20" aria-label="Email Concierge">
                  <Mail size={15} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Assured Payments */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#E9DDC8]/50 gap-4">
          <p>© {new Date().getFullYear()} ALONGKAR Haute Joaillerie. All Rights Reserved.</p>
          <div className="flex items-center gap-2.5 text-xs">
            <span className="border border-[#E8C98A]/20 px-2 py-0.5 rounded text-[9px] text-[#E8C98A] font-mono bg-white/[0.02]">100% ENCRYPTED</span>
            <span className="border border-[#E8C98A]/20 px-2 py-0.5 rounded text-[9px] text-[#E8C98A] font-mono bg-white/[0.02]">UPI</span>
            <span className="border border-[#E8C98A]/20 px-2 py-0.5 rounded text-[9px] text-[#E8C98A] font-mono bg-white/[0.02]">VISA</span>
            <span className="border border-[#E8C98A]/20 px-2 py-0.5 rounded text-[9px] text-[#E8C98A] font-mono bg-white/[0.02]">MASTERCARD</span>
            <span className="border border-[#E8C98A]/20 px-2 py-0.5 rounded text-[9px] text-[#E8C98A] font-mono bg-white/[0.02]">COD AVAILABLE</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
