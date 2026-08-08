import { VENDURE_DASHBOARD_STORAGE_KEYS } from '../constants';
import {
    buildDataHubApiUrl,
    getConfiguredDataHubApi,
} from './api-url';

function readStoredToken(key: string): string | null {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

function storeSessionToken(token: string): void {
    try {
        globalThis.localStorage?.setItem(
            VENDURE_DASHBOARD_STORAGE_KEYS.SESSION_TOKEN,
            token,
        );
    } catch {
        return;
    }
}

function createAuthenticatedHeaders(initialHeaders?: HeadersInit): Headers {
    const apiConfig = getConfiguredDataHubApi();
    const headers = new Headers(initialHeaders);
    const channelToken = readStoredToken(VENDURE_DASHBOARD_STORAGE_KEYS.CHANNEL_TOKEN);
    if (channelToken && !headers.has(apiConfig.channelTokenKey)) {
        headers.set(apiConfig.channelTokenKey, channelToken);
    }
    if (apiConfig.tokenMethod === 'bearer' && !headers.has('Authorization')) {
        const sessionToken = readStoredToken(VENDURE_DASHBOARD_STORAGE_KEYS.SESSION_TOKEN);
        if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
}

export async function fetchDataHubApi(path: string, init: RequestInit = {}): Promise<Response> {
    const apiConfig = getConfiguredDataHubApi();
    const response = await fetch(buildDataHubApiUrl(path), {
        ...init,
        headers: createAuthenticatedHeaders(init.headers),
        credentials: 'include',
        mode: 'cors',
    });
    const refreshedSessionToken = response.headers.get(apiConfig.authTokenHeaderKey);
    if (refreshedSessionToken) storeSessionToken(refreshedSessionToken);
    return response;
}
