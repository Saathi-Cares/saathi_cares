'use client';

import { useEffect, useState } from 'react';
import { Heart, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Section links point at anchors on the home page; `/contact` and `/donate` are routes.
// Staff portal links are added when those routes exist (PLAN.md Phase 0 only ships public pages).
const navLinks = [
  { name: 'Home', href: '/#home' },
  { name: 'About', href: '/#about' },
  { name: 'Our Work', href: '/#programs' },
  { name: 'Impact', href: '/#impact' },
  { name: 'Team', href: '/#team' },
  { name: 'Contact', href: '/contact' },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
              <span className="font-serif font-semibold text-xl text-foreground">Saathi Cares</span>
              <p className="text-xs text-muted-foreground -mt-0.5">Oral Health for All</p>
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
            type="button"
            className="lg:hidden p-2 -mr-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
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
        <div id="mobile-menu" className="reveal lg:hidden bg-background border-t border-border">
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
