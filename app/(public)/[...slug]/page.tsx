import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// Next serves an unmatched URL with the root-level not-found page, which sits outside the (public) layout.
// Catching every unmatched URL here and calling notFound() renders app/(public)/not-found.tsx inside the
// public layout instead, with the header and footer, and still responds 404.
export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function UnmatchedRoute() {
  notFound();
}
