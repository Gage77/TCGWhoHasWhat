import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Card art is served by Scryfall's image CDN.
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
