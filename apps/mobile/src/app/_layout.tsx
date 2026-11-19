import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AlertScheduler } from '../alerts/AlertScheduler';
import { SessionProvider } from '../session/SessionProvider';
import { colors } from '../ui/styles';
import { ToastProvider } from '../ui/Toast';

export default function RootLayout() {
  return (
    <SessionProvider>
      <AlertScheduler />
      <ToastProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTintColor: colors.accent,
            headerTitleStyle: { fontWeight: '800', color: colors.ink },
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        <StatusBar style="dark" />
      </ToastProvider>
    </SessionProvider>
  );
}
