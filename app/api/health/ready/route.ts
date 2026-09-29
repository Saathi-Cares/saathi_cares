import { checkReadiness } from '@/server/health/readiness';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const readiness = await checkReadiness();
  return Response.json(readiness, { status: readiness.ok ? 200 : 503 });
}
