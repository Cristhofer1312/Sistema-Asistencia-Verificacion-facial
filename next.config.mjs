/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Habilita instrumentation.ts (fija TZ=America/Caracas al arrancar).
  experimental: { instrumentationHook: true },
};
export default nextConfig;
