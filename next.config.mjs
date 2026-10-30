/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.MAMITA_QA_BUILD === "true" ? ".next-qa" : ".next",
  reactStrictMode: true,
  outputFileTracingIncludes: { "/historial/export": ["./public/icons/icon-192.png"] },
  // Preserve the browser origin when middleware redirects local IP addresses.
  skipMiddlewareUrlNormalize: true,
};

export default nextConfig;
