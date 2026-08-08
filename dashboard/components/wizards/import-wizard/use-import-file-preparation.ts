import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { toast } from 'sonner';
import type { ParsedData } from '../../../types';
import {
    FILE_FORMAT,
    FILE_FORMAT_REGISTRY,
    UI_LIMITS,
} from '../../../constants';
import type { FileParseOptions } from '../../../constants/file-format-registry';
import { detectFileFormat } from '../../../constants/file-format-registry';
import { uploadDataHubFile } from '../../../utils/file-upload';
import type { ImportConfiguration } from './types';
import { mergeFileSourceConfig } from './source-config';
import {
    getFileParseErrorMessage,
    getFileUploadErrorMessage,
} from './file-error-messages';

type ImportConfigSetter = React.Dispatch<React.SetStateAction<Partial<ImportConfiguration>>>;

interface UseImportFilePreparationOptions {
    source: Partial<ImportConfiguration>['source'];
    setConfig: ImportConfigSetter;
    uploadedFile: File | null;
    setUploadedFile: React.Dispatch<React.SetStateAction<File | null>>;
}

export function useImportFilePreparation({
    source,
    setConfig,
    uploadedFile,
    setUploadedFile,
}: UseImportFilePreparationOptions) {
    const { t } = useLingui();
    const [parsedData, setParsedData] = React.useState<ParsedData | null>(null);
    const [isParsing, setIsParsing] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const fileFormatRef = React.useRef(source?.fileConfig?.format ?? FILE_FORMAT.CSV);
    const delimiterRef = React.useRef(source?.fileConfig?.delimiter ?? ',');
    const hasHeadersRef = React.useRef(source?.fileConfig?.hasHeaders ?? true);

    React.useEffect(() => {
        fileFormatRef.current = source?.fileConfig?.format ?? FILE_FORMAT.CSV;
        delimiterRef.current = source?.fileConfig?.delimiter ?? ',';
        hasHeadersRef.current = source?.fileConfig?.hasHeaders ?? true;
    }, [
        source?.fileConfig?.delimiter,
        source?.fileConfig?.format,
        source?.fileConfig?.hasHeaders,
    ]);

    const parseFile = React.useCallback(async (file: File) => {
        setIsParsing(true);
        try {
            const entry = FILE_FORMAT_REGISTRY.get(fileFormatRef.current);
            if (!entry?.parse) return null;

            const options: FileParseOptions = {
                delimiter: delimiterRef.current,
                hasHeaders: hasHeadersRef.current,
                maxRows: UI_LIMITS.MAX_PREVIEW_ROWS,
            };
            return await entry.parse(file, options);
        } finally {
            setIsParsing(false);
        }
    }, []);

    React.useEffect(() => {
        if (!uploadedFile) return;

        let cancelled = false;
        const prepareFile = async () => {
            const detectedFormat = detectFileFormat(uploadedFile.name) ?? undefined;
            if (detectedFormat && detectedFormat !== fileFormatRef.current) {
                fileFormatRef.current = detectedFormat;
                setConfig(previous => ({
                    ...previous,
                    source: mergeFileSourceConfig(previous.source, {
                        format: detectedFormat,
                    }),
                }));
            }

            let nextParsedData: ParsedData | null;
            try {
                nextParsedData = await parseFile(uploadedFile);
            } catch (error) {
                if (!cancelled) {
                    toast.error(t`Failed to parse file`, {
                        description: getFileParseErrorMessage(error, {
                            invalidJson: t`The selected file is not valid JSON.`,
                            emptyExcelWorkbook: t`The selected Excel workbook contains no sheets.`,
                        }),
                    });
                    setUploadedFile(null);
                    setParsedData(null);
                }
                return;
            }

            if (cancelled) return;
            setParsedData(nextParsedData);
            if (nextParsedData) {
                toast.success(t`Parsed ${nextParsedData.rows.length} records`);
            }

            setIsUploading(true);
            try {
                const storedFile = await uploadDataHubFile(uploadedFile, {
                    persistent: true,
                });
                if (cancelled) return;
                setConfig(previous => ({
                    ...previous,
                    source: mergeFileSourceConfig(previous.source, {
                        fileId: storedFile.id,
                    }),
                }));
            } catch (error) {
                if (!cancelled) {
                    toast.error(t`Failed to upload file`, {
                        description: getFileUploadErrorMessage(error, {
                            missingFileId: t`The upload response did not include a file ID.`,
                            httpError: status => t`Upload failed with status ${status}.`,
                        }),
                    });
                    setUploadedFile(null);
                    setParsedData(null);
                }
            } finally {
                if (!cancelled) setIsUploading(false);
            }
        };

        void prepareFile();
        return () => {
            cancelled = true;
        };
    }, [parseFile, setConfig, setUploadedFile, t, uploadedFile]);

    const handleUploadedFileChange = React.useCallback((file: File | null) => {
        setUploadedFile(file);
        setConfig(previous => ({
            ...previous,
            source: mergeFileSourceConfig(previous.source, { fileId: undefined }),
        }));
        if (!file) setParsedData(null);
    }, [setConfig, setUploadedFile]);

    return {
        uploadedFile,
        parsedData,
        isParsing,
        isUploading,
        setUploadedFile: handleUploadedFileChange,
    };
}
