import { MMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';

const mmkv = Platform.OS !== 'web' ? new MMKV() : null;

const LAST_VIEWED_VERSION_KEY = 'changelog-last-viewed-version';

export function getLastViewedVersion(): number {
    if (Platform.OS === 'web') {
        const value = localStorage.getItem(LAST_VIEWED_VERSION_KEY);
        return value ? parseInt(value, 10) : 0;
    }
    return mmkv?.getNumber(LAST_VIEWED_VERSION_KEY) ?? 0;
}

export function setLastViewedVersion(version: number): void {
    if (Platform.OS === 'web') {
        localStorage.setItem(LAST_VIEWED_VERSION_KEY, version.toString());
    } else {
        mmkv?.set(LAST_VIEWED_VERSION_KEY, version);
    }
}

export function hasUnreadChangelog(latestVersion: number): boolean {
    const lastViewed = getLastViewedVersion();
    return latestVersion > lastViewed;
}