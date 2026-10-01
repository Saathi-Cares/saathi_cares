import type { NextConfig } from 'next';

// Header owners: this file sends X-Frame-Options, Referrer-Policy and Permissions-Policy; Nginx
// (infra/nginx/snippets/security-headers.conf) sends HSTS and X-Content-Type-Options. Never set a header in both places.
const securityHeaders = [
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
