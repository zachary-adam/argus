/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['mapbox-gl'],
  compiler: {
    // Strip console.log in production; keep warn/error
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['warn', 'error'] } : false,
  },
  experimental: {
    // Tree-shake large packages at the import level — saves bundle KB on date-fns, lucide, etc.
    optimizePackageImports: ['date-fns', 'lucide-react', '@anthropic-ai/sdk'],
  },
  webpack: (config, { isServer }) => {
    // Electron-only packages — never bundle into the web build
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      'electron',
      'electron-store',
      'better-sqlite3',
      '@anthropic-ai/sdk',
    ]
    config.resolve.fallback = { fs: false, net: false, tls: false, child_process: false }
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
