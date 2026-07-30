import { fetchDataHubApi } from '../../utils/data-hub-request';
import { UI_DEFAULTS } from '../../constants';

function filenameFromDisposition(value: string | null, fallback: string): string {
    const match = value?.match(/filename="([^"]+)"/i);
    return match?.[1] || fallback;
}

export async function downloadFeedArtifact(
    downloadUrl: string,
    feedCode: string,
    getFallbackError: (status: number) => string,
): Promise<void> {
    const response = await fetchDataHubApi(downloadUrl);
    if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined);
        const message = body && typeof body === 'object' && 'error' in body
            ? Reflect.get(body, 'error')
            : undefined;
        throw new Error(
            typeof message === 'string' ? message : getFallbackError(response.status),
        );
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filenameFromDisposition(
        response.headers.get('Content-Disposition'),
        `${feedCode}-feed`,
    );
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(
        () => URL.revokeObjectURL(objectUrl),
        UI_DEFAULTS.OBJECT_URL_REVOKE_DELAY_MS,
    );
}
