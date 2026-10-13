import {
  ArrowLeft,
  Bell,
  Calendar,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock,
  Cloud,
  Copy,
  Database,
  Ellipsis,
  EyeOff,
  FileQuestion,
  FileText,
  Flame,
  GraduationCap,
  House,
  // Aliased: `Infinity` would shadow the global number.
  Infinity as InfinityIcon,
  Info,
  Layers,
  List,
  LogOut,
  Mail,
  Move,
  Palette,
  Pause,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  SquarePen,
  SunMoon,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Type,
  Undo2,
  Upload,
  User,
  UserX,
  Volume2,
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
  // ("Cards") nav entry; Search is Browse's filter field, its "no match"
  // empty state and the sidebar's command palette button; Pause/Play (Play already listed) are Browse's
  // suspend/unsuspend actions; Move is its bulk Move action; SquarePen is
  // the card detail panel's Edit action; Trash2 is Browse's delete actions.
  // Upload is the Import nav entry, the Import empty-state action and the
  // import page's own primary action (Task 14). ChartLine is the Statistics
  // nav entry and its "no history yet" empty state; Flame is the streak
  // stat's icon; PenLine is the Writing nav entry; Infinity is the Practice
  // nav entry; Settings is the Settings nav entry (phase 3). RotateCcw and
  // ChevronLeft/ChevronRight are the stroke-order player's replay and
  // previous/next stroke actions (Task 5). Trophy and Clock are the
  // Statistics Activity tab's best-streak and time-studied tiles (Task 11).
  // CircleHelp is Writing's "I don't know" action. Volume2 is the
  // play-pronunciation button on the Review and Writing cards. User, GraduationCap,
  // Palette, Bell, Database and Info are the Settings sections; LogOut is
  // Account's Sign out; Send is Reminders' test notification; SunMoon is the
  // palette's theme switch. ArrowLeft, Shield, UserX and Scale are About's
  // legal links and the legal pages' way back; ShieldCheck, Smartphone,
  // Cloud, EyeOff, Server, Type, Mail, Copy, CircleCheck and FileText are the
  // legal pages' sections and contact actions (Smartphone is also the dev
  // /install nav entry). Calendar, TrendingUp and TrendingDown are the
  // statistics Overview's tiles and insights.
  registerIcons({
    ArrowLeft,
    Bell,
    Calendar,
    ChartLine,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleHelp,
    Clock,
    Cloud,
    Copy,
    Database,
    Ellipsis,
    EyeOff,
    FileQuestion,
    FileText,
    Flame,
    GraduationCap,
    House,
    Infinity: InfinityIcon,
    Info,
    Layers,
    List,
    LogOut,
    Mail,
    Move,
    Palette,
    Pause,
    PenLine,
    Play,
    Plus,
    RefreshCw,
    RotateCcw,
    Scale,
    Search,
    Send,
    Server,
    Settings,
    Shield,
    ShieldCheck,
    Smartphone,
    SquarePen,
    SunMoon,
    Trash2,
    TrendingDown,
    TrendingUp,
    TriangleAlert,
    Trophy,
    Type,
    Undo2,
    Upload,
    User,
    UserX,
    Volume2,
    X,
  });
});
