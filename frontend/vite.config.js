import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
            manifest: {
                name: 'Byla',
                short_name: 'Byla',
                description: 'Painel financeiro do Espaço Byla',
                theme_color: '#020617',
                background_color: '#020617',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                lang: 'pt-BR',
                icons: [
                    {
                        src: '/icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/icon-512-maskable.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // Só casca estática — nunca cachear API, Supabase nem dados financeiros.
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    {
                        urlPattern: function (_a) {
                            var url = _a.url;
                            return url.hostname.endsWith('supabase.co') ||
                                url.hostname.endsWith('supabase.in') ||
                                url.pathname.startsWith('/auth/v1') ||
                                url.pathname.startsWith('/rest/v1') ||
                                url.pathname.startsWith('/realtime/v1');
                        },
                        handler: 'NetworkOnly',
                        options: { cacheName: 'byla-never-supabase' },
                    },
                    {
                        urlPattern: function (_a) {
                            var url = _a.url;
                            return url.pathname.startsWith('/api/') ||
                                url.hostname.includes('onrender.com') ||
                                url.hostname.includes('byla-backend');
                        },
                        handler: 'NetworkOnly',
                        options: { cacheName: 'byla-never-api' },
                    },
                ],
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
    server: {
        port: 5174,
    },
});
