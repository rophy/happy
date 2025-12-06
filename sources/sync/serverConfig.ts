import { MMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';

// Separate MMKV instance for server config that persists across logouts (native only)
const serverConfigStorage = Platform.OS !== 'web' ? new MMKV({ id: 'server-config' }) : null;

const SERVER_KEY = 'custom-server-url';
const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com';

export function getServerUrl(): string {
    let customUrl: string | null = null;
    if (Platform.OS === 'web') {
        customUrl = localStorage.getItem(SERVER_KEY);
    } else {
        customUrl = serverConfigStorage?.getString(SERVER_KEY) ?? null;
    }
    return customUrl || process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        if (Platform.OS === 'web') {
            localStorage.setItem(SERVER_KEY, url.trim());
        } else {
            serverConfigStorage?.set(SERVER_KEY, url.trim());
        }
    } else {
        if (Platform.OS === 'web') {
            localStorage.removeItem(SERVER_KEY);
        } else {
            serverConfigStorage?.delete(SERVER_KEY);
        }
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}