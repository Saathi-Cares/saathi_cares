import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import { org } from '@/content/site';
import './globals.css';

// Weights and styles actually used: Inter 400/500 for body text, Lora 600/700 for headings and figures.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});
const lora = Lora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-lora',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(org.url),
  title: { default: `${org.name} | ${org.headline}`, template: `%s | ${org.name}` },
  description: org.metaDescription,
  authors: [{ name: `${org.legalName} (${org.parent})` }],
  keywords: [
    'oral health',
    'dental care',
    'nonprofit',
    'India',
    'Saathi Ventures',
    'SHC Foundation',
    'community health',
    'rural healthcare',
    'dental camps',
    'free dental checkup',
  ],
  // `./` resolves against metadataBase per route, so each page is its own canonical URL.
  alternates: { canonical: './' },
  // No title or description here: each page sets its own `openGraph` (src/lib/page-metadata.ts).
  openGraph: {
    type: 'website',
    siteName: org.name,
    locale: 'en_IN',
    images: [{ url: '/og-image.jpg' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.jpg'] },
  icons: { icon: '/favicon.svg' },
};

const organisationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: org.name,
  alternateName: org.legalName,
  url: org.url,
  email: org.email,
  description: org.structuredDescription,
  address: {
    '@type': 'PostalAddress',
    addressLocality: org.address.locality,
    addressRegion: org.address.region,
    postalCode: org.address.postalCode,
    addressCountry: org.address.countryCode,
  },
  sameAs: org.socials.map((social) => social.href),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
        />
      </body>
    </html>
  );
}
