import { shortVersion, updateBanner } from './updates';

const app = { latest: '1.4.0', minimum: '1.0.0', notes: 'Undo after saving.' };

describe('the update banner', () => {
  it('offers a newer version with what’s new, until dismissed', () => {
    expect(updateBanner('1.3.2', app)).toEqual({ kind: 'available', version: '1.4.0', notes: 'Undo after saving.' });
    expect(updateBanner('1.3.2', app, { dismissed: '1.4.0' })).toEqual({ kind: 'none' });
    // Dismissing one version doesn't hide the next.
    expect(updateBanner('1.3.2', { ...app, latest: '1.5.0' }, { dismissed: '1.4.0' }).kind).toBe('available');
  });

  it('says nothing when up to date, or before the server has answered', () => {
    expect(updateBanner('1.4.0', app)).toEqual({ kind: 'none' });
    expect(updateBanner('1.4.0', null)).toEqual({ kind: 'none' });
  });

  it('turns red below the minimum, or when a push was refused as too old, and can’t be dismissed', () => {
    expect(updateBanner('0.9.0', app, { dismissed: '1.4.0' })).toEqual({ kind: 'required', version: '1.4.0' });
    expect(updateBanner('1.3.2', null, { refusedAsTooOld: true })).toEqual({ kind: 'required', version: null });
  });

  it('shows versions shortly', () => {
    expect(shortVersion('1.4.0')).toBe('v1.4');
    expect(shortVersion('1.4.2')).toBe('v1.4.2');
  });
});
