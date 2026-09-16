import { House, Play, Settings } from 'lucide';
import { registerIcons } from 'kanto/icons';

// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto/vue');
  // Kanto ships only the icons its own elements draw; the app registers
  // whatever else its own UI uses. These three cover the nav in this phase.
  registerIcons({ House, Play, Settings });
});
