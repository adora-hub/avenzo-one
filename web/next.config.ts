import type { NextConfig } from 'next'

const productImagePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = []
for (const value of [process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321']) {
  if (!value) continue
  try {
    const url = new URL(value)
    productImagePatterns.push({
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/storage/v1/object/sign/product-images/**',
    })
  } catch {
    // Invalid environment configuration is reported by the Supabase client at runtime.
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { remotePatterns: productImagePatterns },
}

export default nextConfig
