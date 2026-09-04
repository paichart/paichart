'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { UserRole } from '@/lib/types/auth';
import { AdminUser, UserTableProps } from './types';
import { cn } from '@/lib/utils';
import { ApiKeyManagement } from './ApiKeyManagement';

type Order = 'asc' | 'desc';
type OrderBy = keyof Pick<AdminUser, 'name' | 'email' | 'role' | 'status' | 'lastLogin'> | 'jobTitle' | '';

interface HeadCell {
  id: OrderBy;
  label: string;
  sortable: boolean;
  hideOnMobile?: boolean;
}

const headCells: HeadCell[] = [
  { id: 'name', label: 'Name', sortable: true },
  { id: 'email', label: 'Email', sortable: true },
  { id: 'role', label: 'System Role', sortable: true },
  { id: 'jobTitle', label: 'Job Title', sortable: true },
  { id: 'status', label: 'Status', sortable: true },
  { id: 'lastLogin', label: 'Last Login', sortable: true, hideOnMobile: true },
];

const getRoleVariant = (role: UserRole): "default" | "secondary" | "outline" => {
  switch (role) {
    case UserRole.ADMIN:
      return 'default';
    case UserRole.SUPER_ADMIN:
      return 'secondary';
    default:
      return 'outline';
  }
};

function UserTable({ users, onEdit, onDelete, onSelectionChange }: UserTableProps): JSX.Element {
  const [order, setOrder] = useState<Order>('asc');
  const [orderBy, setOrderBy] = useState<OrderBy>('');
  const [selected, setSelected] = useState<string[]>([]);
  const isMobile = window.innerWidth < 640;

  const handleRequestSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleSelectAllClick = (checked: boolean) => {
    if (checked) {
      const newSelected = users.map((user) => user.id);
      setSelected(newSelected);
      onSelectionChange?.(users);
    } else {
      setSelected([]);
      onSelectionChange?.([]);
    }
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

    setSelected(newSelected);
    onSelectionChange?.(users.filter(user => newSelected.includes(user.id)));
  };

  const sortedUsers = React.useMemo(() => {
    if (!orderBy) return users;

    return [...users].sort((a, b) => {
      if (orderBy === 'jobTitle') {
        const aValue = a.customRole?.name || '';
        const bValue = b.customRole?.name || '';
        if (order === 'desc') {
          return bValue.localeCompare(aValue);
        }
        return aValue.localeCompare(bValue);
      }

      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return order === 'asc' ? 1 : -1;
      if (bValue === null) return order === 'asc' ? -1 : 1;

      if (order === 'desc') {
        return bValue < aValue ? -1 : bValue > aValue ? 1 : 0;
      }
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    });
  }, [users, order, orderBy]);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableCell className="w-[50px]">
              <Checkbox
                checked={users.length > 0 && selected.length === users.length}
                onCheckedChange={handleSelectAllClick}
                aria-label="Select all"
              />
            </TableCell>
            {headCells.map((headCell) => (
              !isMobile || !headCell.hideOnMobile ? (
                <TableHead
                  key={headCell.id}
                  className={cn(
                    "cursor-pointer",
                    orderBy === headCell.id && order === 'desc' && "[&>svg]:rotate-180"
                  )}
                  onClick={() => headCell.sortable && handleRequestSort(headCell.id)}
                >
                  {headCell.label}
                  {headCell.sortable && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-2 h-4 w-4 transition-transform"
                    >
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  )}
                </TableHead>
              ) : null
            ))}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedUsers.map((user) => {
            const isSelected = selected.indexOf(user.id) !== -1;
            return (
              <TableRow
                key={user.id}
                data-state={isSelected ? 'selected' : undefined}
                className="cursor-pointer"
              >
                <TableCell className="w-[50px]">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleClick(user.id)}
                    aria-label={`Select ${user.name}`}
                  />
                </TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={getRoleVariant(user.role)}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.customRole?.name || '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'ACTIVE' ? 'success' : 'outline'}>
                    {user.status}
                  </Badge>
                </TableCell>
                {!isMobile && (
                  <TableCell>
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : '-'}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider>
                      {onEdit && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(user);
                              }}
                              className="h-8 w-8"
                            >
                              <PencilIcon className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit user</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      
                      <ApiKeyManagement user={user} />
                      
                      {onDelete && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(user);
                              }}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <TrashIcon className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete user</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { UserTable };
export default UserTable;
