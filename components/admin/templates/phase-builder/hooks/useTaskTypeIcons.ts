import { useCallback } from 'react';

// Define a type for the icon names
type IconName = 
  | 'check-circle'
  | 'file-text'
  | 'message-square'
  | 'link'
  | 'upload'
  | 'download'
  | 'file-question'
  | 'alert-triangle'
  | 'calendar'
  | 'mail'
  | 'users'
  | 'settings'
  | 'database'
  | 'code'
  | 'pie-chart'
  | 'clipboard'
  | 'bar-chart-2';

export function useTaskTypeIcons() {
  // Return the icon name based on task type
  const getTaskTypeIconName = useCallback((type: string): IconName => {
    switch (type?.toLowerCase()) {
      case 'approval':
        return 'check-circle';
      case 'document':
        return 'file-text';
      case 'discussion':
        return 'message-square';
      case 'integration':
        return 'link';
      case 'upload':
        return 'upload';
      case 'download':
        return 'download';
      case 'question':
        return 'file-question';
      case 'alert':
        return 'alert-triangle';
      case 'meeting':
        return 'calendar';
      case 'email':
        return 'mail';
      case 'team':
        return 'users';
      case 'configuration':
        return 'settings';
      case 'data':
        return 'database';
      case 'development':
        return 'code';
      case 'analysis':
        return 'pie-chart';
      case 'survey':
        return 'clipboard';
      case 'report':
        return 'bar-chart-2';
      default:
        return 'file-text';
    }
  }, []);
  
  return { getTaskTypeIcon: getTaskTypeIconName };
}
