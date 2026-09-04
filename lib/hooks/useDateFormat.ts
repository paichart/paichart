import { useSettings } from './useSettings';
import { formatDate, formatTime, formatDateTime } from '@/lib/utils/dateFormat';

export function useDateFormat() {
  const { settings } = useSettings();

  return {
    formatDate: (date: Date | string, format?: string) => 
      formatDate(date, settings.timezone, format),
    
    formatTime: (date: Date | string, format?: '12h' | '24h') => 
      formatTime(date, settings.timezone, format || settings.display?.timeFormat || '24h'),
    
    formatDateTime: (date: Date | string) => 
      formatDateTime(date, settings.timezone, settings.display?.timeFormat || '24h'),
    
    settings,
  };
}
