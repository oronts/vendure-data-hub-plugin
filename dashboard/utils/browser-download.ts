import { UI_DEFAULTS } from '../constants';

export function downloadBrowserBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    try {
        document.body.appendChild(anchor);
        anchor.click();
    } finally {
        anchor.remove();
        setTimeout(
            () => URL.revokeObjectURL(objectUrl),
            UI_DEFAULTS.OBJECT_URL_REVOKE_DELAY_MS,
        );
    }
}
