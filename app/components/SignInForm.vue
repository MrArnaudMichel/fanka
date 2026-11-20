<script setup lang="ts">
import { useAuth } from '~/composables/useAuth';

/** The magic-link sign-in, shared by Settings › Account and the onboarding. */
const emit = defineEmits<{ sent: [] }>();
const { loading, error, signIn } = useAuth();

const email = ref('');
const linkSent = ref(false);

async function onSendLink(): Promise<void> {
  linkSent.value = false;
  await signIn(email.value);
  if (error.value) return;
  linkSent.value = true;
  emit('sent');
}
</script>

<template>
  <form novalidate @submit.prevent="onSendLink">
    <kt-form heading="Sign in" description="An account syncs your decks and progress across devices. Fanka works fully offline without one.">
      <kt-label-input label="Email">
        <kt-input type="email" name="email" autocomplete="email" placeholder="you@example.com" :value="email" :error="error"
          @kt-input="(e: CustomEvent<{ value: string }>) => { email = e.detail.value; linkSent = false; }" />
      </kt-label-input>
      <kt-alert v-if="linkSent && !error" variant="success" description="Check your inbox for the sign-in link." />
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="loading || !email">Send link</kt-button>
    </kt-form>
  </form>
</template>

<style scoped>
form { display: flex; flex-direction: column; }
</style>
