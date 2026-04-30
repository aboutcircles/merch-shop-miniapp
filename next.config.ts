import type { NextConfig } from "next";

function buildRemoteImagePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const patterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
  const supabaseUrl = process.env.SUPABASE_URL;

  if (supabaseUrl) {
    try {
      const { hostname } = new URL(supabaseUrl);
      patterns.push({ protocol: "https", hostname });
    } catch {
      // Ignore malformed SUPABASE_URL — it will be caught by env validation at runtime.
    }
  }

  const extra = process.env.NEXT_IMAGE_ALLOWED_HOSTS;

  if (extra) {
    for (const raw of extra.split(",")) {
      const hostname = raw.trim();

      if (hostname) {
        patterns.push({ protocol: "https", hostname });
      }
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: buildRemoteImagePatterns(),
  },
};

export default nextConfig;
