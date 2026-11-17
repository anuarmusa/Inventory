import { ApiError } from '../api/client';
import { connectErrorMessage } from './messages';

describe('connectErrorMessage', () => {
  it('explains being away from home', () => {
    expect(connectErrorMessage(new ApiError('unreachable', ''))).toMatch(/home Wi-Fi/);
  });

  it('explains a wrong or expired code', () => {
    expect(connectErrorMessage(new ApiError('invalid_code', ''))).toMatch(/new one from the download page/);
  });

  it('falls back for anything unexpected', () => {
    expect(connectErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});
