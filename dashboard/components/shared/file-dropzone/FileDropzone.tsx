import * as React from 'react';
import { useCallback, memo } from 'react';
import { Button } from '@vendure/dashboard';
import { Upload, RefreshCw, CheckCircle2, X, File } from 'lucide-react';
import type { FileType, FileDropzoneProps } from '../../../types';
import { formatFileSize } from '../../../utils';
import { DROPZONE_DIMENSIONS, ICON_SIZES, buildAcceptString } from '../../../constants';
import { useOptionValues } from '../../../hooks/api/use-config-options';
import { resolveIconName } from '../../../utils/icon-resolver';

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
    const { options: fileFormatOptions } = useOptionValues('fileFormats');

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

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && !selectedFile) {
            e.preventDefault();
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

    const acceptString = accept || buildAcceptString(allowedTypes);
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
            role="button"
            tabIndex={0}
            aria-label="Upload file"
            className={`border-2 border-dashed rounded-lg ${padding} text-center transition-colors cursor-pointer ${borderClass} ${className}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            data-testid="datahub-filedropzone-dropzone"
        >
            <input
                ref={inputRef}
                type="file"
                accept={acceptString}
                onChange={handleChange}
                className="hidden"
                aria-hidden="true"
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
                            data-testid="datahub-filedropzone-remove"
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
                                const formatOpt = fileFormatOptions.find(f => f.value === type.toUpperCase());
                                const Icon = resolveIconName(formatOpt?.icon) ?? File;
                                const hexColor = formatOpt?.color ?? undefined;
                                return <Icon key={type} className={fileIconSize} style={hexColor ? { color: hexColor } : undefined} />;
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
                            Supports: {allowedTypes.filter((t): t is FileType => Boolean(t)).map(t => t.toUpperCase()).join(', ')}
                        </p>
                    )}
                    <Button
                        variant="outline"
                        onClick={handleBrowseClick}
                        data-testid="datahub-filedropzone-browse"
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
