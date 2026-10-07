export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'MemeQuiz',
      htmlAttrs: { lang: 'ru' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      // SDK Mini App: синхронно в head, до приложения (так требует Telegram).
      // Вне Telegram ничего не делает; если не загрузится, api-авторизация всё равно работает
      script: [{ src: 'https://telegram.org/js/telegram-web-app.js' }],
    },
  },

  runtimeConfig: {
    public: {
      apiBase: '/api',
    },
  },

  // в dev фронт на 3001, api на 3000: проксируем /api на Nest
  devServer: { port: 3001 },
  nitro: {
    devProxy: {
      '/api': { target: 'http://localhost:3000/api', changeOrigin: true },
    },
  },

  devtools: { enabled: true },
});
