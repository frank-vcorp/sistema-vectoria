/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    // Next 14.2.x sólo reconoce la externalización bajo `experimental.serverComponentsExternalPackages`.
    // La clave top-level `serverExternalPackages` existe a partir de Next 15.
    // La UI es adaptador; los servicios no importan next/react.
    // Por construcción, esto se valida vía grep anti-patrón en check-antipatterns.
    serverComponentsExternalPackages: ["pg", "pg-boss", "@node-rs/argon2"],
  },
};

export default nextConfig;
