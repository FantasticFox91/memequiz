// /quiz/:id и /result/:id без ника не имеют смысла: отправляем вводить ник
export default defineNuxtRouteMiddleware(() => {
  if (!useParticipantStore().nickname) {
    return navigateTo('/');
  }
});
