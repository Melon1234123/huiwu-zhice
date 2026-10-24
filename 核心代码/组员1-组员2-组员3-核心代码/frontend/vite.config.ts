import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'/static/',build:{outDir:'../static',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'app.js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:asset=>asset.name?.endsWith('.css')?'style.css':'assets/[name]-[hash][extname]'}}},server:{proxy:{'/api':{target:'http://127.0.0.1:8765',changeOrigin:true,headers:{Origin:'http://127.0.0.1:8765'}}}}});
