import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: import.meta.dirname },
  experimental: { globalNotFound: true },
};

export default config;
