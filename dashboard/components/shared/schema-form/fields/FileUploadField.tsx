import * as React from 'react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@vendure/dashboard';
import { Upload, CheckCircle2, X, RefreshCw } from 'lucide-react';
import type { AdapterSchemaField } from '../../../../types';
import { DATAHUB_API_UPLOAD } from '../../../../constants';
import { formatFileSize } from '../../../../utils';

export interface FileUploadFieldProps {
    field: AdapterSchemaField;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    compact?: boolean;
    disabled?: boolean;
}

export function FileUploadField({ field, value, onChange, compact, disabled }: FileUploadFieldProps) {
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
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch(DATAHUB_API_UPLOAD, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload failed: ${uploadResponse.status}`);
            }

            const uploadResult = await uploadResponse.json();

            if (!uploadResult.success || !uploadResult.file) {
                throw new Error(uploadResult.error || 'Upload failed');
            }

            const fileId = uploadResult.file.id;
            setUploadedFileName(uploadResult.file.originalName || file.name);
            onChange(fileId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
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
        if (file && !disabled) handleFileSelect(file);
    }, [disabled, handleFileSelect]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    }, [handleFileSelect]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const hasFile = !!value || !!uploadedFileName;
    const displayName = uploadedFileName || (value ? `File ID: ${value}` : null);
    const padding = compact ? 'p-3' : 'p-4';

    const handleDropzoneClick = useCallback(() => {
        if (!value && !uploadedFileName && !disabled) inputRef.current?.click();
    }, [disabled, value, uploadedFileName]);

    const handleDropzoneKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!value && !uploadedFileName && !disabled) inputRef.current?.click();
        }
    }, [disabled, value, uploadedFileName]);

    const handleRemoveClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleClear();
    }, [handleClear]);

    return (
        <div className="space-y-2">
            <div
                className={`border-2 border-dashed rounded-lg ${padding} text-center transition-colors ${
                    hasFile
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                        : 'border-muted-foreground/25 hover:border-primary/50 cursor-pointer'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleDropzoneClick}
                onKeyDown={handleDropzoneKeyDown}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label="Upload file"
                aria-disabled={disabled}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.json,.xlsx,.xls,.xml"
                    onChange={handleInputChange}
                    className="hidden"
                    disabled={disabled}
                />

                {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                        <p className="text-sm">Uploading...</p>
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
                                onClick={handleRemoveClick}
                            >
                                <X className="w-3 h-3 mr-1" />
                                Remove
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <p className="text-sm">Drop file or click to browse</p>
                        <p className="text-xs text-muted-foreground">CSV, JSON, Excel, XML</p>
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
