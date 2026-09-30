import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache visited routes in the client router so re-navigating to a page is
  // instant instead of a fresh server round-trip. Client components (tracker,
  // bankroll) still hydrate + poll, so live data stays fresh.
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
