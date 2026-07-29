import { DATAHUB_API_UPLOAD } from '../constants';
import { fetchDataHubApi } from './data-hub-request';
import { FileUploadError } from './file-upload-error';
export { FileUploadError } from './file-upload-error';

interface UploadResponseBody {
    success?: boolean;
    error?: string;
    file?: {
        id?: unknown;
        originalName?: unknown;
    };
}

export interface UploadedDataHubFile {
    id: string;
    originalName: string;
}

async function readUploadResponse(response: Response): Promise<UploadResponseBody> {
    const body: unknown = await response.json().catch(() => undefined);
    return body && typeof body === 'object' ? body as UploadResponseBody : {};
}

export async function uploadDataHubFile(
    file: File,
    options: { persistent?: boolean } = {},
): Promise<UploadedDataHubFile> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.persistent) {
        formData.append('persistent', 'true');
    }
    const response = await fetchDataHubApi(
        DATAHUB_API_UPLOAD,
        {
            method: 'POST',
            body: formData,
        },
    );
    const body = await readUploadResponse(response);

    if (!response.ok || body.success !== true || !body.file) {
        if (body.error) {
            throw new Error(body.error);
        }
        throw new FileUploadError('HTTP_ERROR', response.status);
    }
    if (typeof body.file.id !== 'string' || body.file.id.length === 0) {
        throw new FileUploadError('MISSING_FILE_ID');
    }

    return {
        id: body.file.id,
        originalName: typeof body.file.originalName === 'string'
            ? body.file.originalName
            : file.name,
    };
}
