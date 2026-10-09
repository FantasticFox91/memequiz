// адрес сайта на момент сборки (Docker: из SITE_ADDRESS). og:image и og:url должны быть абсолютными,
// иначе мессенджеры не покажут превью; без адреса (локально) пути относительные
const SITE_URL = process.env.SITE_ADDRESS ? `https://${process.env.SITE_ADDRESS}` : '';
const TITLE = 'MemeQuiz — викторина по мемам';
const DESCRIPTION =
  'Угадай мем, вспомни фразу и персонажа. Проверь, насколько ты в теме, и сравни результат с друзьями.';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],

  app: {
    // стили — в assets/css/main.css (.page-*)
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: TITLE,
      htmlAttrs: { lang: 'ru' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: DESCRIPTION },
        { name: 'theme-color', content: '#2481cc' },
        // превью ссылки в Telegram, WhatsApp, VK и т.п. Картинка: scripts/make-brand-assets.mjs
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'MemeQuiz' },
        { property: 'og:locale', content: 'ru_RU' },
        { property: 'og:title', content: TITLE },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:url', content: `${SITE_URL}/` },
        { property: 'og:image', content: `${SITE_URL}/og-image.jpg` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'MemeQuiz: викторина по мемам' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
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
