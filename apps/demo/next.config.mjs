/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@boredooms/vistra-sdk", "@boredooms/vistra-ghost-cursor"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/docs": ["./content/**/*"] },
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};
export default nextConfig;
