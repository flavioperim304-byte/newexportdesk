/** @type {import("next").NextConfig} */
const nextConfig = {
  // cacheComponents + partialPrefetching left `/` postponed. The browser
  // then requested `/?_rsc=…` and Render returned 500 Internal Server Error.
  serverExternalPackages: ["xlsx", "pg"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "**.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
