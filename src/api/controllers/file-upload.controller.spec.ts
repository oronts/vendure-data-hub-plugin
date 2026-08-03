import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_TYPES, FILE_STORAGE, HTTP_HEADERS, PAGINATION } from '../../constants';
import { DataHubFileUploadController } from './file-upload.controller';

function createResponse() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

function createController(fileStorage: Record<string, unknown>) {
    return new DataHubFileUploadController(
        fileStorage as never,
        { preview: vi.fn() } as never,
        { createLogger: () => ({ error: vi.fn() }) } as never,
    );
}

describe('DataHubFileUploadController input bounds', () => {
    it('rejects oversized files before reading their content', async () => {
        const fileStorage = {
            getFile: vi.fn().mockResolvedValue({
                id: 'file_preview_0123456789abcdef',
                originalName: 'large.json',
                mimeType: 'application/json',
                size: PAGINATION.FILE_PREVIEW_MAX_BYTES + 1,
            }),
            readFile: vi.fn(),
        };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.previewFile(
            {} as never,
            'file_preview_0123456789abcdef',
            response as unknown as Response,
        );

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: `File preview source exceeds ${PAGINATION.FILE_PREVIEW_MAX_BYTES} bytes`,
        });
        expect(fileStorage.readFile).not.toHaveBeenCalled();
    });

    it('rejects malformed preview row counts before storage access', async () => {
        const fileStorage = { getFile: vi.fn() };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.previewFile(
            {} as never,
            'file_preview_0123456789abcdef',
            response as unknown as Response,
            '10junk',
        );

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: `rows must be an integer from 1 to ${PAGINATION.MAX_QUERY_LIMIT}`,
        });
        expect(fileStorage.getFile).not.toHaveBeenCalled();
    });

    it('rejects malformed list pagination before storage access', async () => {
        const fileStorage = { listFiles: vi.fn() };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.listFiles({} as never, response as unknown as Response, '10junk');

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: `limit must be an integer from 1 to ${PAGINATION.MAX_QUERY_LIMIT}`,
        });
        expect(fileStorage.listFiles).not.toHaveBeenCalled();
    });

    it('rejects parsed JSON arrays immediately instead of rereading the ended stream', async () => {
        const fileStorage = { storeBase64: vi.fn() };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.uploadFile(
            {} as never,
            {
                headers: { 'content-type': CONTENT_TYPES.JSON },
                body: [],
            } as never,
            response as unknown as Response,
        );

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: 'JSON upload body must be an object',
        });
        expect(fileStorage.storeBase64).not.toHaveBeenCalled();
    });

    it('rejects non-string JSON MIME types before storage access', async () => {
        const fileStorage = { storeBase64: vi.fn() };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.uploadFile(
            {} as never,
            {
                headers: { 'content-type': `${CONTENT_TYPES.JSON}; charset=utf-8` },
                body: {
                    filename: 'products.csv',
                    content: 'c2t1',
                    mimeType: 42,
                },
            } as never,
            response as unknown as Response,
        );

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: 'mimeType must be a string',
        });
        expect(fileStorage.storeBase64).not.toHaveBeenCalled();
    });

    it('accepts an empty base64 payload as an empty managed file', async () => {
        const storedFile = {
            id: 'file_empty_0123456789abcdef',
            originalName: 'empty.csv',
            mimeType: CONTENT_TYPES.CSV,
            size: 0,
            hash: '0'.repeat(64),
            uploadedAt: new Date('2026-08-03T00:00:00.000Z'),
        };
        const fileStorage = {
            storeBase64: vi.fn().mockResolvedValue({
                success: true,
                file: storedFile,
            }),
        };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.uploadFile(
            {} as never,
            {
                headers: { 'content-type': CONTENT_TYPES.JSON },
                body: { filename: storedFile.originalName, content: '' },
            } as never,
            response as unknown as Response,
        );

        expect(fileStorage.storeBase64).toHaveBeenCalledWith(
            expect.anything(),
            '',
            storedFile.originalName,
            CONTENT_TYPES.CSV,
            { expiresInMinutes: FILE_STORAGE.EXPIRY_MINUTES },
        );
        expect(response.status).toHaveBeenCalledWith(201);
    });

    it('does not accept media types that merely contain application/json', async () => {
        const fileStorage = { storeBase64: vi.fn() };
        const controller = createController(fileStorage);
        const response = createResponse();

        await controller.uploadFile(
            {} as never,
            {
                headers: { 'content-type': 'text/application/json-example' },
                body: { filename: 'products.csv', content: 'c2t1' },
            } as never,
            response as unknown as Response,
        );

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: 'Unsupported content type. Use multipart/form-data or application/json',
        });
        expect(fileStorage.storeBase64).not.toHaveBeenCalled();
    });

    it('uses the framework attachment encoder for non-ASCII filenames', async () => {
        const content = Buffer.from('sku\nA-1');
        const fileStorage = {
            getFile: vi.fn().mockResolvedValue({
                id: 'file_download_0123456789abcdef',
                originalName: 'produits-é.csv',
                mimeType: CONTENT_TYPES.CSV,
                size: content.length,
            }),
            readFile: vi.fn().mockResolvedValue(content),
        };
        const controller = createController(fileStorage);
        const response = {
            attachment: vi.fn(),
            setHeader: vi.fn(),
            send: vi.fn(),
        };
        response.send.mockReturnValue(response);

        await controller.downloadFile(
            {} as never,
            'file_download_0123456789abcdef',
            response as unknown as Response,
        );

        expect(response.attachment).toHaveBeenCalledWith('produits-é.csv');
        expect(response.setHeader).toHaveBeenCalledWith(HTTP_HEADERS.CONTENT_TYPE, CONTENT_TYPES.CSV);
        expect(response.setHeader).toHaveBeenCalledWith('Content-Length', content.length);
        expect(response.send).toHaveBeenCalledWith(content);
    });
});
