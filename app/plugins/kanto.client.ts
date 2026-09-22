import { Check, Ellipsis, House, Layers, Play, Plus, RefreshCw, TriangleAlert, Undo2, X } from 'lucide';
import { registerIcons } from 'kanto/icons';

// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto/vue');
  // Kanto ships only the icons its own elements draw; the app registers
  // whatever else its own UI uses. House/Play cover the nav; Undo2/X/Check
  // are the review page's undo, leave and "nothing due" icons; Layers is the
  // Today page's "no decks yet" empty state and the Decks nav entry; Plus is
  // the Decks page's New deck action; Ellipsis is each deck card's actions
  // dropdown trigger; TriangleAlert and RefreshCw are load-failure states and
  // their retry action. Settings returns with its page in phase 3.
  registerIcons({ Check, Ellipsis, House, Layers, Play, Plus, RefreshCw, TriangleAlert, Undo2, X });
});
