import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { pairingLink, parsePairingLink } from '@inventory/shared';
import { useSession } from '../session/SessionProvider';
import { ui } from '../ui/styles';

/** Opened by the "Connect this phone" link: inventory://pair?server=…&code=… */
export default function Pair() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ server?: string; code?: string }>();
  const target = parsePairingLink(pairingLink({ server: params.server ?? '', code: params.code ?? '' }));

  if (session?.status === 'ready') return <Redirect href="/" />;
  if (target) return <Redirect href={{ pathname: '/connect/name', params: { server: target.server, code: target.code } }} />;

  return (
    <View style={ui.centered}>
      <Text style={ui.body}>That link isn’t a working pairing link. Get a new one from the download page.</Text>
      <Link href="/connect" style={[ui.secondary, ui.secondaryText, { alignSelf: 'stretch', textAlign: 'center' }]}>
        Connect another way
      </Link>
    </View>
  );
}
