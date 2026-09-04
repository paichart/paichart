import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface POV {
  id: string;
  title: string;
  status: string;
  customerName?: string;
  opportunityName?: string;
  dealId?: string | null;
  lastCrmSync?: string;
  createdAt: string;
}

// 2026-06-12: the API never returned a `source` field — the badge rendered
// undefined since this dialog shipped (same phantom-field family as the
// Bloomberg pov.progress bug). Derive it from CRM linkage instead.
function povSource(pov: POV): string {
  return pov.dealId || pov.lastCrmSync ? 'CRM Import' : 'Manual';
}

interface SelectPovDialogProps {
  onSelect: (povId: string) => void;
}

export default function SelectPovDialog({ onSelect }: SelectPovDialogProps) {
  const [open, setOpen] = React.useState(false);

  const { data: povs, isLoading } = useQuery<POV[]>({
    queryKey: ['povs-for-launch'],
    queryFn: async () => {
      const response = await fetch('/api/pov?status=PROJECTED');
      if (!response.ok) throw new Error('Failed to fetch POVs');
      const data = await response.json();
      return data.data;
    }
  });

  const handleSelect = (povId: string) => {
    onSelect(povId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center">
          <Rocket className="h-4 w-4 mr-2" />
          Initiate New Launch
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select POV to Launch</DialogTitle>
          <DialogDescription>
            POVs in &apos;Projected&apos; status are available for launch.
            This includes both CRM-imported and manually created POVs.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div>Loading POVs...</div>
        ) : !povs?.length ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No POVs are currently ready for launch.</p>
            <p className="text-sm mt-2">
              POVs must be in &apos;Projected&apos; status to be launched.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {povs.map((pov) => (
              <div key={pov.id} className="border rounded-lg p-4 hover:bg-accent cursor-pointer" onClick={() => handleSelect(pov.id)}>
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium">{pov.title}</div>
                  <div className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    povSource(pov) === 'CRM Import' ? "bg-blue-100 text-blue-700" : "bg-muted text-foreground"
                  )}>
                    {povSource(pov)}
                  </div>
                </div>
                {pov.customerName && (
                  <div className="text-sm text-muted-foreground mb-1">
                    Customer: {pov.customerName}
                  </div>
                )}
                {pov.opportunityName && (
                  <div className="text-sm text-muted-foreground mb-1">
                    Opportunity: {pov.opportunityName}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {povSource(pov) === 'CRM Import' && pov.lastCrmSync ? (
                    <>Last synced: {new Date(pov.lastCrmSync).toLocaleDateString()}</>
                  ) : (
                    <>Created: {new Date(pov.createdAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
