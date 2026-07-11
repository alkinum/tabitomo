import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import UnoCSS from '@unocss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import type { PluginOption } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    UnoCSS(),
    {
      name: 'kuromoji-browser-loader',
      transform(code, id) {
        // Replace NodeDictionaryLoader with BrowserDictionaryLoader for kuromoji
        if (id.includes('kuromoji') && id.includes('TokenizerBuilder')) {
          return {
            code: code.replace(
              './loader/NodeDictionaryLoader',
              './loader/BrowserDictionaryLoader'
            ),
            map: null
          };
        }
      }
    },
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Add cross-origin isolation headers for local WASM runtimes (SharedArrayBuffer support)
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

          // Serve kuromoji .gz files with proper headers
          if (req.url?.includes('/kuromoji/dict/') && req.url?.endsWith('.gz')) {
            // Don't let the browser auto-decompress
            res.setHeader('Content-Type', 'application/gzip');
            res.setHeader('Content-Encoding', 'identity');
          }

          next();
        });
      }
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['kuromoji/dict/*.gz'],
      pwaAssets: {
        config: true,
        overrideManifestIcons: true,
      },
      manifest: {
        name: 'tabitomo - AI-Powered Translation Companion',
        short_name: 'tabitomo',
        description: 'Your AI-powered travel companion for instant translation. Support text, voice, and image translation with OCR.',
        theme_color: 'transparent',
        background_color: '#eef2ff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        globIgnores: [
          // Local PP-OCR pulls large ONNX/OpenCV assets. Keep them lazy and cache on demand.
          '**/vendor-ocr-*.js',
          '**/localPpocrWorker-*.js',
          '**/worker-entry-*.js',
          '**/ort.bundle.min-*.js',
          '**/ort-*.wasm',
          // Local ASR pulls sherpa runtime/model assets lazily from a user-configured directory.
          '**/vendor-asr-*.js',
          '**/easy-asr*.js',
          '**/sherpa-onnx-*.js',
          '**/sherpa-onnx-*.wasm',
          '**/sherpa-onnx-*.data',
          '**/*.onnx',
          '**/tokens.txt',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\.(?:wasm|js|data|onnx|txt)$/i.test(url.pathname) && (
              url.pathname.includes('sherpa') ||
              url.pathname.includes('sensevoice') ||
              url.pathname.includes('sense-voice') ||
              url.pathname.includes('whisper') ||
              url.pathname.endsWith('/tokens.txt') ||
              url.pathname.endsWith('.onnx')
            ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-asr-runtime-cache',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200, 206]
              },
              rangeRequests: true
            }
          },
          {
            urlPattern: /\/assets\/(?:vendor-ocr|localPpocrWorker|worker-entry|ort\.bundle\.min)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-runtime-cache',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/kuromoji\/dict\/.*\.gz$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kuromoji-dict-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache WASM files (mozjpeg encoder from @jsquash/jpeg)
            urlPattern: /.*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ],
        navigateFallback: null
      }
    }),
    // Bundle analyzer - only in analyze mode
    ...(mode === 'analyze' ? [visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }) as PluginOption] : [])
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Use ESM version of kuroshiro-analyzer-kuromoji
      'kuroshiro-analyzer-kuromoji': 'kuroshiro-analyzer-kuromoji/src/index.js',
      // Provide browser-compatible path module for kuromoji
      'path': 'path-browserify',
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['kuromoji', 'kuroshiro-analyzer-kuromoji', 'react', 'react-dom'],
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id, { getModuleInfo }) => {
          // Check if this module imports React (including transitive dependencies)
          const hasReactImport = (id: string): boolean => {
            if (!id.includes('node_modules/')) return false;
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return true;
            }

            const info = getModuleInfo(id);
            if (!info) return false;

            // Check if any imports include react
            return info.importedIds.some(importId =>
              importId.includes('/react/') ||
              importId.includes('/react-dom/') ||
              importId.includes('/scheduler/')
            );
          };

          // Bundle ALL React and React-dependent modules together
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/scheduler') ||
              id.includes('node_modules/@radix-ui/') ||
              id.includes('lucide-react') ||
              id.includes('react-router') ||
              id.includes('@remix-run') ||
              id.includes('react-dropzone') ||
              id.includes('react-markdown') ||
              id.includes('streamdown') ||
              hasReactImport(id)) {
            return 'vendor-react';
          }

          // AI/ML libraries (heavy, don't use React) - bundle together
          if (id.includes('node_modules/ai/') ||
              id.includes('@ai-sdk/') ||
              id.includes('node_modules/openai/')) {
            return 'vendor-ai';
          }

          // Local ASR wrapper/runtime entry stays lazy and separate from the app shell.
          if (id.includes('node_modules/speech-asr/')) {
            return 'vendor-asr';
          }

          // Local PP-OCR dependencies are large and are only needed for image OCR.
          if (id.includes('node_modules/@paddleocr/paddleocr-js/') ||
              id.includes('node_modules/onnxruntime-web/') ||
              id.includes('node_modules/@techstark/opencv-js/') ||
              id.includes('node_modules/clipper-lib/') ||
              id.includes('node_modules/protobufjs/')) {
            return 'vendor-ocr';
          }

          // Utilities used throughout the app
          if (id.includes('clsx') || id.includes('tailwind-merge')) {
            return 'vendor-css-utils';
          }
          if (id.includes('node_modules/zod/')) {
            return 'vendor-zod';
          }

          // Let Vite auto-bundle everything else, including:
          // - local ASR runtime (configured externally and loaded lazily)
          // - QR libraries (dynamically imported)
          // - Japanese libs (dynamically imported)
          // - Image processing (dynamically imported)
          // - Markdown (dynamically imported)
        }
      }
    }
  },
}));
