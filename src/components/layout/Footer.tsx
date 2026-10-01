import { Heart, Mail, MapPin } from 'lucide-react';
import Link from 'next/link';
import { navLinks, org, type OrgContent } from '@/content/site';

const socialIcons: Record<OrgContent['socials'][number]['name'], string> = {
  LinkedIn:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  Twitter:
    'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
};

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-wide mx-auto section-padding">
        <div className="grid md:grid-cols-4 gap-12 md:gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <span className="font-serif font-semibold text-xl">{org.name}</span>
                <p className="text-xs opacity-80 -mt-0.5">{org.tagline}</p>
              </div>
            </div>
            <p className="text-primary-foreground/80 max-w-md leading-relaxed">{org.summary}</p>
          </div>

          <div>
            <h2 className="font-serif font-semibold text-lg mb-4">Quick Links</h2>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-serif font-semibold text-lg mb-4">Contact</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 mt-0.5 shrink-0 opacity-80" />
                <address className="not-italic text-primary-foreground/80">
                  {org.address.lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 shrink-0 opacity-80" />
                <a
                  href={`mailto:${org.email}`}
                  className="text-primary-foreground/80 hover:text-primary-foreground transition-colors break-all"
                >
                  {org.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-12 mb-8">
          {org.socials.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Follow us on ${social.name}`}
              className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center text-primary-foreground/80 hover:bg-primary-foreground hover:text-primary hover:scale-110 hover:rotate-3 active:scale-95 transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d={socialIcons[social.name]} />
              </svg>
            </a>
          ))}
        </div>

        <div className="border-t border-primary-foreground/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-primary-foreground/80">
            © {new Date().getFullYear()} {org.name}. All rights reserved.
          </p>
          <p className="text-sm text-primary-foreground/80">A {org.parent} Initiative</p>
        </div>
      </div>
    </footer>
  );
}
