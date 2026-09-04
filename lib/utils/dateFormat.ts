import { logger } from '@/lib/logger';

const dateLogger = logger.child({ module: 'DateFormat' });

export function formatDate(date: Date | string, timezone: string = 'UTC', format: string = 'DD/MM/YYYY'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      throw new Error('Invalid date');
    }
    
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone || 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch (error) {
    dateLogger.error({ err: error }, 'Date formatting error');
    return 'Invalid date';
  }
}

export function formatTime(date: Date | string, timezone: string = 'UTC', format: '12h' | '24h' = '24h'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      throw new Error('Invalid date');
    }

    return new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: format === '12h',
    }).format(d);
  } catch (error) {
    dateLogger.error({ err: error }, 'Time formatting error');
    return 'Invalid time';
  }
}

export function formatDateTime(date: Date | string, timezone: string = 'UTC', timeFormat: '12h' | '24h' = '24h'): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      throw new Error('Invalid date');
    }

    return new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone || 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    }).format(d);
  } catch (error) {
    dateLogger.error({ err: error }, 'DateTime formatting error');
    return 'Invalid date/time';
  }
}
