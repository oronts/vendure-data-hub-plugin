import { Injectable } from '@nestjs/common';
import {
    RequestContext,
    AssetService,
    RequestContextService,
} from '@vendure/core';
import { createChannelRequestContext } from '../../helpers/channel-request-context';
import { JsonObject, PipelineStepDefinition, ErrorHandlingConfig } from '../../../types/index';
import { RecordObject, OnRecordErrorCallback, LoaderExecutionResult } from '../../executor-types';
import { LoaderHandler } from './types';
import { getErrorMessage, getErrorStack } from '../../../utils/error.utils';
import { downloadAsset } from '../../../utils/asset-download.utils';
import {
    createReadStreamFromBuffer,
    extractFilenameFromUrl,
    getAssetMimeType,
} from '../../../utils/asset-file.utils';
import { sanitizeUrlForLogging } from '../../../utils/url-sanitize.utils';

interface AssetImportConfig {
    channel?: string;
    sourceUrlField?: string;
    filenameField?: string;
    nameField?: string;
    tagsField?: string;
}

interface AssetRecord {
    [key: string]: unknown;
}

@Injectable()
export class AssetImportHandler implements LoaderHandler {
    constructor(
        private assetService: AssetService,
        private requestContextService: RequestContextService,
    ) {}

    async execute(
        ctx: RequestContext,
        step: PipelineStepDefinition,
        input: RecordObject[],
        onRecordError?: OnRecordErrorCallback,
        _errorHandling?: ErrorHandlingConfig,
    ): Promise<LoaderExecutionResult> {
        let ok = 0, fail = 0;
        const cfg = (step.config ?? {}) as AssetImportConfig;

        for (const rec of input) {
            try {
                const record = rec as AssetRecord;
                const sourceUrlField = cfg.sourceUrlField ?? 'sourceUrl';
                const filenameField = cfg.filenameField ?? 'filename';
                const nameField = cfg.nameField ?? 'name';
                const sourceUrl = String(record[sourceUrlField] ?? '');
                const filename = String(record[filenameField] ?? extractFilenameFromUrl(sourceUrl));
                const name = String(record[nameField] ?? filename);

                if (!sourceUrl) { fail++; continue; }

                let opCtx = ctx;
                if (cfg.channel) {
                    opCtx = await createChannelRequestContext(
                        this.requestContextService,
                        ctx,
                        cfg.channel,
                    );
                }

                const existing = await this.findByName(opCtx, name);
                if (existing) {
                    ok++;
                    continue;
                }

                const fileData = await downloadAsset(sourceUrl, 'Asset import download');
                if (!fileData) {
                    if (onRecordError) {
                        await onRecordError(
                            step.key,
                            `Failed to download: ${sanitizeUrlForLogging(sourceUrl)}`,
                            rec as JsonObject,
                        );
                    }
                    fail++;
                    continue;
                }

                const mimeType = getAssetMimeType(sourceUrl);
                const file = {
                    filename,
                    mimetype: mimeType,
                    createReadStream: () => createReadStreamFromBuffer(fileData),
                };

                const tags = cfg.tagsField && Array.isArray(record[cfg.tagsField])
                    ? record[cfg.tagsField] as string[]
                    : undefined;

                const result = await this.assetService.create(opCtx, { file, tags });

                if ('errorCode' in result) {
                    if (onRecordError) await onRecordError(step.key, `Asset creation failed: ${result.message}`, rec as JsonObject);
                    fail++;
                    continue;
                }

                ok++;
            } catch (e: unknown) {
                if (onRecordError) await onRecordError(step.key, getErrorMessage(e) || 'assetImport failed', rec as JsonObject, getErrorStack(e));
                fail++;
            }
        }
        return { ok, fail, skipped: 0 };
    }

    private async findByName(ctx: RequestContext, name: string) {
        const result = await this.assetService.findAll(ctx, {
            filter: { name: { eq: name } },
            take: 1,
        });
        return result.items[0] ?? null;
    }
}
