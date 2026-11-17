import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { colors } from '../ui/styles';
import { downloadPhoto, localPhoto } from './phonePhotos';

/**
 * A photo by id: from this phone if it's here, otherwise downloaded from the home server the first
 * time it's viewed and cached. Away from home, a placeholder.
 */
export function Photo({ id, size = 96 }: { id: string; size?: number }) {
  const { session } = useSession();
  const [uri, setUri] = useState<string | null>(() => localPhoto(id));
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (uri || tried || !session?.server) return;
    let live = true;
    void downloadPhoto(session.server, id).then((got) => {
      if (!live) return;
      setUri(got);
      setTried(true);
    });
    return () => {
      live = false;
    };
  }, [uri, tried, session?.server, id]);

  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8 }} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.placeholder, { width: size, height: size }]}>
      <Text style={styles.text}>{tried ? 'Photo at home' : '…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: 8, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center', padding: 4 },
  text: { fontSize: 11, color: colors.mute, textAlign: 'center' },
});
