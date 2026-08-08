import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@vendure/core';
import { utils, write } from 'xlsx';
import { StepType } from '../../../constants/enums';
import { PAGINATION } from '../../../constants';
import { FileParserService } from '../../../parsers/file-parser.service';
import { FileStorageService } from '../../../services/storage/file-storage.service';
import { DataHubLoggerFactory } from '../../../services/logger';
import type { ExecutorContext } from '../../executor-types';
import { FileExtractHandler } from './file-extract.handler';

describe('FileExtractHandler', () => {
    it('rejects oversized previews before reading file content', async () => {
        const fileStorage = {
            getFile: vi.fn(async () => ({
                size: PAGINATION.FILE_PREVIEW_MAX_BYTES + 1,
            })),
            readFile: vi.fn(),
            readFileAsString: vi.fn(),
        } as unknown as FileStorageService;
        const loggerFactory = {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                warn: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory;
        const handler = new FileExtractHandler(
            fileStorage,
            loggerFactory,
            new FileParserService(),
        );

        await expect(handler.preview({
            ctx: {} as RequestContext,
            step: {
                key: 'large-preview',
                type: StepType.EXTRACT,
                config: { adapterCode: 'csv', fileId: 'file-large' },
            },
            executorCtx: {
                cpData: null,
                cpDirty: false,
                markCheckpointDirty: vi.fn(),
            },
        }, 10)).rejects.toThrow(/exceeds .* bytes/);

        expect(fileStorage.readFile).not.toHaveBeenCalled();
        expect(fileStorage.readFileAsString).not.toHaveBeenCalled();
    });

    it('parses an uploaded workbook and checkpoints its records', async () => {
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, utils.json_to_sheet([
            { sku: 'A-1', price: 12.34 },
            { sku: 'B-2', price: 9.99 },
        ]), 'Products');
        const content = Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx' }));

        const fileStorage = {
            readFile: vi.fn(async () => content),
        } as unknown as FileStorageService;
        const logger = {
            debug: vi.fn(),
            warn: vi.fn(),
        };
        const loggerFactory = {
            createLogger: vi.fn(() => logger),
        } as unknown as DataHubLoggerFactory;
        const handler = new FileExtractHandler(fileStorage, loggerFactory, new FileParserService());
        const executorCtx: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        };

        const ctx = {} as RequestContext;
        const records = await handler.extract({
            ctx,
            step: {
                key: 'workbook',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'xlsx',
                    fileId: 'file-workbook-1',
                    sheetName: 'Products',
                    hasHeader: true,
                },
            },
            executorCtx,
        });

        expect(fileStorage.readFile).toHaveBeenCalledWith(ctx, 'file-workbook-1');
        expect(records).toEqual([
            { sku: 'A-1', price: 12.34 },
            { sku: 'B-2', price: 9.99 },
        ]);
        expect(executorCtx.cpData?.workbook).toEqual({ offset: 2 });
        expect(executorCtx.markCheckpointDirty).toHaveBeenCalledOnce();
    });

    it('rejects unsupported server paths from persisted extractor config', async () => {
        const fileStorage = {
            readFile: vi.fn(),
            readFileAsString: vi.fn(),
        } as unknown as FileStorageService;
        const loggerFactory = {
            createLogger: vi.fn(() => ({
                debug: vi.fn(),
                warn: vi.fn(),
            })),
        } as unknown as DataHubLoggerFactory;
        const handler = new FileExtractHandler(fileStorage, loggerFactory, new FileParserService());
        const executorCtx: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
        };

        await expect(handler.extract({
            ctx: {} as RequestContext,
            step: {
                key: 'unsafe-path',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'csv',
                    csvPath: '/etc/passwd',
                },
            },
            executorCtx,
        })).rejects.toThrow('has no configured data source');

        expect(fileStorage.readFile).not.toHaveBeenCalled();
        expect(fileStorage.readFileAsString).not.toHaveBeenCalled();
    });

    it.each([
        {
            key: 'invalid-json',
            adapterCode: 'json',
            config: { jsonText: '{' },
            message: 'Failed to parse inline JSON',
        },
        {
            key: 'invalid-xml',
            adapterCode: 'xml',
            config: { xmlText: '<products>' },
            message: 'Failed to parse XML',
        },
    ])('rejects malformed $adapterCode content', async ({ key, adapterCode, config, message }) => {
        const loggerFactory = {
            createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
        } as unknown as DataHubLoggerFactory;
        const handler = new FileExtractHandler(
            {} as FileStorageService,
            loggerFactory,
            new FileParserService(),
        );

        await expect(handler.extract({
            ctx: {} as RequestContext,
            step: {
                key,
                type: StepType.EXTRACT,
                config: { adapterCode, ...config } as never,
            },
            executorCtx: {
                cpData: {},
                cpDirty: false,
                markCheckpointDirty: vi.fn(),
            },
        })).rejects.toThrow(message);
    });

    it('preserves an explicitly configured empty CSV source', async () => {
        const handler = new FileExtractHandler(
            {} as FileStorageService,
            {
                createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
            } as unknown as DataHubLoggerFactory,
            new FileParserService(),
        );

        await expect(handler.extract({
            ctx: {} as RequestContext,
            step: {
                key: 'empty-csv',
                type: StepType.EXTRACT,
                config: { adapterCode: 'csv', csvText: '' },
            },
            executorCtx: {
                cpData: {},
                cpDirty: false,
                markCheckpointDirty: vi.fn(),
            },
        })).resolves.toEqual([]);
    });

    it('rejects a configured upload that cannot be read', async () => {
        const handler = new FileExtractHandler(
            {
                readFileAsString: vi.fn(async () => null),
            } as unknown as FileStorageService,
            {
                createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
            } as unknown as DataHubLoggerFactory,
            new FileParserService(),
        );

        await expect(handler.extract({
            ctx: {} as RequestContext,
            step: {
                key: 'missing-upload',
                type: StepType.EXTRACT,
                config: { adapterCode: 'csv', fileId: 'missing' },
            },
            executorCtx: {
                cpData: {},
                cpDirty: false,
                markCheckpointDirty: vi.fn(),
            },
        })).rejects.toThrow('Uploaded CSV file not found');
    });
    it('advances checkpoints only for records returned by a bounded extraction', async () => {
        const handler = new FileExtractHandler(
            {} as FileStorageService,
            {
                createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
            } as unknown as DataHubLoggerFactory,
            new FileParserService(),
        );
        const executorCtx: ExecutorContext = {
            cpData: {},
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
            recordLimit: 1,
        };
        const context = {
            ctx: {} as RequestContext,
            step: {
                key: 'bounded-csv',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'csv',
                    rows: [
                        ['sku'],
                        ['SKU-1'],
                        ['SKU-2'],
                    ],
                },
            },
            executorCtx,
        };

        await expect(handler.extract(context)).resolves.toEqual([{ sku: 'SKU-1' }]);
        expect(executorCtx.cpData?.['bounded-csv']).toEqual({ offset: 1 });
        await expect(handler.extract(context)).resolves.toEqual([{ sku: 'SKU-2' }]);
        expect(executorCtx.cpData?.['bounded-csv']).toEqual({ offset: 2 });
    });

    it('reads beyond the saved XLSX offset for bounded resumed extraction', async () => {
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, utils.json_to_sheet([
            { sku: 'SKU-1' },
            { sku: 'SKU-2' },
            { sku: 'SKU-3' },
        ]), 'Products');
        const content = Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx' }));
        const handler = new FileExtractHandler(
            { readFile: vi.fn(async () => content) } as unknown as FileStorageService,
            {
                createLogger: vi.fn(() => ({ debug: vi.fn(), warn: vi.fn() })),
            } as unknown as DataHubLoggerFactory,
            new FileParserService(),
        );
        const executorCtx: ExecutorContext = {
            cpData: { workbook: { offset: 1 } },
            cpDirty: false,
            markCheckpointDirty: vi.fn(),
            recordLimit: 1,
        };

        await expect(handler.extract({
            ctx: {} as RequestContext,
            step: {
                key: 'workbook',
                type: StepType.EXTRACT,
                config: {
                    adapterCode: 'xlsx',
                    fileId: 'workbook-file',
                    sheetName: 'Products',
                },
            },
            executorCtx,
        })).resolves.toEqual([{ sku: 'SKU-2' }]);
        expect(executorCtx.cpData?.workbook).toEqual({ offset: 2 });
    });
});
