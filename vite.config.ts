import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import path from 'path';

function apiDevServerPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        try {
          if (pathname === '/api/cart' || pathname === '/api/cart/') {
            const { default: handler } = await server.ssrLoadModule('/api/cart.ts');
            return await handler(req, res);
          }
          if (pathname === '/api/wishlist' || pathname === '/api/wishlist/') {
            const { default: handler } = await server.ssrLoadModule('/api/wishlist.ts');
            return await handler(req, res);
          }
          next();
        } catch (error) {
          console.error(`Error handling ${req.url}:`, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevServerPlugin()],
  resolve: {
    alias: {
      'next/font/local': path.resolve(import.meta.dirname, './src/lib/next-font-local-stub.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@clerk')) {
              return 'vendor-clerk';
            }
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react/')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            return 'vendor';
          }
        },
      },
    },
  },
})
