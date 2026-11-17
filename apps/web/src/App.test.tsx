import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Home } from './App.tsx';

describe('Home', () => {
  it('renders the home heading, server state and the way to the app', () => {
    const html = renderToString(<Home initialState="ok" />);
    expect(html).toContain('Our home');
    expect(html).toContain('ok');
    expect(html).toContain('href="/app"');
  });
});
