import React from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  actionText?: string;
  actionHref?: string;
  onActionClick?: () => void;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  subtitle,
  align = 'center',
  className,
  actionText,
  onActionClick,
}) => {
  const alignmentStyles = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  };

  return (
    <div className={cn('flex flex-col mb-10 md:mb-14', alignmentStyles[align], className)}>
      {subtitle && (
        <span className="text-xs uppercase tracking-[0.25em] text-gold font-medium mb-2">
          {subtitle}
        </span>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-2xl sm:text-3xl md:text-4xl font-serif text-espresso font-medium tracking-tight"
      >
        {title}
      </motion.h2>

      <div className="w-12 h-[1.5px] bg-gold/50 my-3" />

      {actionText && (
        <button
          onClick={onActionClick}
          className="mt-2 text-xs uppercase tracking-widest text-espresso font-medium hover:text-gold transition-colors inline-flex items-center gap-1 group"
        >
          {actionText}
          <span className="group-hover:translate-x-1 transition-transform">→</span>
        </button>
      )}
    </div>
  );
};
