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
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
