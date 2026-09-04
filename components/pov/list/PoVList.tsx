import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Eye, Pencil, Trash2 } from 'lucide-react';

interface PoV {
  id: number;
  name: string;
  customer: string;
  status: 'draft' | 'active' | 'completed' | 'failed';
  progress: number;
  startDate: string;
  endDate: string;
}

const PoVList = () => {
  // This will be replaced with real data from API
  const povs: PoV[] = [
    {
      id: 1,
      name: 'Enterprise Co. PoV',
      customer: 'Enterprise Corporation',
      status: 'active',
      progress: 75,
      startDate: '2024-01-01',
      endDate: '2024-02-01'
    },
    {
      id: 2,
      name: 'Tech Corp PoV',
      customer: 'Tech Corporation',
      status: 'draft',
      progress: 0,
      startDate: '2024-01-15',
      endDate: '2024-02-15'
    },
    {
      id: 3,
      name: 'Startup Inc. PoV',
      customer: 'Startup Industries',
      status: 'completed',
      progress: 100,
      startDate: '2023-12-01',
      endDate: '2024-01-01'
    }
  ];

  const getStatusVariant = (status: PoV['status']) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'completed':
        return 'success';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">PoV Projects</h2>
        <p className="text-sm text-muted-foreground">
          All proof of value projects
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {povs.map((pov) => (
            <TableRow key={pov.id}>
              <TableCell className="font-medium">
                {pov.name}
              </TableCell>
              <TableCell>
                {pov.customer}
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(pov.status)} className="capitalize">
                  {pov.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pov.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-9">
                    {pov.progress}%
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {formatDate(pov.startDate)}
              </TableCell>
              <TableCell>
                {formatDate(pov.endDate)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Details</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};

export default PoVList;
