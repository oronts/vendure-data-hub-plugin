import * as React from 'react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@vendure/dashboard';
import { ChevronDown } from 'lucide-react';

export interface ReviewSectionProps {
    readonly title: React.ReactNode;
    readonly children: React.ReactNode;
    readonly defaultOpen?: boolean;
}

export function ReviewSection({
    title,
    children,
    defaultOpen = false,
}: ReviewSectionProps) {
    const [open, setOpen] = React.useState(defaultOpen);
    const chevronClassName = open
        ? 'mt-0.5 size-4 shrink-0 rotate-180 text-muted-foreground transition-transform duration-200'
        : 'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200';

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            className="border-b last:border-b-0"
        >
            <CollapsibleTrigger className="flex w-full items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-all hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                <span>{title}</span>
                <ChevronDown className={chevronClassName} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="pb-4 text-sm">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}
