import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './src/db/client';
import migrations from './drizzle/migrations';
import { describeSetup } from './src/setup';

export default function App() {
  const { success, error } = useMigrations(db, migrations);
  const lines = describeSetup({ migrated: success, error: error?.message });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Our home</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  line: { color: '#555', marginTop: 4, textAlign: 'center' },
});
