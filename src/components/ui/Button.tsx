import React from 'react';
import { cn } from '../../lib/utils';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium tracking-wider uppercase transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:opacity-50 disabled:cursor-not-allowed rounded-brand cursor-pointer';

  const sizeStyles = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-xs md:text-sm',
    lg: 'px-8 py-4 text-sm tracking-widest',
  };

  const variantStyles = {
    primary:
      'bg-espresso text-ivory-pearl hover:bg-espresso-charcoal hover:shadow-elevated border border-espresso',
    secondary:
      'bg-ivory-pearl text-espresso hover:bg-ivory-soft border border-espresso/20 shadow-soft',
    gold:
      'bg-gold text-ivory-pearl hover:bg-gold-dark shadow-gold-glow border border-gold',
    outline:
      'bg-transparent text-espresso border border-espresso/30 hover:border-gold hover:text-gold',
    ghost:
      'bg-transparent text-espresso hover:text-gold hover:bg-gold/10 border-transparent',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={cn(
        baseStyles,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};
