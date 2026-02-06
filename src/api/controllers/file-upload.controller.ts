/**
 * DataHub File Upload Controller
 *
 * File uploads for DataHub import operations.
 * Supports multipart form-data and base64 uploads.
 *
 * Endpoints:
 * - POST /data-hub/upload - Upload a file
 * - GET /data-hub/files - List uploaded files
 * - GET /data-hub/files/:id - Get file metadata
 * - GET /data-hub/files/:id/download - Download file
 * - GET /data-hub/files/:id/preview - Preview file with field detection
 * - DELETE /data-hub/files/:id - Delete file
 */

import { Controller, Post, Get, Delete, Param, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import multer from 'multer';

/** Multer error type with code property */
interface MulterErrorLike extends Error {
    code?: string;
}
import {
    Ctx,
    RequestContext,
    Allow,
} from '@vendure/core';
import { FileStorageService } from '../../services';
import { FileParserService } from '../../parsers/file-parser.service';
import { ManageDataHubFilesPermission, ReadDataHubFilesPermission } from '../../permissions';
import { PAGINATION, LOGGER_CONTEXTS, FILE_STORAGE } from '../../constants/index';
import { detectFormat, isValidFileId, formatFileResponse, detectMimeType } from './file-upload.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../../services/logger';

/** Multer configuration for file uploads */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FILE_STORAGE.MAX_FILE_SIZE_BYTES,
        files: FILE_STORAGE.FILE_MAX_FILES,
    },
    fileFilter: (_req, file, cb) => {
        // Allow common data file types
        const allowedMimeTypes = [
            'text/csv',
            'text/plain',
            'application/json',
            'application/xml',
            'text/xml',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/octet-stream', // For files without specific mime type
        ];

        if (allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(csv|json|xml|xlsx|xls|txt)$/i)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: CSV, JSON, XML, XLSX, XLS, TXT`));
        }
    },
});

@Controller('data-hub')
export class DataHubFileUploadController {
    private readonly logger: DataHubLogger;

    constructor(
        private fileStorage: FileStorageService,
        private fileParser: FileParserService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.FILE_UPLOAD_CONTROLLER);
    }

    // FILE UPLOAD

    /**
     * Upload a file
     *
     * Accepts multipart/form-data with a 'file' field or
     * JSON body with base64-encoded content.
     */
    @Post('upload')
    @Allow(ManageDataHubFilesPermission.Permission)
    async uploadFile(
        @Ctx() ctx: RequestContext,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        try {
            const contentType = req.headers['content-type'] || '';

            if (contentType.includes('multipart/form-data')) {
                return this.handleMultipartUpload(ctx, req, res);
            } else if (contentType.includes('application/json')) {
                return this.handleBase64Upload(ctx, req, res);
            } else {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Unsupported content type. Use multipart/form-data or application/json',
                });
            }
        } catch (error) {
            this.logger.error('Upload failed', error instanceof Error ? error : undefined);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: error instanceof Error ? error.message : 'Upload failed',
            });
        }
    }

    // FILE LIST & METADATA

    /**
     * List uploaded files
     */
    @Get('files')
    @Allow(ReadDataHubFilesPermission.Permission)
    async listFiles(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('mimeType') mimeType?: string,
    ) {
        const result = await this.fileStorage.listFiles({
            limit: limit ? parseInt(limit, 10) : PAGINATION.LIST_PAGE_SIZE,
            offset: offset ? parseInt(offset, 10) : 0,
            filter: mimeType ? { mimeType } : undefined,
        });

        return {
            items: result.files.map(f => formatFileResponse(f)),
            totalItems: result.totalItems,
        };
    }

    /**
     * Get file metadata
     */
    @Get('files/:id')
    @Allow(ReadDataHubFilesPermission.Permission)
    async getFile(
        @Param('id') fileId: string,
        @Res() res: Response,
    ) {
        if (!isValidFileId(fileId)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: 'Invalid file ID format',
            });
        }

        const file = await this.fileStorage.getFile(fileId);

        if (!file) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File not found',
            });
        }

        return res.json({
            success: true,
            file: formatFileResponse(file),
        });
    }

    // FILE DOWNLOAD & PREVIEW

    /**
     * Download file
     */
    @Get('files/:id/download')
    @Allow(ReadDataHubFilesPermission.Permission)
    async downloadFile(
        @Param('id') fileId: string,
        @Res() res: Response,
    ) {
        if (!isValidFileId(fileId)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: 'Invalid file ID format',
            });
        }

        const file = await this.fileStorage.getFile(fileId);

        if (!file) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File not found',
            });
        }

        const content = await this.fileStorage.readFile(fileId);

        if (!content) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File content not found',
            });
        }

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Length', file.size);

        return res.send(content);
    }

    /**
     * Preview file with field detection
     */
    @Get('files/:id/preview')
    @Allow(ReadDataHubFilesPermission.Permission)
    async previewFile(
        @Param('id') fileId: string,
        @Res() res: Response,
        @Query('rows') rows?: string,
    ) {
        if (!isValidFileId(fileId)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: 'Invalid file ID format',
            });
        }

        const file = await this.fileStorage.getFile(fileId);

        if (!file) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File not found',
            });
        }

        const content = await this.fileStorage.readFileAsString(fileId);

        if (!content) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File content not found',
            });
        }

        // Detect format from mime type or extension
        const format = detectFormat(file.mimeType, file.originalName);

        try {
            // Use file parser to analyze the file
            const preview = await this.fileParser.preview(content, {
                format,
            }, rows ? parseInt(rows, 10) : PAGINATION.FILE_PREVIEW_ROWS);

            return res.json({
                success: true,
                fileId,
                originalName: file.originalName,
                format: preview.format,
                fields: preview.fields,
                sampleData: preview.sampleData,
                totalRows: preview.totalRows,
                warnings: preview.warnings,
            });
        } catch (error) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to parse file',
            });
        }
    }

    // FILE DELETE

    /**
     * Delete file
     */
    @Delete('files/:id')
    @Allow(ManageDataHubFilesPermission.Permission)
    async deleteFile(
        @Param('id') fileId: string,
        @Res() res: Response,
    ) {
        if (!isValidFileId(fileId)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: 'Invalid file ID format',
            });
        }

        const deleted = await this.fileStorage.deleteFile(fileId);

        if (!deleted) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                error: 'File not found',
            });
        }

        return res.json({
            success: true,
            message: 'File deleted',
        });
    }

    // STORAGE STATS

    /**
     * Get storage stats
     */
    @Get('storage/stats')
    @Allow(ReadDataHubFilesPermission.Permission)
    async getStorageStats() {
        return this.fileStorage.getStorageStats();
    }

    // HELPER METHODS

    /**
     * Handle multipart form-data upload using multer
     */
    private handleMultipartUpload(
        ctx: RequestContext,
        req: Request,
        res: Response,
    ): Promise<void> {
        return new Promise((resolve) => {
            const singleUpload = upload.single('file');

            // Note: multer callback has different signature than Express NextFunction
            // but TypeScript types it as RequestHandler which expects NextFunction
            const multerCallback = async (err: MulterErrorLike | null): Promise<void> => {
                try {
                    if (err) {
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
                                success: false,
                                error: `File too large. Maximum size is ${FILE_STORAGE.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
                            });
                            return resolve();
                        }
                        if (err.code === 'LIMIT_FILE_COUNT') {
                            res.status(HttpStatus.BAD_REQUEST).json({
                                success: false,
                                error: `Too many files. Maximum is ${FILE_STORAGE.FILE_MAX_FILES}`,
                            });
                            return resolve();
                        }
                        this.logger.error('Multer error', err instanceof Error ? err : undefined);
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: err.message || 'Failed to process upload',
                        });
                        return resolve();
                    }

                    const file = req.file;
                    if (!file) {
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: 'No file found in request. Ensure the file field is named "file"',
                        });
                        return resolve();
                    }

                    const result = await this.fileStorage.storeFile(
                        ctx,
                        file.buffer,
                        file.originalname,
                        file.mimetype || detectMimeType(file.originalname),
                        { expiresInMinutes: FILE_STORAGE.EXPIRY_MINUTES },
                    );

                    if (result.success && result.file) {
                        res.status(HttpStatus.CREATED).json({
                            success: true,
                            file: formatFileResponse(result.file),
                        });
                    } else {
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: result.error ?? 'Upload failed',
                        });
                    }
                    resolve();
                } catch (error) {
                    this.logger.error('Upload processing error', error instanceof Error ? error : undefined);
                    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to process upload',
                    });
                    resolve();
                }
            };

            // Cast needed: multer callback signature differs from Express NextFunction
            singleUpload(req, res, multerCallback as unknown as () => void);
        });
    }

    /**
     * Handle base64 JSON upload
     */
    private async handleBase64Upload(
        ctx: RequestContext,
        req: Request,
        res: Response,
    ): Promise<void> {
        return new Promise<void>((resolve) => {
            const chunks: Buffer[] = [];

            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const bodyStr = Buffer.concat(chunks).toString('utf-8');
                    const body = JSON.parse(bodyStr);

                    if (!body.content || !body.filename) {
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: 'Missing content or filename in request body',
                        });
                        return resolve();
                    }

                    if (typeof body.content !== 'string') {
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: 'Content must be a base64-encoded string',
                        });
                        return resolve();
                    }

                    const estimatedSize = Math.ceil(body.content.length * 0.75);
                    if (estimatedSize > FILE_STORAGE.MAX_FILE_SIZE_BYTES) {
                        res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
                            success: false,
                            error: `File too large. Maximum size is ${FILE_STORAGE.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
                        });
                        return resolve();
                    }

                    const result = await this.fileStorage.storeBase64(
                        ctx,
                        body.content,
                        body.filename,
                        body.mimeType || detectMimeType(body.filename),
                        { expiresInMinutes: body.expiresInMinutes || FILE_STORAGE.EXPIRY_MINUTES },
                    );

                    if (result.success && result.file) {
                        res.status(HttpStatus.CREATED).json({
                            success: true,
                            file: formatFileResponse(result.file),
                        });
                    } else {
                        res.status(HttpStatus.BAD_REQUEST).json({
                            success: false,
                            error: result.error ?? 'Upload failed',
                        });
                    }
                    resolve();
                } catch (error) {
                    this.logger.error('Base64 parse error', error instanceof Error ? error : undefined);
                    res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to parse JSON body',
                    });
                    resolve();
                }
            });
        });
    }

}
