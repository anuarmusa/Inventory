import { ApiError } from '../api/client';

/** What to tell the person when connecting fails. */
export function connectErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (error.reason) {
    case 'unreachable':
      return 'Can’t reach the home server. Check this phone is on the home Wi-Fi and the address is right.';
    case 'invalid_code':
      return 'That code is wrong or has expired. Get a new one from the download page.';
    case 'too_many_attempts':
      return 'Too many wrong codes. Wait a few minutes, then get a new code.';
    case 'app_too_old':
      return 'This app is too old for the home server. Install the latest app from the download page.';
    case 'server_too_old':
      return 'The home server is older than this app.';
    default:
      return error.message || 'The home server couldn’t connect this phone. Try again.';
  }
}
