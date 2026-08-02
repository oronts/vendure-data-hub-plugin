import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@vendure/dashboard';
import { Upload, CheckCircle2, X, RefreshCw } from 'lucide-react';
import type { AdapterSchemaField } from '../../../../types';
import { getErrorMessage } from '../../../../../shared';
import { uploadDataHubFile } from '../../../../utils/file-upload';
import { buildAcceptString } from '../../../../constants/file-format-registry';
import { formatFileSize } from '../../../../utils';

export interface FileUploadFieldProps {
    field: AdapterSchemaField;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function FileUploadField({ field: _field, value, onChange, compact, disabled }: FileUploadFieldProps) {
    const { t } = useLingui();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback(async (file: File) => {
        setSelectedFile(file);
        setError(null);
        setUploading(true);

        try {
            const uploaded = await uploadDataHubFile(file, { persistent: true });
            setUploadedFileName(uploaded.originalName);
            onChange(uploaded.id);
        } catch (err) {
            setError(getErrorMessage(err));
            setSelectedFile(null);
        } finally {
            setUploading(false);
        }
    }, [onChange]);

    const handleClear = useCallback(() => {
        setSelectedFile(null);
        setUploadedFileName(null);
        setError(null);
        onChange(undefined);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [onChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && !disabled) void handleFileSelect(file);
    }, [disabled, handleFileSelect]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void handleFileSelect(file);
    }, [handleFileSelect]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const hasFile = !!value || !!uploadedFileName;
    const displayName = uploadedFileName || (value
        ? t`File ID: ${value}`
        : null);
    const padding = compact ? 'p-3' : 'p-4';

    return (
        <div className="space-y-2">
            <div
                className={`border-2 border-dashed rounded-lg ${padding} text-center transition-colors ${
                    hasFile
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-muted-foreground/25 hover:border-primary/50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                aria-label={t`Upload file`}
                aria-disabled={disabled}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={buildAcceptString()}
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={disabled}
                    aria-label={t`Upload file`}
                />

                {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                        <p className="text-sm"><Trans>Uploading...</Trans></p>
                    </div>
                ) : hasFile ? (
                    <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                        <p className="text-sm font-medium truncate max-w-full">{displayName}</p>
                        {selectedFile && (
                            <p className="text-xs text-muted-foreground">
                                {formatFileSize(selectedFile.size)}
                            </p>
                        )}
                        {!disabled && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-7 text-xs"
                                onClick={handleClear}
                            >
                                <X className="w-3 h-3 mr-1" />
                                <Trans>Remove</Trans>
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <p className="text-sm"><Trans>Drop file or click to browse</Trans></p>
                        <p className="text-xs text-muted-foreground">CSV, JSON, Excel, XML</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={disabled}
                            onClick={() => inputRef.current?.click()}
                        >
                            <Trans>Browse files</Trans>
                        </Button>
                    </div>
                )}
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
