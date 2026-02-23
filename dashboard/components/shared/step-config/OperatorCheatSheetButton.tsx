import * as React from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Separator } from '@vendure/dashboard';
import { BookOpen } from 'lucide-react';
import { useComparisonOperators } from '../../../hooks/api/use-config-options';

type ButtonSize = 'sm' | 'default' | 'lg' | 'icon';
type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';

export function OperatorCheatSheetButton({ label = 'Operator cheat-sheet', size = 'sm', variant = 'outline' }: { label?: string; size?: ButtonSize; variant?: ButtonVariant }) {
    const [open, setOpen] = React.useState(false);
    const { operators } = useComparisonOperators();

    return (
        <>
            <Button variant={variant} size={size} className="gap-1.5" onClick={() => setOpen(true)}>
                <BookOpen className="w-3.5 h-3.5" />
                {label}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <BookOpen className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <DialogTitle>Operator Cheat Sheet</DialogTitle>
                                <DialogDescription>Quick reference for comparison operators in filter rules</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                    <Separator />
                    <div className="grid grid-cols-1 gap-1.5 max-h-[400px] overflow-y-auto pr-1">
                        {operators.map(op => (
                            <div key={op.value} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                                <code className="shrink-0 px-2 py-0.5 rounded bg-muted text-xs font-semibold min-w-[60px] text-center">
                                    {op.value}
                                </code>
                                <div className="text-xs">
                                    <span className="text-foreground">{op.description}</span>
                                    {op.example && (
                                        <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                                            e.g. {op.example}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
