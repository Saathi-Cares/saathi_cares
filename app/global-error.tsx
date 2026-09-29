'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: '4rem', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h1>Something went wrong</h1>
          {error.digest ? <p>Reference: {error.digest}</p> : null}
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
