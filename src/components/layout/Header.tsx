import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Heart, LogIn, ChevronDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const navLinks = [
  { name: 'Home', href: '/#home' },
  { name: 'About', href: '/#about' },
  { name: 'Our Work', href: '/#programs' },
  { name: 'Impact', href: '/#impact' },
  { name: 'Team', href: '/#team' },
  { name: 'Contact', href: '/contact' },
  { name: 'Donate', href: '/donate' },
];

const portalLinks = [
  { name: 'Admin Portal', href: '/admin/login' },
  { name: 'HMIS Portal', href: '/hmis/login' },
  { name: 'Volunteer Portal', href: '/volunteer/login' },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPortals, setShowPortals] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-background/95 backdrop-blur-md shadow-soft' : 'bg-transparent'}`}>
      <div className="container-wide mx-auto px-6 md:px-12">
        <nav className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center"><Heart className="w-5 h-5 text-primary-foreground" /></div>
            <div>
              <span className="font-serif font-semibold text-xl text-foreground">Saathi Cares</span>
              <p className="text-xs text-muted-foreground -mt-0.5">Oral Health for All</p>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map(link => {
              const isHash = link.href.startsWith('/#');
              if (isHash && isHomePage) {
                return <a key={link.name} href={link.href.replace('/', '')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{link.name}</a>;
              }
              if (link.href === '/donate') {
                return (
                  <Link key={link.name} to="/donate">
                    <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium">
                      <Heart className="w-4 h-4 mr-1" />Donate
                    </Button>
                  </Link>
                );
              }
              return <Link key={link.name} to={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{link.name}</Link>;
            })}
          </div>

          <div className="hidden lg:block relative">
            <Button size="sm" variant="outline" onClick={() => setShowPortals(!showPortals)}>
              <LogIn className="w-4 h-4 mr-2" />Login <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
            {showPortals && (
              <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-elevated p-2 min-w-[180px] z-50">
                {portalLinks.map(p => (
                  <Link key={p.name} to={p.href} onClick={() => setShowPortals(false)} className="block px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors">{p.name}</Link>
                ))}
              </div>
            )}
          </div>

          <button className="lg:hidden p-2 -mr-2" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle menu">
            {isMobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="lg:hidden bg-background border-t border-border">
            <div className="px-6 py-6 space-y-4">
              {navLinks.filter(l => l.href !== '/donate').map(link => {
                const isHash = link.href.startsWith('/#');
                if (isHash && isHomePage) {
                  return <a key={link.name} href={link.href.replace('/', '')} onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-medium text-foreground hover:text-primary transition-colors">{link.name}</a>;
                }
                return <Link key={link.name} to={link.href} onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-medium text-foreground hover:text-primary transition-colors">{link.name}</Link>;
              })}
              <div className="pt-4 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Portals</p>
                {portalLinks.map(p => (
                  <Link key={p.name} to={p.href} onClick={() => setIsMobileMenuOpen(false)} className="block text-base font-medium text-foreground hover:text-primary">{p.name}</Link>
                ))}
              </div>
              <Link to="/donate" onClick={() => setIsMobileMenuOpen(false)}>
                <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"><Heart className="w-4 h-4 mr-2" />Donate</Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
