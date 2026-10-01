import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The `.enter` entrance animation from app/globals.css, which runs on page load (not on scroll) and is off
// for users who prefer reduced motion. `delay` staggers siblings, in milliseconds.
export function Enter({
  delay = 0,
  as: Tag = 'div',
  className,
  children,
}: {
  delay?: number;
  as?: 'div' | 'p';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn('enter', className)} style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
