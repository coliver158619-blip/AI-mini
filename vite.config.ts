import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), 'API_PROXY_TARGET');
 const target = process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:5000';
 const proxy = { '/api': { target, changeOrigin: true } };
 return {
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { proxy },
 };
});
