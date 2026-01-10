import * as React from 'react';
import { Button } from '@vendure/dashboard';
import { Upload, RefreshCw, FileText, FileSpreadsheet, File } from 'lucide-react';
import type { FileUploadZoneProps } from './types';

export function FileUploadZone({ onFileSelect, allowedTypes, loading }: FileUploadZoneProps) {
    const [dragOver, setDragOver] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
    };

    const getAcceptString = () => {
        const types: string[] = [];
        if (allowedTypes.includes('csv')) types.push('.csv');
        if (allowedTypes.includes('excel')) types.push('.xlsx', '.xls');
        if (allowedTypes.includes('json')) types.push('.json');
        return types.join(',');
    };

    return (
        <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
        >
            {loading ? (
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-lg font-medium">Parsing file...</p>
                </div>
            ) : (
                <>
                    <div className="flex justify-center gap-4 mb-4">
                        {allowedTypes.includes('csv') && <FileText className="w-10 h-10 text-blue-500" />}
                        {allowedTypes.includes('excel') && <FileSpreadsheet className="w-10 h-10 text-green-500" />}
                        {allowedTypes.includes('json') && <File className="w-10 h-10 text-yellow-500" />}
                    </div>
                    <p className="text-lg font-medium mb-2">Drop your file here</p>
                    <p className="text-sm text-muted-foreground mb-4">
                        Supports: {allowedTypes.map(t => t.toUpperCase()).join(', ')}
                    </p>
                    <Button onClick={() => inputRef.current?.click()}>
                        <Upload className="w-4 h-4 mr-2" />
                        Browse Files
                    </Button>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={getAcceptString()}
                        onChange={handleChange}
                        className="hidden"
                    />
                </>
            )}
        </div>
    );
}

export default FileUploadZone;
