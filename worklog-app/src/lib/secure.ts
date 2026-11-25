import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// 토큰은 기기 보안 저장소(iOS 키체인 / Android Keystore)에만 둔다.
// 웹 미리보기에는 안전한 저장소가 없으므로 메모리에만 두고 새로고침하면 사라진다.
const KEY = 'worklog.github.token';
let webMemory: string | null = null;

export const tokenPersists = Platform.OS !== 'web';

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webMemory;
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory = token;
    return;
  }
  await SecureStore.setItemAsync(KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory = null;
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
