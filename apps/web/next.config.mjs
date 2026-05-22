/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next transpile them.
  transpilePackages: [
    '@stockflow/api',
    '@stockflow/core',
    '@stockflow/db',
    '@stockflow/events',
    '@stockflow/ui',
    '@stockflow/config',
  ],
  experimental: {
    // Prisma + ioredis must stay external to the server bundle.
    serverComponentsExternalPackages: ['@prisma/client', 'prisma', 'ioredis', 'bullmq', 'pino', 'pino-pretty'],
  },
  output: 'standalone',
  webpack: (config) => {
    // Workspace packages use NodeNext-style `.js` import specifiers in `.ts` source.
    // Teach webpack to resolve `./x.js` to `./x.ts`/`.tsx` so transpilePackages works.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
