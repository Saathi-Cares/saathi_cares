import type { Metadata } from 'next';
import { Inter, Lora } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
});

const siteUrl = 'https://cares.saathiventures.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Saathi Cares | Taking Oral Healthcare to the Last Mile', template: '%s | Saathi Cares' },
  description:
    'Saathi Cares by SHC Foundation provides free dental camps, school oral health programs, and community outreach to underserved communities across India.',
  authors: [{ name: 'SHC Foundation (Saathi Ventures)' }],
  keywords: [
    'oral health',
    'dental care',
    'nonprofit',
    'India',
    'Saathi Ventures',
    'SHC Foundation',
    'dental camps',
  ],
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Saathi Cares',
    locale: 'en_IN',
    title: 'Saathi Cares | Taking Oral Healthcare to the Last Mile',
    description:
      'Free dental camps, school programs, and community outreach for underserved communities across India.',
    images: [{ url: '/og-image.jpg' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.jpg'] },
  icons: { icon: '/favicon.svg' },
};

const organisationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: 'Saathi Cares',
  alternateName: 'SHC Foundation',
  url: siteUrl,
  description:
    'Taking oral healthcare to the last mile: free dental camps and programs for underserved communities across India.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Gurugram',
    addressRegion: 'Haryana',
    postalCode: '122001',
    addressCountry: 'IN',
  },
  sameAs: ['https://www.linkedin.com/company/saathiventures', 'https://twitter.com/saathiventures'],
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
