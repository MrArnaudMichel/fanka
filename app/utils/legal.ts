/** Facts the public legal pages (/privacy, /delete-account, /licences) state. */
export const DEVELOPER = 'Arnaud Michel';
export const CONTACT_EMAIL = 'contact@arnaudmichel.fr';
export const LAST_UPDATED = '2026-10-05';
/** Where the Supabase project stores synced data, as shown in its dashboard. */
export const DATA_REGION = 'the European Union (Frankfurt, Germany)';

/** "5 Oct 2026": the date the policies were last changed, for their badge. */
export const LAST_UPDATED_LABEL = new Date(`${LAST_UPDATED}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** The legal layout's switcher, in reading order. */
export const LEGAL_PAGES = [
  { value: '/privacy', label: 'Privacy' },
  { value: '/delete-account', label: 'Delete account' },
  { value: '/licences', label: 'Licences' },
];

/** Every third party that receives anything, for the privacy policy's table. */
export const DATA_RECIPIENTS = [
  { id: 'supabase', provider: 'Supabase', what: 'Email address, synced study data, sign-in logs', why: 'Sync, only with an account' },
  { id: 'google-fonts', provider: 'Google Fonts', what: 'IP address and browser details', why: 'Loading the Chinese fonts' },
  { id: 'vercel', provider: 'Vercel', what: 'Access logs', why: 'Serving the web version' },
];
