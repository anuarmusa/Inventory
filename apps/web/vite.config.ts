import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the server runs separately (pnpm dev); API calls are proxied to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/health': 'http://localhost:3000' },
  },
});
