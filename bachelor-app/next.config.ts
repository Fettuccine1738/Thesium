import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  }, 
   experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/engines']
  }
};

export default nextConfig;
