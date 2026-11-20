<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { KtSegmentedOption, KtStep } from 'kanto-ds';
import type { Bundle } from '~core/chinese/script';
import { useAuth } from '~/composables/useAuth';
import { useOnboarding } from '~/composables/useOnboarding';

definePageMeta({ layout: false });
useHead({ title: 'Welcome · Fanka' });

const { settings, remindersAvailable, suggestedBundle, enableReminder, finish } = useOnboarding();
const { user } = useAuth();

type StepId = 'welcome' | 'bundle' | 'lessons' | 'reminder' | 'account';
const ALL_STEPS: KtStep[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'bundle', label: 'Learn' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'account', label: 'Sync' },
];
// Reminders need the Android app; on the web the step is left out.
const steps = ALL_STEPS.filter((s) => remindersAvailable || s.id !== 'reminder');
const index = ref(0);
const step = computed(() => steps[index.value]!.id as StepId);
const last = computed(() => index.value === steps.length - 1);

const BUNDLES: { value: Bundle; title: string; text: string }[] = [
  { value: 'mainland', title: 'Mainland Chinese', text: 'Simplified characters, pinyin, HSK' },
  { value: 'taiwan', title: 'Taiwanese Mandarin', text: 'Traditional characters, zhuyin and pinyin, TBCL' },
];
const bundle = ref<Bundle | null>(null);
onMounted(async () => {
  const suggested = await suggestedBundle().catch(() => null);
  if (bundle.value === null) bundle.value = suggested;
});

const LESSON_OPTIONS: KtSegmentedOption[] = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));
const dailyLessons = ref<1 | 2 | 3>(settings.value.dailyLessons);

const reminderTime = ref(settings.value.reminderTimes[0] ?? '19:00');
const denied = ref(false);
const linkSent = ref(false);
const busy = ref(false);

const canContinue = computed(() => {
  if (busy.value) return false;
  if (step.value === 'bundle') return bundle.value !== null;
  if (step.value === 'account') return linkSent.value || user.value !== null;
  return true;
});
const skippable = computed(() => step.value === 'reminder' || (step.value === 'account' && !user.value));

// Each step's heading takes focus, so a screen reader hears the new step.
const heading = ref<HTMLElement | null>(null);
watch(index, () => nextTick(() => heading.value?.focus()));

async function next(): Promise<void> {
  if (!last.value) {
    index.value += 1;
    return;
  }
  busy.value = true;
  try {
    await finish({ bundle: bundle.value!, dailyLessons: dailyLessons.value });
    await navigateTo('/', { replace: true });
  } catch (err) {
    console.error('welcome: failed to save the onboarding', err);
    toaster.error("Couldn't save your choices", { description: 'Try again.' });
  } finally {
    busy.value = false;
  }
}

async function onContinue(): Promise<void> {
  if (step.value === 'reminder') {
    busy.value = true;
    try {
      denied.value = !(await enableReminder(reminderTime.value));
    } catch (err) {
      console.error('welcome: failed to save the reminder', err);
      toaster.error("Couldn't save the reminder", { description: 'Try again.' });
      return;
    } finally {
      busy.value = false;
    }
    if (denied.value) return;
  }
  await next();
}

function onLessons(event: CustomEvent<{ value: string | number }>): void {
  dailyLessons.value = Number(event.detail.value) as 1 | 2 | 3;
}

function onTime(event: CustomEvent<{ value: string | null }>): void {
  if (event.detail.value) reminderTime.value = event.detail.value;
}
</script>

<template>
  <div class="shell">
    <main class="welcome">
      <kt-steps label="Onboarding" :steps="steps" :current="step" />

      <section class="step">
        <template v-if="step === 'welcome'">
          <BrandMark size="large" />
          <h1 ref="heading" tabindex="-1">Learn Chinese, one card at a time.</h1>
        </template>

        <template v-else-if="step === 'bundle'">
          <h1 ref="heading" tabindex="-1">What do you want to learn?</h1>
          <div class="choices">
            <kt-card v-for="b in BUNDLES" :key="b.value" clickable :selected="bundle === b.value" @kt-card-click="bundle = b.value">
              <span class="choice-title">{{ b.title }}</span>
              <span class="choice-text">{{ b.text }}</span>
            </kt-card>
          </div>
        </template>

        <template v-else-if="step === 'lessons'">
          <h1 ref="heading" tabindex="-1">How many lessons a day?</h1>
          <kt-segmented-control label="Lessons a day" :options="LESSON_OPTIONS" :value="dailyLessons" @kt-change="onLessons" />
        </template>

        <template v-else-if="step === 'reminder'">
          <h1 ref="heading" tabindex="-1">Remind me</h1>
          <kt-time-input label="Time" :value="reminderTime" @kt-change="onTime" />
          <kt-alert
            v-if="denied"
            variant="warning"
            description="Notifications are blocked. Turn them on for Fanka in Android settings, under Apps, then Notifications."
          />
        </template>

        <template v-else>
          <h1 ref="heading" tabindex="-1">Sync across devices</h1>
          <kt-alert v-if="user" variant="success" :description="`Signed in as ${user.email}.`" />
          <SignInForm v-else @sent="linkSent = true" />
        </template>
      </section>

      <div class="actions">
        <kt-button v-if="index > 0" variant="secondary" size="medium" icon="arrow-left" :disabled="busy" @click="index -= 1">Back</kt-button>
        <span class="spacer" />
        <kt-button v-if="skippable" variant="secondary-no-bg" size="medium" :disabled="busy" @click="next">Not now</kt-button>
        <kt-button variant="primary" size="medium" :disabled="!canContinue" @click="onContinue">Continue</kt-button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--surface-page);
  color: var(--text-body);
  padding: var(--padding-card);
  padding-top: calc(var(--padding-card) + env(safe-area-inset-top));
  padding-bottom: calc(var(--padding-card) + env(safe-area-inset-bottom));
}
/* Kanto has no content-width token; 72ch follows the font size, as the legal layout's column does. */
.welcome { max-width: 72ch; margin: 0 auto; display: flex; flex-direction: column; gap: var(--gap-card); }
.step { display: flex; flex-direction: column; gap: var(--gap-card); }
h1 { margin: 0; font: var(--font-title-h4); color: var(--text-body); }
h1:focus { outline: none; }
.choices { display: flex; flex-direction: column; gap: var(--gap-element); }
.choice-title { display: block; font: var(--font-title-h6); color: var(--text-body); }
.choice-text { display: block; font: var(--font-normal-small); color: var(--text-muted); }
.actions { display: flex; align-items: center; gap: var(--gap-element); }
.spacer { flex: 1; }
</style>
