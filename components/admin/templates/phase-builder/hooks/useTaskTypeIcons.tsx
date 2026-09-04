import React, { useCallback } from 'react';
import {
  CheckCircle,
  FileText,
  MessageSquare,
  Link as LinkIcon,
  Upload,
  Download,
  FileQuestion,
  AlertTriangle,
  Calendar,
  Mail,
  Users,
  Settings,
  Database,
  Code,
  PieChart,
  Clipboard,
  BarChart2
} from 'lucide-react';

export function useTaskTypeIcons() {
  const getTaskTypeIcon = useCallback((type: string): React.ReactNode => {
    switch (type?.toLowerCase()) {
      case 'approval':
        return React.createElement(CheckCircle, { size: 16 });
      case 'document':
        return React.createElement(FileText, { size: 16 });
      case 'discussion':
        return React.createElement(MessageSquare, { size: 16 });
      case 'integration':
        return React.createElement(LinkIcon, { size: 16 });
      case 'upload':
        return React.createElement(Upload, { size: 16 });
      case 'download':
        return React.createElement(Download, { size: 16 });
      case 'question':
        return React.createElement(FileQuestion, { size: 16 });
      case 'alert':
        return React.createElement(AlertTriangle, { size: 16 });
      case 'meeting':
        return React.createElement(Calendar, { size: 16 });
      case 'email':
        return React.createElement(Mail, { size: 16 });
      case 'team':
        return React.createElement(Users, { size: 16 });
      case 'configuration':
        return React.createElement(Settings, { size: 16 });
      case 'data':
        return React.createElement(Database, { size: 16 });
      case 'development':
        return React.createElement(Code, { size: 16 });
      case 'analysis':
        return React.createElement(PieChart, { size: 16 });
      case 'survey':
        return React.createElement(Clipboard, { size: 16 });
      case 'report':
        return React.createElement(BarChart2, { size: 16 });
      default:
        return React.createElement(FileText, { size: 16 });
    }
  }, []);
  
  return { getTaskTypeIcon };
}
