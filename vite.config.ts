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
          if (pathname.startsWith('/api/products')) {
            const { default: handler } = await server.ssrLoadModule('/api/products.ts');
            return await handler(req, res);
          }
          if (pathname === '/api/wishlist' || pathname === '/api/wishlist/') {
            const { default: handler } = await server.ssrLoadModule('/api/wishlist.ts');
            return await handler(req, res);
          }
          if (pathname === '/api/jewellery-requests' || pathname === '/api/jewellery-requests/') {
            const { default: handler } = await server.ssrLoadModule('/api/jewellery-requests.ts');
            return await handler(req, res);
          }
          if (pathname.startsWith('/api/admin/jewellery-requests')) {
            const { default: handler } = await server.ssrLoadModule('/api/admin/jewellery-requests.ts');
            return await handler(req, res);
          }
          if (pathname === '/api/upload/jewellery-inspiration' || pathname === '/api/uploads/jewellery-inspiration') {
            const { default: handler } = await server.ssrLoadModule('/api/uploads/jewellery-inspiration.ts');
            return await handler(req, res);
          }
          if (pathname.startsWith('/api/uploads') || pathname === '/api/upload' || pathname === '/api/upload/') {
            const { default: handler } = await server.ssrLoadModule('/api/uploads/product-image.ts');
            return await handler(req, res);
          }
          if (pathname.startsWith('/api/payments/razorpay/order')) {
            const { default: handler } = await server.ssrLoadModule('/api/payments/razorpay/order.ts');
            return await handler(req, res);
          }
          if (pathname.startsWith('/api/admin/orders')) {
            const { default: handler } = await server.ssrLoadModule('/api/admin/orders.ts');
            return await handler(req, res);
          }
          if (pathname.startsWith('/api/orders') || pathname === '/api/order' || pathname === '/api/order/') {
            const { default: handler } = await server.ssrLoadModule('/api/orders.ts');
            return await handler(req, res);
          }
          if (pathname === '/api/health' || pathname === '/api/health/') {
            const { default: handler } = await server.ssrLoadModule('/api/health.ts');
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
  ssr: {
    external: ['@prisma/client', '.prisma/client'],
  },
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
            if (id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('lenis')) {
              return undefined;
            }
            return 'vendor';
          }
        },
      },
    },
  },
})
