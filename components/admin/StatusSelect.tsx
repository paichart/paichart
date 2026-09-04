'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { UserStatus } from '@/lib/types/auth';

interface StatusSelectProps {
  value: UserStatus;
  onChange: (status: UserStatus) => void;
  error?: string;
}

const AVAILABLE_STATUSES = [
  { value: UserStatus.ACTIVE, label: 'Active' },
  { value: UserStatus.INACTIVE, label: 'Inactive' },
  { value: UserStatus.SUSPENDED, label: 'Suspended' },
];

export default function StatusSelect({
  value,
  onChange,
  error,
}: StatusSelectProps): JSX.Element {
  const [localError, setLocalError] = React.useState<string | undefined>(error);

  const handleChange = (newStatus: string) => {
    if (!Object.values(UserStatus).includes(newStatus as UserStatus)) {
      setLocalError('Invalid status value');
      return;
    }

    setLocalError(undefined);
    onChange(newStatus as UserStatus);
  };

  // Update local error when prop changes
  React.useEffect(() => {
    setLocalError(error);
  }, [error]);

  return (
    <FormItem>
      <FormLabel>Status</FormLabel>
      <Select value={value} onValueChange={handleChange}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {AVAILABLE_STATUSES.map(status => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {localError && <FormMessage>{localError}</FormMessage>}
    </FormItem>
  );
}
