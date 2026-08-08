import { uiConfig } from 'virtual:vendure-ui-config';

export interface ConfiguredDataHubApi {
    channelTokenKey: string;
    tokenMethod: string;
    authTokenHeaderKey: string;
}

export function getConfiguredDataHubApi(): ConfiguredDataHubApi {
    return {
        channelTokenKey: uiConfig.api.channelTokenKey,
        tokenMethod: uiConfig.api.tokenMethod,
        authTokenHeaderKey: uiConfig.api.authTokenHeaderKey,
    };
}

export function getConfiguredApiBaseUrl(): string {
    const configuredHost = uiConfig.api.host === 'auto'
        ? `${globalThis.location.protocol}//${globalThis.location.hostname}`
        : uiConfig.api.host;
    const locationPort = globalThis.location.port
        ? `:${globalThis.location.port}`
        : '';
    const configuredPort = uiConfig.api.port === 'auto'
        ? locationPort
        : `:${uiConfig.api.port}`;
    return `${configuredHost}${configuredPort}`;
}

export function buildDataHubApiUrl(path: string): string {
    return new URL(path, `${getConfiguredApiBaseUrl()}/`).toString();
}
