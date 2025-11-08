/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    output: "export",
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.anime-pictures.net',
      },
      {
        protocol: 'https',
        hostname: 'httpbin.org',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'i.pximg.net',
      },
      {
        protocol: 'https',
        hostname: 'cdn.donmai.us',
      },
      {
        protocol: 'https',
        hostname: '*.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;