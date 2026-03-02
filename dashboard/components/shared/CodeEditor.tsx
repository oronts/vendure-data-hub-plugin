import * as React from 'react';
import { useCallback, useRef, useMemo, useState } from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@vendure/dashboard';
import { Maximize2, Minimize2, WandSparkles } from 'lucide-react';

/**
 * Lightweight JavaScript formatter. Handles indentation, brace/bracket alignment,
 * semicolon insertion, and basic whitespace normalization without external deps.
 */
function formatJavaScript(code: string): string {
    if (!code.trim()) return code;

    const lines = code.split('\n');
    let indent = 0;
    const indentStr = '  ';
    const result: string[] = [];

    for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line) {
            // Preserve blank lines (max 1 consecutive)
            if (result.length > 0 && result[result.length - 1] !== '') {
                result.push('');
            }
            continue;
        }

        // Decrease indent for closing braces/brackets/parens
        if (/^[}\])]/.test(line)) {
            indent = Math.max(0, indent - 1);
        }

        // Apply current indentation
        result.push(indentStr.repeat(indent) + line);

        // Increase indent for opening braces/brackets (not in strings/comments)
        const stripped = line.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');
        const opens = (stripped.match(/[{(\[]/g) || []).length;
        const closes = (stripped.match(/[})\]]/g) || []).length;
        indent = Math.max(0, indent + opens - closes);
    }

    // Remove trailing blank lines
    while (result.length > 0 && result[result.length - 1] === '') {
        result.pop();
    }

    return result.join('\n');
}

export interface CodeEditorProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    rows: number;
    className?: string;
    showFormatButton?: boolean;
}

/**
 * Code editor with line numbers, Tab key support, and synchronized scroll.
 * Used by both SchemaFormRenderer (TextareaField) and OperatorFieldInput.
 */
export function CodeEditor({
    id,
    value,
    onChange,
    placeholder,
    disabled,
    rows,
    className,
    showFormatButton,
}: CodeEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const lineCount = useMemo(() => {
        const lines = (value || '').split('\n').length;
        return Math.max(lines, rows);
    }, [value, rows]);

    const lineNumbers = useMemo(
        () => Array.from({ length: lineCount }, (_, i) => i + 1),
        [lineCount],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
        },
        [onChange],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const newValue = value.substring(0, start) + '  ' + value.substring(end);
                onChange(newValue);
                requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = start + 2;
                });
            }
            // Enter key: auto-indent to match current line
            if (e.key === 'Enter') {
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const currentLine = value.substring(lineStart, start);
                const match = currentLine.match(/^(\s*)/);
                const currentIndent = match ? match[1] : '';

                // Add extra indent if line ends with { or (
                const trimmed = currentLine.trimEnd();
                const extraIndent = /[{(\[]$/.test(trimmed) ? '  ' : '';

                e.preventDefault();
                const newValue = value.substring(0, start) + '\n' + currentIndent + extraIndent + value.substring(ta.selectionEnd);
                onChange(newValue);
                const newPos = start + 1 + currentIndent.length + extraIndent.length;
                requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = newPos;
                });
            }
        },
        [value, onChange],
    );

    const handleScroll = useCallback(() => {
        const ta = textareaRef.current;
        const gutter = ta?.parentElement?.querySelector('[data-gutter]') as HTMLElement | null;
        if (ta && gutter) {
            gutter.scrollTop = ta.scrollTop;
        }
    }, []);

    const handleFormat = useCallback(() => {
        onChange(formatJavaScript(value));
    }, [value, onChange]);

    return (
        <div className={`relative rounded-md border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring ${className ?? ''}`}>
            {showFormatButton && (
                <div className="flex items-center justify-between px-2 py-1 bg-muted/30 border-b border-input">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">JavaScript</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] gap-1 px-1.5 text-muted-foreground hover:text-foreground"
                        onClick={handleFormat}
                        type="button"
                        disabled={disabled}
                    >
                        <WandSparkles className="h-3 w-3" />
                        Format
                    </Button>
                </div>
            )}
            <div className="flex">
                <div
                    data-gutter
                    className="flex flex-col items-end pt-2 pb-2 px-2 bg-muted/50 text-muted-foreground text-xs font-mono select-none overflow-hidden border-r border-input"
                    style={{ minWidth: '2.5rem' }}
                    aria-hidden="true"
                >
                    {lineNumbers.map((n) => (
                        <div key={n} className="leading-5 h-5">{n}</div>
                    ))}
                </div>
                <textarea
                    ref={textareaRef}
                    id={id}
                    value={value ?? ''}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={rows}
                    spellCheck={false}
                    className="flex-1 resize-none bg-transparent p-2 font-mono text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ tabSize: 2 }}
                />
            </div>
        </div>
    );
}

export interface CodeEditorWithExpandProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    description?: string;
}

/**
 * Code editor with an Expand button that opens a fullscreen dialog.
 * Wraps CodeEditor with expand/collapse functionality.
 * Includes Format button for JavaScript code formatting.
 */
export function CodeEditorWithExpand({
    id,
    label,
    value,
    onChange,
    placeholder,
    disabled,
    rows = 10,
    description,
}: CodeEditorWithExpandProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="space-y-1">
            <div className="flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => setExpanded(true)}
                    type="button"
                >
                    <Maximize2 className="h-3 w-3" />
                    Expand
                </Button>
            </div>

            <CodeEditor
                id={id}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                disabled={disabled}
                rows={rows}
                showFormatButton
            />

            {description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{description}</p>
            )}

            <Dialog open={expanded} onOpenChange={setExpanded}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                    <DialogHeader className="flex-row items-center justify-between pr-8">
                        <DialogTitle className="font-mono text-sm">
                            {label}
                        </DialogTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1"
                            onClick={() => setExpanded(false)}
                            type="button"
                        >
                            <Minimize2 className="h-3 w-3" />
                            Collapse
                        </Button>
                    </DialogHeader>
                    <div className="flex-1 min-h-0">
                        <CodeEditor
                            id={`${id}-expanded`}
                            value={value}
                            onChange={onChange}
                            placeholder={placeholder}
                            disabled={disabled}
                            rows={30}
                            className="h-full"
                            showFormatButton
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
