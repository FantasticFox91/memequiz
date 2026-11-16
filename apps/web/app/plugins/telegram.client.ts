// initData читается из hash стартового URL до первой навигации, пока роутер его не потерял
export default defineNuxtPlugin(() => {
  const { isTelegram, initData, webApp, supports } = useTelegram();
  if (!isTelegram) return;

  // CSS переключает цвета и высоту экрана на значения Telegram (см. main.css)
  document.documentElement.dataset.tg = '';

  const router = useRouter();
  // t.me/<бот>?startapp=map_<id> — ссылка «Поделиться» карты нефти: сразу открываем карту
  const startParam = new URLSearchParams(initData ?? '').get('start_param') ?? '';
  const sharedMap = /^map_([A-Za-z0-9]{10})$/.exec(startParam)?.[1];
  if (sharedMap) {
    void router.isReady().then(() => router.replace({ path: '/map', query: { id: sharedMap } }));
  }

  if (!webApp) return;
  webApp.ready();
  webApp.expand();

  if (!supports('6.1')) return;
  const back = webApp.BackButton;

  // с главной «назад» некуда; с викторины, результата и лидерборда — к выбору викторины
  const updateBack = (path: string) => (path === '/' ? back.hide() : back.show());

  back.onClick(() => {
    const { path } = router.currentRoute.value;
    // в лидерборд могли прийти с результата; если истории нет (открыли сразу) — на главную
    if (path === '/leaderboard' && window.history.state?.back) router.back();
    // карта нефти: с открытой карты — к списку карт, со списка — к калькулятору
    else if (path === '/map') void navigateTo(router.currentRoute.value.query.id ? '/map' : '/oil');
    else void navigateTo('/');
  });
  router.afterEach((to) => updateBack(to.path));
  updateBack(router.currentRoute.value.path);
});
