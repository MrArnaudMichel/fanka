import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { type Backup, type ParsedBackup, backupFileName, buildBackup, parseBackup } from '~core/backup/format';
import { type RestoreResult, applyBackup, readBackupData, resetDevice } from '~core/db/backup';
import { loadSettings } from '~core/db/settings';

/** Hands a finished file to the learner: a download in the browser, the share sheet on Android. */
async function deliver(name: string, text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Fanka backup', url: uri });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Settings › Data. Restore and reset reload the page afterwards: every
 * module-scope cache (settings, due counts, sync status) is rebuilt from the
 * database that way, with nothing to keep in step by hand.
 */
export function useBackup() {
  async function exportBackup(): Promise<void> {
    const now = Date.now();
    const backup = buildBackup(await readBackupData(), await loadSettings(), now);
    await deliver(backupFileName(now), JSON.stringify(backup));
  }

  async function readFile(file: File): Promise<ParsedBackup> {
    try {
      return parseBackup(await file.text());
    } catch {
      return { ok: false, error: "Couldn't read that file." };
    }
  }

  async function restore(backup: Backup): Promise<RestoreResult> {
    const result = await applyBackup(backup, Date.now());
    window.location.reload();
    return result;
  }

  async function reset(): Promise<void> {
    await resetDevice();
    window.location.reload();
  }

  return { exportBackup, readFile, restore, reset };
}
