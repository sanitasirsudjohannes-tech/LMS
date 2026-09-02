import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'LONTAR - LMS Online & Pelatihan Terpadu',
    short_name: 'LONTAR',
    description: 'LMS Online & Pelatihan Terpadu RSUD Prof. Dr. W.Z. Johannes Kupang.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f6ef',
    theme_color: '#07375c',
    orientation: 'any',
    categories: ['education', 'medical'],
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
