import { fetchDataHubApi } from '../../utils/data-hub-request';
import { downloadBrowserBlob } from '../../utils/browser-download';

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
    downloadBrowserBlob(
        blob,
        filenameFromDisposition(
            response.headers.get('Content-Disposition'),
            `${feedCode}-feed`,
        ),
    );
}
