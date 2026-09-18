import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gold' | 'burgundy' | 'dark' | 'outline';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gold',
  className,
}) => {
  const variantStyles = {
    gold: 'bg-gold-champagne/20 text-espresso border border-gold/40',
    burgundy: 'bg-burgundy text-ivory-pearl',
    dark: 'bg-espresso text-gold-champagne',
    outline: 'border border-espresso/20 text-espresso-light bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium tracking-wider uppercase rounded-brand transition-colors',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
