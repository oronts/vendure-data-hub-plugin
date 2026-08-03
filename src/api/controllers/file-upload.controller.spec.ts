import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { PAGINATION } from '../../constants';
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
        const controller = new DataHubFileUploadController(
            fileStorage as never,
            { preview: vi.fn() } as never,
            { createLogger: () => ({ error: vi.fn() }) } as never,
        );
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
        const controller = new DataHubFileUploadController(
            fileStorage as never,
            { preview: vi.fn() } as never,
            { createLogger: () => ({ error: vi.fn() }) } as never,
        );
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
        const controller = new DataHubFileUploadController(
            fileStorage as never,
            { preview: vi.fn() } as never,
            { createLogger: () => ({ error: vi.fn() }) } as never,
        );
        const response = createResponse();

        await controller.listFiles({} as never, response as unknown as Response, '10junk');

        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: `limit must be an integer from 1 to ${PAGINATION.MAX_QUERY_LIMIT}`,
        });
        expect(fileStorage.listFiles).not.toHaveBeenCalled();
    });
});
