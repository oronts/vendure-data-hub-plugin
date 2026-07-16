import { RequestContext } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';
import { SecretService } from '../../services/config/secret.service';
import { deliverToLocal } from '../../services/destinations/local.handler';
import type { ExportDestinationService } from '../../services/destinations/export-destination.service';
import type { DataHubLogger } from '../../services/logger';
import { writeExportFile } from './exporters/export-helpers';
import { writeFeedFile } from './feeds/feed-handler.types';

describe('server-local write boundaries', () => {
    it('rejects absolute LOCAL destination directories', async () => {
        await expect(deliverToLocal({
            id: 'local',
            name: 'Local',
            type: 'LOCAL',
            directory: '/etc',
        }, Buffer.from('blocked'), 'passwd')).rejects.toThrow('must be relative');
    });

    it('rejects absolute feed output paths', async () => {
        await expect(writeFeedFile({
            adapterCode: 'customFeed',
            outputPath: '/etc/passwd',
        }, 'custom-feed', 'json', 'blocked')).rejects.toThrow('must be relative');
    });

    it('reports exporter traversal as a record failure without writing', async () => {
        const onRecordError = vi.fn();
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as DataHubLogger;

        const result = await writeExportFile({
            ctx: {} as RequestContext,
            stepKey: 'csv-export',
            config: {
                path: '../outside',
                filenamePattern: 'products.csv',
            },
            records: [{ sku: 'SKU-1' }],
            onRecordError,
            secretService: {} as SecretService,
            logger,
        }, 'export.csv', () => 'sku\nSKU-1', 'CSV');

        expect(result).toEqual({ ok: 0, fail: 1 });
        expect(onRecordError).toHaveBeenCalledWith(
            'csv-export',
            expect.stringContaining('directory traversal'),
            expect.objectContaining({ format: 'CSV' }),
        );
    });

    it.each([
        {
            destinationType: 'LOCAL',
            directory: 'catalog',
            expectedType: 'LOCAL',
        },
        {
            destinationType: 'HTTP',
            url: 'https://partner.example.com/import',
            expectedType: 'HTTP',
        },
    ] as const)('dispatches formatted content through $expectedType destination delivery', async destination => {
        const deliverConfigured = vi.fn(async () => ({
            success: true,
            destinationId: 'pipeline:csv-export',
            destinationType: destination.expectedType,
            filename: 'products.csv',
            size: 9,
            location: destination.expectedType,
        }));
        const exportDestinationService = {
            deliverConfigured,
        } as unknown as ExportDestinationService;
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as DataHubLogger;

        const config: Record<string, string> = {
            destinationType: destination.destinationType,
            filenamePattern: 'products.csv',
        };
        if (destination.destinationType === 'LOCAL') {
            config.directory = destination.directory;
        } else {
            config.url = destination.url;
        }
        const result = await writeExportFile({
            ctx: {} as RequestContext,
            stepKey: 'csv-export',
            config,
            records: [{ sku: 'SKU-1' }],
            secretService: {} as SecretService,
            exportDestinationService,
            logger,
        }, 'export.csv', () => 'sku\nSKU-1', 'CSV');

        expect(result).toEqual({ ok: 1, fail: 0 });
        expect(deliverConfigured).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ type: destination.expectedType }),
            'sku\nSKU-1',
            'products.csv',
            expect.objectContaining({ mimeType: 'text/csv' }),
        );
    });
});
