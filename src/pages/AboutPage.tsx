import React from 'react';
import { Award, Sparkles, Heart, CheckCircle2 } from 'lucide-react';
import { SectionHeading } from '../components/ui/SectionHeading';

export const AboutPage: React.FC = () => {
  return (
    <main className="py-12 sm:py-20 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Hero Banner */}
        <div className="relative rounded-brand overflow-hidden bg-espresso text-ivory-pearl p-8 sm:p-16 text-center border border-gold/30 shadow-elevated">
          <div className="absolute inset-0 opacity-20">
            <img
              src="https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1600&auto=format&fit=crop"
              alt="Heritage Alongkar"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="relative z-10 max-w-3xl mx-auto space-y-4">
            <span className="text-xs uppercase tracking-[0.3em] text-gold-champagne font-semibold bg-gold/20 px-3 py-1 rounded border border-gold/30">
              OUR BRAND HERITAGE
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-ivory-pearl">
              Crafting Indian Elegance Since 1994
            </h1>
            <p className="text-xs sm:text-sm text-gray-300 font-light leading-relaxed">
              ALONGKAR was born out of a passion to democratize luxury jewellery in India. We believe every woman deserves to experience the radiance of pure gold aesthetics without compromising on daily comfort or budget.
            </p>
          </div>
        </div>

        {/* Pillars Section */}
        <div>
          <SectionHeading title="The Alongkar Pillars" subtitle="What Guides Our Craft" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-gold/15 rounded-full flex items-center justify-center mx-auto text-gold">
                <Sparkles size={24} />
              </div>
              <h3 className="font-serif text-lg font-bold text-espresso">Heritage Artisantry</h3>
              <p className="text-xs text-espresso-light leading-relaxed font-light">
                Each piece is handcrafted by master karigars trained in centuries-old Kundan, Polki, and Nakshi techniques.
              </p>
            </div>

            <div className="p-8 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-gold/15 rounded-full flex items-center justify-center mx-auto text-gold">
                <Award size={24} />
              </div>
              <h3 className="font-serif text-lg font-bold text-espresso">24K Micron Gold Plating</h3>
              <p className="text-xs text-espresso-light leading-relaxed font-light">
                Our proprietary electroplating coat seals the lustre against tarnishing, water contact, and daily wear.
              </p>
            </div>

            <div className="p-8 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft text-center space-y-3">
              <div className="w-12 h-12 bg-gold/15 rounded-full flex items-center justify-center mx-auto text-gold">
                <Heart size={24} />
              </div>
              <h3 className="font-serif text-lg font-bold text-espresso">Accessible Luxury</h3>
              <p className="text-xs text-espresso-light leading-relaxed font-light">
                Empowering women to express their unique identity with statement pieces priced thoughtfully.
              </p>
            </div>
          </div>
        </div>

        {/* Crafting Process */}
        <div className="p-8 sm:p-12 bg-ivory-pearl rounded-brand border border-gold/20 shadow-soft">
          <div className="max-w-2xl mx-auto text-center mb-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-espresso">Our Quality Assurance Process</h2>
            <p className="text-xs text-gray-500 mt-2">How every Alongkar piece travels from workbench to your doorstep.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs text-espresso">
            <div className="p-4 bg-ivory rounded-brand border border-gold/10 space-y-2">
              <div className="flex items-center gap-2 font-bold text-gold">
                <CheckCircle2 size={16} /> 1. Alloy Casting
              </div>
              <p className="text-gray-500">Skin-friendly, lead-free and nickel-free brass alloy foundations.</p>
            </div>
            <div className="p-4 bg-ivory rounded-brand border border-gold/10 space-y-2">
              <div className="flex items-center gap-2 font-bold text-gold">
                <CheckCircle2 size={16} /> 2. Hand Carving
              </div>
              <p className="text-gray-500">Meticulous stone setting & detailed filigree carving by artisans.</p>
            </div>
            <div className="p-4 bg-ivory rounded-brand border border-gold/10 space-y-2">
              <div className="flex items-center gap-2 font-bold text-gold">
                <CheckCircle2 size={16} /> 3. Micron Coating
              </div>
              <p className="text-gray-500">Multi-layer 24K gold electroplating for long-lasting radiant shine.</p>
            </div>
            <div className="p-4 bg-ivory rounded-brand border border-gold/10 space-y-2">
              <div className="flex items-center gap-2 font-bold text-gold">
                <CheckCircle2 size={16} /> 4. Velvet Packaging
              </div>
              <p className="text-gray-500">Inspected for smooth edges and packed in signature protective box.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
