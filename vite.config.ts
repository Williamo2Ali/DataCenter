import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path' // 1. استيراد مكتبة path

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // 2. إضافة إعدادات الـ Alias لتعريف علامة @
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // طابع زمني لنسخة البناء — يظهر في صفحة الإعدادات لتمييز النسخ عن بعضها.
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  
  server: {
    host: '0.0.0.0', 
    port: 5173,      
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})