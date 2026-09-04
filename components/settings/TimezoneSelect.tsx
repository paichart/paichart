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

// List of common timezones
const COMMON_TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
];

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

export default function TimezoneSelect({ value, onChange, disabled }: TimezoneSelectProps) {
  // Get current time in selected timezone
  const getCurrentTime = (timezone: string) => {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  };

  return (
    <FormItem>
      <FormLabel>Timezone</FormLabel>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select timezone">
            {value ? `${value.replace('_', ' ')} (${getCurrentTime(value)})` : 'Select timezone'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COMMON_TIMEZONES.map((tz) => (
            <SelectItem key={tz} value={tz}>
              {tz.replace('_', ' ')} ({getCurrentTime(tz)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormItem>
  );
}
