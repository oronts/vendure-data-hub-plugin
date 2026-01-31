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
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { FileDropzone } from '../../shared/file-dropzone';
import { parseCSV } from '../../../utils/parsers';
import { UI_LIMITS, COMPONENT_HEIGHTS, COMPONENT_WIDTHS, TOAST_FILE } from '../../../constants';
import type { FileUploadDialogProps, JsonObject, FileType } from '../../../types';

export function FileUploadDialog({ open, onClose, onFileSelected, acceptedFormats }: FileUploadDialogProps) {
    const [loading, setLoading] = React.useState(false);
    const [preview, setPreview] = React.useState<JsonObject[] | null>(null);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [currentFile, setCurrentFile] = React.useState<File | null>(null);

    const handleFile = async (file: File) => {
        setLoading(true);
        setCurrentFile(file);
        try {
            const content = await file.text();
            let data: JsonObject[] = [];

            if (file.name.endsWith('.csv')) {
                data = parseCSV(content).slice(0, UI_LIMITS.PREVIEW_ROW_LIMIT);
                if (data.length > 0) {
                    setColumns(Object.keys(data[0]));
                }
            } else if (file.name.endsWith('.json')) {
                const parsed = JSON.parse(content);
                data = Array.isArray(parsed) ? parsed.slice(0, UI_LIMITS.PREVIEW_ROW_LIMIT) : [parsed];
                if (data.length > 0) {
                    setColumns(Object.keys(data[0]));
                }
            }

            setPreview(data);
        } catch {
            toast.error(TOAST_FILE.PARSE_ERROR);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setPreview(null);
        setColumns([]);
        setCurrentFile(null);
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
                    <FileDropzone
                        onFileSelect={handleFile}
                        allowedTypes={acceptedFormats as FileType[]}
                        loading={loading}
                    />
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
                            <ScrollArea className={COMPONENT_HEIGHTS.SCROLL_AREA_SM}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map(col => (
                                                <TableHead key={col} className={COMPONENT_WIDTHS.TABLE_HEADER_MIN}>{col}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {/* Index as key acceptable - static preview data, not reordered */}
                                        {preview.map((row, rowIndex) => (
                                            <TableRow key={`preview-${rowIndex}`}>
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
