import { useEffect, useState } from 'react';
import { HealthResponse } from '@inventory/shared';

type ServerState = 'checking' | 'ok' | 'unreachable';

export function App({ initialState = 'checking' }: { initialState?: ServerState }) {
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
    </main>
  );
}
