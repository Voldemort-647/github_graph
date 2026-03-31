/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow GitHub avatar images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  // Transpile neo4j-driver for edge runtime compatibility if needed
  experimental: {
    serverComponentsExternalPackages: ["neo4j-driver"],
  },
};

module.exports = nextConfig;
