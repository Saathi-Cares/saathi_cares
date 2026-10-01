'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Heart, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { navLinks, org } from '@/content/site';
import { cn } from '@/lib/utils';

// Staff portal links are added when those routes exist (PLAN.md Phase 0 only ships public pages).

function subscribeToScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

// Read on mount as well as on scroll, so a page restored mid-scroll gets the solid header at once.
const isScrolledNow = () => window.scrollY > 20;
const isScrolledOnServer = () => false;

export function Header() {
  const isScrolled = useSyncExternalStore(subscribeToScroll, isScrolledNow, isScrolledOnServer);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobileMenuOpen]);

  const isActive = (href: string) => !href.startsWith('/#') && pathname === href;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled || isMobileMenuOpen ? 'bg-background/95 backdrop-blur-md shadow-soft' : 'bg-transparent'}`}
    >
      <div className="container-wide mx-auto px-6 md:px-12">
        <nav className="flex items-center justify-between h-20" aria-label="Main">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-serif font-semibold text-xl text-foreground">{org.name}</span>
              <p className="text-xs text-muted-foreground -mt-0.5">{org.tagline}</p>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-foreground',
                  isActive(link.href) ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {link.name}
              </Link>
            ))}
            <Button
              asChild
              size="sm"
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium"
            >
              <Link href="/donate" aria-current={isActive('/donate') ? 'page' : undefined}>
                <Heart className="w-4 h-4 mr-1" />
                Donate
              </Link>
            </Button>
          </div>

          <button
            ref={menuButtonRef}
            type="button"
            className="lg:hidden p-2 -mr-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6 text-foreground" />
            ) : (
              <Menu className="w-6 h-6 text-foreground" />
            )}
          </button>
        </nav>
      </div>

      {isMobileMenuOpen && (
        <div id="mobile-menu" className="enter lg:hidden bg-background border-t border-border">
          <div className="px-6 py-6 space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'block text-lg font-medium transition-colors hover:text-primary',
                  isActive(link.href) ? 'text-primary' : 'text-foreground',
                )}
              >
                {link.name}
              </Link>
            ))}
            <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
              <Link
                href="/donate"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={isActive('/donate') ? 'page' : undefined}
              >
                <Heart className="w-4 h-4 mr-2" />
                Donate
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
