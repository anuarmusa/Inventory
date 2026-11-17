import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.tsx';

describe('App', () => {
  it('renders the home heading and server state', () => {
    const html = renderToString(<App initialState="ok" />);
    expect(html).toContain('Our home');
    expect(html).toContain('ok');
  });
});
