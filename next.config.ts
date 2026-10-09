import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sample CSV files are read from disk at request time; make sure Vercel bundles them.
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
  serverExternalPackages: ["pg", "exceljs"],
};

export default nextConfig;
