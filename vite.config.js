import { defineConfig } from 'vite'

export default defineConfig({
  // 项目根目录
  root: '.',
  
  // 公共基础路径
  base: '/',
  
  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
    host: true
  },
  
  // 构建配置
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 生成 sourcemap 便于调试
    sourcemap: false,
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // 分块策略
    rollupOptions: {
      input: {
        main: './index.html',
        coverage: './coverage.html'
      },
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    }
  },
  
  // 预览服务器配置（用于预览构建产物）
  preview: {
    port: 4173,
    host: true
  }
})
