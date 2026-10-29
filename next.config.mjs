/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.MAMITA_QA_BUILD === "true" ? ".next-qa" : ".next",
  reactStrictMode: true,
  // Preserve the browser origin when middleware redirects local IP addresses.
  skipMiddlewareUrlNormalize: true,
};

export default nextConfig;
