// vite.config.js
export default {
    preview: {
      host: '0.0.0.0',
      port: process.env.PORT || 3000,
      allowedHosts: [
        'cartesia-maeda-speaker.onrender.com',
        'localhost',
      ]
    },
    build: {
      chunkSizeWarningLimit: 600, // This also fixes the previous warning
    }
  }