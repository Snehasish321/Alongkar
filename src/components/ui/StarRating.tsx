import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: number;
  className?: string;
  showNumber?: boolean;
  reviewCount?: number;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  maxStars = 5,
  size = 14,
  className,
  showNumber = false,
  reviewCount,
}) => {
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxStars }).map((_, index) => {
          const filled = index < Math.floor(rating);
          const half = index === Math.floor(rating) && rating % 1 >= 0.5;

          return (
            <Star
              key={index}
              size={size}
              className={cn(
                filled || half
                  ? 'fill-gold text-gold'
                  : 'text-gray-300 fill-transparent'
              )}
            />
          );
        })}
      </div>
      {showNumber && (
        <span className="text-xs font-medium text-espresso-light ml-1">
          {rating.toFixed(1)}
        </span>
      )}
      {reviewCount !== undefined && (
        <span className="text-xs text-gray-500">({reviewCount})</span>
      )}
    </div>
  );
};
