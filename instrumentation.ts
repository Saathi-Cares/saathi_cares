export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./src/server/boot');
    await boot();
  }
}
