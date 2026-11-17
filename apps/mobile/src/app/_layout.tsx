import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../session/SessionProvider';
import { ToastProvider } from '../ui/Toast';

export default function RootLayout() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </ToastProvider>
    </SessionProvider>
  );
}
