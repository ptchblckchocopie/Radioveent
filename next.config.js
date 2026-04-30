const path = require("path");
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "radio.veent.ph",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
  ],
};
module.exports = nextConfig;
