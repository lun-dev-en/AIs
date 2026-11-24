import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const url = new URL(backend);
if (
  url.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
) {
  throw new Error("BACKEND_URL はローカルの HTTP アドレスを指定してください。");
}

const config: NextConfig = {
  distDir: process.env.LAB_TEST_BUILD === "1" ? ".next-test" : ".next",
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default config;
