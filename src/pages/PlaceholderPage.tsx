import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, Clock } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, subtitle }) => {
  return (
    <main className="py-20 sm:py-32 bg-ivory min-h-[70vh] flex items-center justify-center">
      <div className="max-w-xl mx-auto px-4 text-center space-y-6">
        <div className="w-16 h-16 bg-gold/15 rounded-full flex items-center justify-center mx-auto text-gold">
          <Clock size={32} />
        </div>

        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold font-bold">
          <Sparkles size={14} />
          <span>ALONGKAR BRAND POLICY</span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-espresso">
          {title}
        </h1>

        <div className="w-12 h-[1.5px] bg-gold/50 mx-auto" />

        <p className="text-xs sm:text-sm text-espresso-light leading-relaxed font-light">
          {subtitle || 'This section is currently under refinement as part of our premium platform upgrade. Detailed documentation will be published shortly.'}
        </p>

        <div className="pt-4">
          <Link to="/">
            <Button variant="gold" size="md" className="gap-2">
              <ArrowLeft size={16} />
              <span>RETURN TO HOME</span>
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
};
