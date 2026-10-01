import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // why: nothing uses these yet (least privilege); Phase 2 re-enables camera and geolocation for clinical photos.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // why: stops `next dev` generating AGENTS.md and CLAUDE.md at the repo root when it detects an AI coding agent.
  agentRules: false,
  serverExternalPackages: ['pg', 'pg-boss', 'pino'],
  images: { deviceSizes: [360, 640, 828, 1080, 1600], minimumCacheTTL: 60 * 60 * 24 },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
