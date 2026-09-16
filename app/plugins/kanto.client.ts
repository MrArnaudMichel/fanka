// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto/vue');
});
