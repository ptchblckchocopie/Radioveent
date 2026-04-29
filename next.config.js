const path = require("path");
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  allowedDevOrigins: ["*.trycloudflare.com"],
};
module.exports = nextConfig;
