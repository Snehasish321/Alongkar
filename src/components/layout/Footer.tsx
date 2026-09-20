import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ShieldCheck, Truck, RefreshCw, Award, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
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
    <footer className="bg-[#40000D] text-ivory-pearl pt-16 pb-8 border-t border-gold/20">
      {/* Brand Trust Badges Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 mb-12 border-b border-gold/15">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="flex flex-col items-center space-y-2 p-3 rounded-brand hover:bg-gold/5 transition-colors">
            <Award className="text-gold" size={28} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-ivory-pearl">Quality Checked</h4>
            <p className="text-[11px] text-gray-400">Strictly inspected 24K city gold finish</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-3 rounded-brand hover:bg-gold/5 transition-colors">
            <ShieldCheck className="text-gold" size={28} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-ivory-pearl">Secure Packaging</h4>
            <p className="text-[11px] text-gray-400">Tamper-proof luxury presentation box</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-3 rounded-brand hover:bg-gold/5 transition-colors">
            <Truck className="text-gold" size={28} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-ivory-pearl">Fast Shipping</h4>
            <p className="text-[11px] text-gray-400">Express delivery across 20,000+ PIN codes</p>
          </div>
          <div className="flex flex-col items-center space-y-2 p-3 rounded-brand hover:bg-gold/5 transition-colors">
            <RefreshCw className="text-gold" size={28} />
            <h4 className="font-serif text-sm font-semibold tracking-wide text-ivory-pearl">Easy Returns</h4>
            <p className="text-[11px] text-gray-400">7-day hassle-free replacement policy</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-gold/15">
          {/* Column 1: Brand & Newsletter */}
          <div className="lg:col-span-2 space-y-1.5">
            <Link to="/" className="inline-block">
              <img
                src="/alongkar-logo.png"
                alt="Alongkar — City Gold Jewellery"
                className="h-17 w-auto object-contain block"
              />
            </Link>
            <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
              ALONGKAR is a modern Indian jewellery brand specializing in high-grade city-gold pieces. Designed to fuse heritage craftsmanship with contemporary grace.
            </p>

            <form onSubmit={handleSubscribe} className="pt-2 max-w-sm">
              <label htmlFor="newsletter" className="block text-[11px] uppercase tracking-widest text-gold font-medium mb-2">
                Join The Alongkar Circle
              </label>
              <div className="flex gap-2">
                <input
                  id="newsletter"
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  className="bg-[#2A0008] text-xs text-ivory-pearl placeholder:text-gray-500 px-3 py-2.5 rounded-brand border border-gold/20 focus:outline-none focus:border-gold flex-1"
                />
                <Button type="submit" variant="gold" size="sm" className="px-4">
                  <ArrowRight size={14} />
                </Button>
              </div>
              {subscribed && (
                <p className="text-[11px] text-gold mt-1.5 font-medium">
                  ✨ Thank you for subscribing to Alongkar updates!
                </p>
              )}
            </form>
          </div>

          {/* Column 2: Shop */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.2em] text-gold font-bold">Shop</h4>
            <ul className="space-y-2 text-xs text-gray-300">
              <li><Link to="/shop?category=necklaces" className="hover:text-gold transition-colors">Necklaces & Chokers</Link></li>
              <li><Link to="/shop?category=earrings" className="hover:text-gold transition-colors">Jhumkas & Earrings</Link></li>
              <li><Link to="/shop?category=rings" className="hover:text-gold transition-colors">Polki & Solitaire Rings</Link></li>
              <li><Link to="/shop?category=bracelets" className="hover:text-gold transition-colors">Kadas & Bracelets</Link></li>
              <li><Link to="/collections" className="hover:text-gold transition-colors">New Arrivals</Link></li>
            </ul>
          </div>

          {/* Column 3: Customer Care */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-[0.2em] text-gold font-bold">Customer Care</h4>
            <ul className="space-y-2 text-xs text-gray-300">
              <li><Link to="/contact" className="hover:text-gold transition-colors">Contact Us</Link></li>
              <li><Link to="/track-order" className="hover:text-gold transition-colors">Track Your Order</Link></li>
              <li><Link to="/faqs" className="hover:text-gold transition-colors">Care Instructions</Link></li>
              <li><Link to="/about" className="hover:text-gold transition-colors">Our Heritage Story</Link></li>
            </ul>
          </div>

          {/* Column 4: Policies & Social */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs uppercase tracking-[0.2em] text-gold font-bold mb-3">Policies</h4>
              <ul className="space-y-2 text-xs text-gray-300">
                <li><Link to="/shipping-policy" className="hover:text-gold transition-colors">Shipping Policy</Link></li>
                <li><Link to="/return-policy" className="hover:text-gold transition-colors">Return & Refund Policy</Link></li>
                <li><Link to="/privacy-policy" className="hover:text-gold transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-gold transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] uppercase tracking-[0.2em] text-gold font-bold mb-2">Follow Us</h4>
              <div className="flex gap-3 text-gray-300">
                <a href="https://www.instagram.com/alongkar.official/" className="p-3 rounded-full bg-[#2A0008] hover:text-gold hover:bg-gold/20 transition-colors" aria-label="Instagram">
                  <InstagramIcon size={16} />
                </a>
                <a href="#" className="p-3 rounded-full bg-[#2A0008] hover:text-gold hover:bg-gold/20 transition-colors" aria-label="Facebook">
                  <FacebookIcon size={16} />
                </a>
                <a href="#" className="p-3 rounded-full bg-[#2A0008] hover:text-gold hover:bg-gold/20 transition-colors" aria-label="Mail">
                  <Mail size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright & Payment Placeholders */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 gap-4">
          <p>© {new Date().getFullYear()} ALONGKAR Jewellery Brand. All Rights Reserved.</p>
          <div className="flex items-center gap-3 text-xs opacity-75">
            <span className="border border-gold/20 px-2 py-0.5 rounded text-[10px] text-gold-champagne font-mono">UPI</span>
            <span className="border border-gold/20 px-2 py-0.5 rounded text-[10px] text-gold-champagne font-mono">VISA</span>
            <span className="border border-gold/20 px-2 py-0.5 rounded text-[10px] text-gold-champagne font-mono">Mastercard</span>
            <span className="border border-gold/20 px-2 py-0.5 rounded text-[10px] text-gold-champagne font-mono">NetBanking</span>
            <span className="border border-gold/20 px-2 py-0.5 rounded text-[10px] text-gold-champagne font-mono">COD</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
