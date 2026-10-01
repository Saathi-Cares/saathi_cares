import type { Metadata } from 'next';
import { org } from '@/content/site';

// A page's `openGraph` replaces the root layout's whole `openGraph` object (Next merges metadata shallowly),
// so every page builds the complete object here. The canonical URL comes from the root layout (`./`).
export function pageMetadata({
  title,
  description,
  path,
}: {
  title?: string;
  description: string;
  path: string;
}): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    openGraph: {
      type: 'website',
      siteName: org.name,
      locale: 'en_IN',
      images: [{ url: '/og-image.jpg' }],
      url: path,
      title: title ? `${title} | ${org.name}` : `${org.name} | ${org.headline}`,
      description,
    },
  };
}
