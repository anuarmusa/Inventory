import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** The next 03:00 on the server's clock (TZ, Asia/Kuala_Lumpur in production), strictly after `now`. */
export function nextBackupAt(now: Date, hour = 3): Date {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at;
}

/**
 * Runs the nightly backup at 03:00 (spec §11) from inside the app, so the server needs no cron.
 * The script is the image's ops/backup.sh; on the dev PC there is none and nothing is scheduled.
 */
export function scheduleNightlyBackup(script: string | undefined, log: (msg: string) => void, now = () => new Date()): () => void {
  if (!script || !existsSync(script)) return () => undefined;
  let timer: ReturnType<typeof setTimeout>;
  const plan = () => {
    const at = nextBackupAt(now());
    timer = setTimeout(() => {
      const child = spawn(script, ['nightly'], { stdio: 'inherit' });
      child.on('exit', (code) => log(code === 0 ? 'nightly backup done' : `nightly backup failed (exit ${code})`));
      plan();
    }, at.getTime() - now().getTime());
  };
  plan();
  return () => clearTimeout(timer);
}
