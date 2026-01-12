/**
 * FileUploadDialog Component
 * Shared dialog for uploading and previewing data files
 */

import * as React from 'react';
import {
    Button,
    Badge,
    ScrollArea,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from '@vendure/dashboard';
import {
    Upload,
    RefreshCw,
    FileText,
    FileSpreadsheet,
    File,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseCSV } from '../../../utils/parsers';

export interface FileUploadDialogProps {
    open: boolean;
    onClose: () => void;
    onFileSelected: (file: File, preview: any[]) => void;
    acceptedFormats: string[];
}

export function FileUploadDialog({ open, onClose, onFileSelected, acceptedFormats }: FileUploadDialogProps) {
    const [dragOver, setDragOver] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [preview, setPreview] = React.useState<any[] | null>(null);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [currentFile, setCurrentFile] = React.useState<File | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        setLoading(true);
        setCurrentFile(file);
        try {
            const content = await file.text();
            let data: any[] = [];

            if (file.name.endsWith('.csv')) {
                data = parseCSV(content).slice(0, 10);
                if (data.length > 0) {
                    setColumns(Object.keys(data[0]));
                }
            } else if (file.name.endsWith('.json')) {
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed.slice(0, 10) : [parsed];
                if (data.length > 0) {
                    setColumns(Object.keys(data[0]));
                }
            }

            setPreview(data);
        } catch (error) {
            toast.error('Failed to parse file');
        } finally {
            setLoading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const handleReset = () => {
        setPreview(null);
        setColumns([]);
        setCurrentFile(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Upload Data File</DialogTitle>
                    <DialogDescription>
                        Upload a file to use as the data source for this node.
                    </DialogDescription>
                </DialogHeader>

                {!preview ? (
                    <div
                        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                        }`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        {loading ? (
                            <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
                        ) : (
                            <>
                                <div className="flex justify-center gap-4 mb-4">
                                    <FileText className="w-10 h-10 text-blue-500" />
                                    <FileSpreadsheet className="w-10 h-10 text-green-500" />
                                    <File className="w-10 h-10 text-yellow-500" />
                                </div>
                                <p className="text-lg font-medium mb-2">Drop your file here</p>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Supports: {acceptedFormats.join(', ').toUpperCase()}
                                </p>
                                <Button onClick={() => inputRef.current?.click()}>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Browse Files
                                </Button>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept={acceptedFormats.map(f => `.${f}`).join(',')}
                                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                                    className="hidden"
                                />
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Badge variant="outline">{preview.length} rows preview</Badge>
                            <Button variant="ghost" size="sm" onClick={handleReset}>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Upload Different
                            </Button>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                            <ScrollArea className="max-h-[300px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map(col => (
                                                <TableHead key={col} className="min-w-[120px]">{col}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {preview.map((row, i) => (
                                            <TableRow key={i}>
                                                {columns.map(col => (
                                                    <TableCell key={col} className="font-mono text-xs">
                                                        {String(row[col] ?? '').slice(0, 50)}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    {preview && currentFile && (
                        <Button onClick={() => {
                            onFileSelected(currentFile, preview);
                            handleClose();
                        }}>
                            Use This File
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default FileUploadDialog;
