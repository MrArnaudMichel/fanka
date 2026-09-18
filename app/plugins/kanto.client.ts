import { Check, House, Layers, Play, Settings, Undo2, X } from 'lucide';
import { registerIcons } from 'kanto/icons';

// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto/vue');
  // Kanto ships only the icons its own elements draw; the app registers
  // whatever else its own UI uses. House/Play/Settings cover the nav;
  // Undo2/X/Check are the review page's undo, leave and "nothing due" icons;
  // Layers is the Today page's "no decks yet" empty state.
  registerIcons({ Check, House, Layers, Play, Settings, Undo2, X });
});
