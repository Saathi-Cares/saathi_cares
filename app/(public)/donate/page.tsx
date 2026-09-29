import type { Metadata } from 'next';
import Link from 'next/link';
import { siteContent } from '@/content/site';

export const metadata: Metadata = { title: 'Donate' };

export default function DonatePage() {
  const { cta } = siteContent;
  return (
    <section className="container mx-auto px-6 py-24 max-w-3xl">
      <p className="text-sm font-medium text-accent">{cta.badge}</p>
      <h1 className="font-serif text-4xl mt-2">{cta.title}</h1>
      <p className="mt-4 text-muted-foreground">{cta.description}</p>
      <p className="mt-8 rounded-lg border p-4">
        Online donations are not available yet. To support Saathi Cares, please{' '}
        <Link href="/contact" className="underline">
          contact us
        </Link>{' '}
        and we will get in touch.
      </p>
    </section>
  );
}
