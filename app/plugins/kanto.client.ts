import {
  ChartLine,
  Check,
  Ellipsis,
  FileQuestion,
  Flame,
  House,
  // Aliased: `Infinity` would shadow the global number.
  Infinity as InfinityIcon,
  Layers,
  List,
  Move,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from 'lucide';
import { registerIcons } from 'kanto-ds/icons';

// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto-ds/vue');
  // Kanto ships only the icons its own elements draw; the app registers
  // whatever else its own UI uses. House/Play cover the nav; Undo2/X/Check
  // are the review page's undo, leave and "nothing due" icons; Layers is the
  // Today page's "no decks yet" empty state, the Decks nav entry and the
  // card editor's "back to decks"/"no decks yet" actions; Plus is the Decks
  // page's New deck action, the Add nav entry and "go to decks" action;
  // Ellipsis is each deck card's actions dropdown trigger; TriangleAlert and
  // RefreshCw are load-failure states and their retry action; FileQuestion is
  // the card editor's "card not found" empty state. List is the Browse
  // ("Cards") nav entry; Search is Browse's filter field and its "no match"
  // empty state; Pause/Play (Play already listed) are Browse's
  // suspend/unsuspend actions; Move is its bulk Move action; SquarePen is
  // the card detail panel's Edit action; Trash2 is Browse's delete actions.
  // Upload is the Import nav entry, the Import empty-state action and the
  // import page's own primary action (Task 14). ChartLine is the Statistics
  // nav entry and its "no history yet" empty state; Flame is the streak
  // stat's icon; PenLine is the Writing nav entry; Infinity is the Practice
  // nav entry; Settings is the Settings nav entry (phase 3).
  registerIcons({
    ChartLine,
    Check,
    Ellipsis,
    FileQuestion,
    Flame,
    House,
    Infinity: InfinityIcon,
    Layers,
    List,
    Move,
    Pause,
    PenLine,
    Play,
    Plus,
    RefreshCw,
    Search,
    Settings,
    SquarePen,
    Trash2,
    TriangleAlert,
    Undo2,
    Upload,
    X,
  });

  // Dev-only nav entry (`useNavigation.ts`) for `/install` — its icon has no
  // business in a production bundle, so it is registered, and imported,
  // only under `import.meta.dev`; both are dead-code-eliminated otherwise.
  if (import.meta.dev) {
    const { Smartphone } = await import('lucide');
    registerIcons({ Smartphone });
  }
});
