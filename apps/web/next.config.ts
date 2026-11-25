import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@job-bot/shared'],
  serverExternalPackages: ['pdf-parse', 'nodemailer'],
};

export default nextConfig;
