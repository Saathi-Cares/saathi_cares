'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container mx-auto px-6 py-32 text-center">
      <h1 className="font-serif text-3xl">Something went wrong</h1>
      {error.digest ? <p className="mt-2 text-sm text-muted-foreground">Reference: {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </button>
    </main>
  );
}
