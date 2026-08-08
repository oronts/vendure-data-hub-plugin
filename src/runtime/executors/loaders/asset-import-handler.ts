import { Injectable } from '@nestjs/common';
import {
    ChannelService,
    RequestContext,
    AssetService,
    RequestContextService,
} from '@vendure/core';
import { createChannelCodeRequestContext } from '../../helpers/channel-request-context';
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
import { getStringValue } from '../../../loaders/shared-helpers';

interface AssetImportConfig {
    channel?: string;
    sourceUrlField?: string;
    filenameField?: string;
    nameField?: string;
    tagsField?: string;
}

function getAssetTags(record: RecordObject, field: string | undefined): string[] | undefined {
    if (!field || record[field] == null) return undefined;
    const value = record[field];
    if (!Array.isArray(value)) {
        throw new Error(`Asset tags field "${field}" must be an array of nonblank strings`);
    }
    return value.map(tag => {
        if (typeof tag !== 'string' || tag.trim() === '') {
            throw new Error(`Asset tags field "${field}" must be an array of nonblank strings`);
        }
        return tag.trim();
    });
}

@Injectable()
export class AssetImportHandler implements LoaderHandler {
    constructor(
        private assetService: AssetService,
        private requestContextService: RequestContextService,
        private channelService: ChannelService,
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
                const sourceUrlField = cfg.sourceUrlField ?? 'sourceUrl';
                const filenameField = cfg.filenameField ?? 'filename';
                const nameField = cfg.nameField ?? 'name';
                const sourceUrl = getStringValue(rec, sourceUrlField);

                if (!sourceUrl) {
                    if (onRecordError) {
                        await onRecordError(step.key, 'Missing required field: sourceUrl', rec);
                    }
                    fail++;
                    continue;
                }
                const filename = getStringValue(rec, filenameField)
                    ?? extractFilenameFromUrl(sourceUrl);
                const name = getStringValue(rec, nameField) ?? filename;
                const tags = getAssetTags(rec, cfg.tagsField);

                let opCtx = ctx;
                if (cfg.channel) {
                    opCtx = await createChannelCodeRequestContext(
                        this.requestContextService,
                        this.channelService,
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
