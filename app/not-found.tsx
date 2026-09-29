import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container mx-auto px-6 py-32 text-center">
      <h1 className="font-serif text-4xl">Page not found</h1>
      <p className="mt-4 text-muted-foreground">The page you are looking for does not exist.</p>
      <Link href="/" className="mt-8 inline-block underline">
        Back to home
      </Link>
    </main>
  );
}
