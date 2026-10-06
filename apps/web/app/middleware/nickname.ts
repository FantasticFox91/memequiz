// /quiz и /result без ника не имеют смысла: отправляем вводить ник
export default defineNuxtRouteMiddleware(() => {
  if (!useParticipantStore().nickname) {
    return navigateTo('/');
  }
});
