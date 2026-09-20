/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@karate/types", "@karate/validation"],
};

export default nextConfig;
