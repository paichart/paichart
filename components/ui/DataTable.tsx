import * as React from "react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { Filter, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";

// Types
type Order = 'asc' | 'desc';

interface Column<T> {
  id: keyof T;
  label: string;
  numeric?: boolean;
  width?: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  defaultSort?: keyof T;
  defaultOrder?: Order;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  onSortChange?: (property: keyof T, order: Order) => void;
  onFilterClick?: (column: Column<T>) => void;
  getRowId: (row: T) => string;
  selected?: string[];
  className?: string;
  virtualized?: boolean;
  itemHeight?: number;
  maxHeight?: number;
}

// Virtualized table row component
const TableRowVirtualized = React.memo(({ 
  index, 
  style, 
  data: { rows, columns, selected, onSelectionChange, getRowId, selectable } 
}: any) => {
  const row = rows[index];
  const id = getRowId(row);
  const isItemSelected = selected.indexOf(id) !== -1;
  
  const handleClick = React.useCallback(() => {
    if (!selectable) return;
    
    const selectedIndex = selected.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1)
      );
    }

    onSelectionChange?.(newSelected);
  }, [id, selected, selectable, onSelectionChange]);

  return (
    <div style={style}>
      <TableRow
        data-state={isItemSelected ? "selected" : ""}
        onClick={handleClick}
        className="border-b"
      >
        {selectable && (
          <TableCell className="w-[50px]">
            <Checkbox
              checked={isItemSelected}
              onCheckedChange={handleClick}
              aria-label={`Select row ${id}`}
              className="translate-y-[2px]"
            />
          </TableCell>
        )}
        {columns.map((column: any) => (
          <TableCell
            key={String(column.id)}
            className={cn(column.numeric && "text-right")}
            style={{ width: column.width }}
          >
            {column.render
              ? column.render(row[column.id], row)
              : row[column.id]}
          </TableCell>
        ))}
      </TableRow>
    </div>
  );
});

TableRowVirtualized.displayName = 'TableRowVirtualized';

export function DataTable<T extends { [key: string]: any }>(props: DataTableProps<T>) {
  const {
    columns,
    data,
    defaultSort,
    defaultOrder = 'asc',
    selectable = false,
    onSelectionChange,
    onSortChange,
    onFilterClick,
    getRowId,
    selected = [],
    className,
    virtualized = false,
    itemHeight = 53, // Standard table row height
    maxHeight = 400,
  } = props;

  const [orderBy, setOrderBy] = React.useState<keyof T | undefined>(defaultSort);
  const [order, setOrder] = React.useState<Order>(defaultOrder);

  const handleRequestSort = (property: keyof T) => {
    const isAsc = orderBy === property && order === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';
    setOrder(newOrder);
    setOrderBy(property);
    onSortChange?.(property, newOrder);
  };

  const handleSelectAllClick = (checked: boolean) => {
    if (checked) {
      const newSelected = data.map((row) => getRowId(row));
      onSelectionChange?.(newSelected);
      return;
    }
    onSelectionChange?.([]);
  };

  const handleClick = (id: string) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1)
      );
    }

    onSelectionChange?.(newSelected);
  };

  const isSelected = (id: string) => selected.indexOf(id) !== -1;

  // Memoized virtual list data
  const listData = React.useMemo(() => ({
    rows: data,
    columns,
    selected,
    onSelectionChange,
    getRowId,
    selectable
  }), [data, columns, selected, onSelectionChange, getRowId, selectable]);

  // Calculate optimal height for virtualization
  const calculatedHeight = Math.min(maxHeight, data.length * itemHeight + 60); // 60px for header

  if (virtualized && data.length > 10) {
    return (
      <div className={cn("rounded-md border", className)}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={data.length > 0 && selected.length === data.length}
                      onCheckedChange={handleSelectAllClick}
                      aria-label="Select all"
                      className="translate-y-[2px]"
                    />
                  </TableHead>
                )}
                {columns.map((column: any) => (
                  <TableHead
                    key={String(column.id)}
                    style={{ width: column.width }}
                    className={cn(
                      column.numeric && "text-right",
                      "whitespace-nowrap"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {column.sortable !== false ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3 h-8 data-[state=active]:bg-accent"
                          onClick={() => handleRequestSort(column.id)}
                          data-state={orderBy === column.id ? "active" : "inactive"}
                        >
                          {column.label}
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="font-medium">{column.label}</span>
                      )}
                      {onFilterClick && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onFilterClick(column)}
                              >
                                <Filter className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Filter {column.label}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          </Table>
        </div>
        
        {/* Virtualized Body */}
        <div style={{ height: calculatedHeight }}>
          <List
            height={calculatedHeight}
            width="100%"
            itemCount={data.length}
            itemSize={itemHeight}
            itemData={listData}
            className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          >
            {TableRowVirtualized}
          </List>
        </div>
      </div>
    );
  }

  // Standard non-virtualized table for smaller datasets
  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={data.length > 0 && selected.length === data.length}
                  onCheckedChange={handleSelectAllClick}
                  aria-label="Select all"
                  className="translate-y-[2px]"
                />
              </TableHead>
            )}
            {columns.map((column: any) => (
              <TableHead
                key={String(column.id)}
                style={{ width: column.width }}
                className={cn(
                  column.numeric && "text-right",
                  "whitespace-nowrap"
                )}
              >
                <div className="flex items-center gap-2">
                  {column.sortable !== false ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 data-[state=active]:bg-accent"
                      onClick={() => handleRequestSort(column.id)}
                      data-state={orderBy === column.id ? "active" : "inactive"}
                    >
                      {column.label}
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="font-medium">{column.label}</span>
                  )}
                  {onFilterClick && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onFilterClick(column)}
                          >
                            <Filter className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Filter {column.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const id = getRowId(row);
            const isItemSelected = isSelected(id);

            return (
              <TableRow
                key={id}
                data-state={isItemSelected ? "selected" : ""}
                onClick={() => selectable && handleClick(id)}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={isItemSelected}
                      onCheckedChange={() => handleClick(id)}
                      aria-label={`Select row ${id}`}
                      className="translate-y-[2px]"
                    />
                  </TableCell>
                )}
                {columns.map((column: any) => (
                  <TableCell
                    key={String(column.id)}
                    className={cn(column.numeric && "text-right")}
                  >
                    {column.render
                      ? column.render(row[column.id], row)
                      : row[column.id]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default DataTable;
