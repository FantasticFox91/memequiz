// initData читается из hash стартового URL до первой навигации, пока роутер его не потерял
export default defineNuxtPlugin(() => {
  const { isTelegram, webApp, supports } = useTelegram();
  if (!isTelegram) return;

  // CSS переключает цвета и высоту экрана на значения Telegram (см. main.css)
  document.documentElement.dataset.tg = '';

  if (!webApp) return;
  webApp.ready();
  webApp.expand();

  if (!supports('6.1')) return;
  const router = useRouter();
  const back = webApp.BackButton;

  // с главной «назад» некуда; с викторины, результата и лидерборда — к выбору викторины
  const updateBack = (path: string) => (path === '/' ? back.hide() : back.show());

  back.onClick(() => {
    const { path } = router.currentRoute.value;
    // в лидерборд могли прийти с результата; если истории нет (открыли сразу) — на главную
    if (path === '/leaderboard' && window.history.state?.back) router.back();
    else void navigateTo('/');
  });
  router.afterEach((to) => updateBack(to.path));
  updateBack(router.currentRoute.value.path);
});
