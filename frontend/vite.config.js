import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const foodSrc = path.resolve(__dirname, './src/modules/Food')
const servicesApi = path.resolve(__dirname, './src/services/api')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('@mui') || id.includes('@emotion')) return 'vendor-mui'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (id.includes('@react-google-maps') || id.includes('@googlemaps') || id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'vendor-maps'
          }
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg')) {
            return 'vendor-export'
          }
          if (id.includes('framer-motion') || id.includes('motion') || id.includes('gsap') || id.includes('lenis')) {
            return 'vendor-motion'
          }

          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      // More specific first so @food/api/* resolves to services (no backend)
      '@food/api/axios': path.resolve(servicesApi, 'axios.js'),
      '@food/api/config': path.resolve(servicesApi, 'config.js'),
      '@food/api': servicesApi,
      '@food': foodSrc,
      '@delivery': path.resolve(__dirname, './src/modules/DeliveryV2'),
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      '@emotion/react',
      '@emotion/styled',
      '@mui/material',
      '@mui/x-date-pickers',
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Backend API (default 5000)
      '/api/v1': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
