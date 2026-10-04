import React from 'react';

export interface BlurRevealProps {
  children: string;
  className?: string;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
  onAnimationComplete?: () => void;
  onAnimationStart?: () => void;
  as?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
  inView?: boolean;
  once?: boolean;
  letterSpacing?: string | number;
}

export function BlurReveal({
  children,
  className,
  as: Component = 'p',
  style,
  letterSpacing,
}: BlurRevealProps) {
  const Tag = Component as any;

  return (
    <Tag className={className} style={{ ...style, letterSpacing: letterSpacing || undefined }}>
      {children}
    </Tag>
  );
}

export default BlurReveal;

