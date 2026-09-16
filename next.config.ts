import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  compiler: {
    styledComponents: true,
  },
};

export default nextConfig;
