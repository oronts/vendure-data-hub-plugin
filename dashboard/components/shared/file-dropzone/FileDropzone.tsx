import * as React from 'react';
import { useCallback, memo } from 'react';
import { Button } from '@vendure/dashboard';
import { Upload, RefreshCw, CheckCircle2, X } from 'lucide-react';
import type { FileType, FileDropzoneProps } from '../../../types';
import { formatFileSize } from '../../../utils';
import { FILE_TYPE_ICON_CONFIG, DROPZONE_DIMENSIONS, ICON_SIZES } from '../../../constants';
import { FILE_FORMAT } from '../../../constants/wizard-options';

function getAcceptString(allowedTypes?: FileType[]): string {
    if (!allowedTypes) return '*';
    const types: string[] = [];
    if (allowedTypes.includes(FILE_FORMAT.CSV)) types.push('.csv');
    if (allowedTypes.includes(FILE_FORMAT.XLSX)) types.push('.xlsx', '.xls');
    if (allowedTypes.includes(FILE_FORMAT.JSON)) types.push('.json');
    if (allowedTypes.includes(FILE_FORMAT.XML)) types.push('.xml');
    return types.join(',');
}

function FileDropzoneComponent({
    onFileSelect,
    allowedTypes,
    accept,
    loading = false,
    loadingMessage = 'Parsing file...',
    selectedFile,
    onClear,
    showFileIcons = true,
    compact = false,
    className = '',
}: FileDropzoneProps) {
    const [dragOver, setDragOver] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
    }, [onFileSelect]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
    }, [onFileSelect]);

    const handleClick = useCallback(() => {
        if (!selectedFile) {
            inputRef.current?.click();
        }
    }, [selectedFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDragOver(false);
    }, []);

    const handleClearClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClear?.();
    }, [onClear]);

    const handleBrowseClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        inputRef.current?.click();
    }, []);

    const acceptString = accept || getAcceptString(allowedTypes);
    const padding = compact ? DROPZONE_DIMENSIONS.PADDING_COMPACT : DROPZONE_DIMENSIONS.PADDING_DEFAULT;
    const iconSize = compact ? DROPZONE_DIMENSIONS.ICON_COMPACT : DROPZONE_DIMENSIONS.ICON_DEFAULT;
    const fileIconSize = compact ? DROPZONE_DIMENSIONS.FILE_ICON_COMPACT : DROPZONE_DIMENSIONS.FILE_ICON_DEFAULT;

    const borderClass = selectedFile
        ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
        : dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50';

    return (
        <div
            className={`border-2 border-dashed rounded-lg ${padding} text-center transition-colors cursor-pointer ${borderClass} ${className}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                ref={inputRef}
                type="file"
                accept={acceptString}
                onChange={handleChange}
                className="hidden"
            />

            {loading ? (
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className={`${iconSize} text-primary animate-spin`} />
                    <p className="text-lg font-medium">{loadingMessage}</p>
                </div>
            ) : selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className={`${iconSize} text-green-500`} />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                    </p>
                    {onClear && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={handleClearClick}
                        >
                            <X className={`${ICON_SIZES.SM} mr-2`} />
                            Remove
                        </Button>
                    )}
                </div>
            ) : (
                <>
                    {showFileIcons && allowedTypes && allowedTypes.length > 0 && (
                        <div className="flex justify-center gap-4 mb-4">
                            {allowedTypes.map(type => {
                                if (!type) return null;
                                const config = FILE_TYPE_ICON_CONFIG[type];
                                if (!config) return null;
                                const Icon = config.icon;
                                return <Icon key={type} className={`${fileIconSize} ${config.color}`} />;
                            })}
                        </div>
                    )}
                    {!showFileIcons && (
                        <Upload className={`${iconSize} mx-auto mb-4 text-muted-foreground`} />
                    )}
                    <p className={`font-medium ${compact ? 'text-base' : 'text-lg'} mb-2`}>
                        Drop your file here or click to browse
                    </p>
                    {allowedTypes && allowedTypes.length > 0 && (
                        <p className="text-sm text-muted-foreground mb-4">
                            Supports: {allowedTypes.filter(Boolean).map(t => t!.toUpperCase()).join(', ')}
                        </p>
                    )}
                    <Button
                        variant="outline"
                        onClick={handleBrowseClick}
                    >
                        <Upload className={`${ICON_SIZES.SM} mr-2`} />
                        Browse Files
                    </Button>
                </>
            )}
        </div>
    );
}

export const FileDropzone = memo(FileDropzoneComponent);
