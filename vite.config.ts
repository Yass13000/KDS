import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Cache tous les fichiers statiques de l'app
        globPatterns: ['**/*.{js,css,html,png,svg,otf,woff2,webp}'],
        
        // STRATÉGIE DE CACHE POUR SUPABASE (Plus de freeze d'images)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst', // Lit dans la tablette d'abord
            options: {
              cacheName: 'supabase-media-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // Garde 30 jours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        id: '/?source=pwa',
        name: 'KDS - Écran Cuisine & Commandes',
        short_name: 'KDS Cuisine',
        description: 'Système d\'affichage cuisine (KDS) en temps réel et gestion des commandes pour restaurant.',
        lang: 'fr-FR',
        dir: 'ltr',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: [
          'window-controls-overlay',
          'standalone',
          'minimal-ui'
        ],
        orientation: 'any',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        categories: [
          'food',
          'business',
          'productivity',
          'utilities'
        ],
        prefer_related_applications: false,
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/iconmob.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ],
        shortcuts: [
          {
            name: 'Écran Cuisine (KDS)',
            short_name: 'KDS',
            description: 'Accès direct au tableau d\'affichage cuisine en direct',
            url: '/?source=pwa_shortcut#/kds',
            icons: [
              {
                src: '/shortcut-kds-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          },
          {
            name: 'Historique des Commandes',
            short_name: 'Historique',
            description: 'Consulter les commandes en cours et traitées',
            url: '/?source=pwa_shortcut_orders#/kds',
            icons: [
              {
                src: '/shortcut-orders-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          }
        ],
        screenshots: [
          {
            src: '/screenshots/desktop-preview.webp',
            sizes: '1920x1080',
            type: 'image/webp',
            form_factor: 'wide',
            label: 'Interface KDS bureau plein écran optimisée avec Window Controls Overlay'
          },
          {
            src: '/screenshots/mobile-preview.webp',
            sizes: '1080x1920',
            type: 'image/webp',
            form_factor: 'narrow',
            label: 'Interface tactile fluide pour tablette et mobile'
          }
        ]
      }
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimisation pour tablette Elo (Android WebView)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Accélère l'exécution en retirant les logs
        drop_debugger: true,
      },
    },
    target: 'es2020',
    sourcemap: false,
    reportCompressedSize: false,
    cssCodeSplit: true, // Améliore le chargement du CSS
    
    // --- NOUVEAU : DÉCOUPAGE DU CODE POUR LIGHTHOUSE ---
    rollupOptions: {
      output: {
        manualChunks: {
          // Chunk 1 : Le moteur React (doit charger très vite)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Chunk 2 : Supabase (très lourd, on l'isole)
          'vendor-supabase': ['@supabase/supabase-js'],
          // Chunk 3 : UI et Animations (Framer Motion pèse lourd)
          'vendor-ui': ['framer-motion', 'lucide-react'],
        }
      }
    }
  },
});