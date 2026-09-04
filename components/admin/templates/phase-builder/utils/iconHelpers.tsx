import React from 'react';
import { CheckSquare, Calendar, FileText, Users, Link } from 'lucide-react';

export const getTaskTypeIcon = (type: string) => {
  switch (type) {
    case 'action':
      return <CheckSquare className="h-4 w-4" />;
    case 'approval':
      return <Users className="h-4 w-4" />;
    case 'document':
      return <FileText className="h-4 w-4" />;
    case 'meeting':
      return <Calendar className="h-4 w-4" />;
    case 'milestone':
      return <Link className="h-4 w-4" />;
    default:
      return <CheckSquare className="h-4 w-4" />;
  }
};
