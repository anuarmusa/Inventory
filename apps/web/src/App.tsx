import { useEffect, useState } from 'react';
import { HealthResponse } from '@inventory/shared';
import { DownloadPage } from './download/DownloadPage.tsx';

type ServerState = 'checking' | 'ok' | 'unreachable';

/** Pages by path: /app is the download page; the dashboard lives at / (built in its own slice). */
export function App({ path = window.location.pathname }: { path?: string }) {
  if (path === '/app' || path.startsWith('/app/')) return <DownloadPage />;
  return <Home />;
}

export function Home({ initialState = 'checking' }: { initialState?: ServerState }) {
  const [server, setServer] = useState<ServerState>(initialState);

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((body) => setServer(HealthResponse.safeParse(body).success ? 'ok' : 'unreachable'))
      .catch(() => setServer('unreachable'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Our home</h1>
      <p>Server: {server}</p>
      <p>
        <a href="/app">Get the app</a>
      </p>
    </main>
  );
}
