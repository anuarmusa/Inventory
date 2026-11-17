import { useHousehold } from './dashboard/household.ts';
import { Footer, Layout } from './dashboard/Layout.tsx';
import { AssetsPage, PlacesPage, SuppliesPage } from './dashboard/Manage.tsx';
import { Overview } from './dashboard/Overview.tsx';
import { DownloadPage } from './download/DownloadPage.tsx';

/** Pages by path: /app is the download page; everything else is the dashboard. Every page has the footer. */
export function App({ path = window.location.pathname }: { path?: string }) {
  if (path === '/app' || path.startsWith('/app/')) {
    return (
      <>
        <DownloadPage />
        <Footer />
      </>
    );
  }
  return <Dashboard path={path} />;
}

function Dashboard({ path }: { path: string }) {
  const household = useHousehold();
  const page =
    path === '/supplies' ? (
      <SuppliesPage household={household} />
    ) : path === '/assets' ? (
      <AssetsPage household={household} />
    ) : path === '/places' ? (
      <PlacesPage household={household} />
    ) : (
      <Overview household={household} />
    );
  return <Layout path={['/supplies', '/assets', '/places'].includes(path) ? path : '/'}>{page}</Layout>;
}
