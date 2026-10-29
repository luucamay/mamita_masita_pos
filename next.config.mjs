/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Preserve the browser origin when middleware redirects local IP addresses.
  skipMiddlewareUrlNormalize: true,
};

export default nextConfig;
