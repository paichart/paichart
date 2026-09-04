import { POVStatus, Priority, SalesTheatre } from '@prisma/client';

// Shared color system that matches POVAnalyticsBar
export const getStatusColor = (status: POVStatus) => {
  switch (status) {
    case 'PROJECTED':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-500 text-white border-blue-500'
      };
    case 'IN_PROGRESS':
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
        badgeClass: 'bg-green-500 text-white border-green-500'
      };
    case 'STALLED':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-500 text-white border-amber-500'
      };
    case 'VALIDATION':
      return {
        bg: 'bg-purple-500',
        text: 'text-purple-500',
        border: 'border-purple-500',
        badgeClass: 'bg-purple-500 text-white border-purple-500'
      };
    case 'WON':
      return {
        bg: 'bg-emerald-500',
        text: 'text-emerald-500',
        border: 'border-emerald-500',
        badgeClass: 'bg-emerald-500 text-white border-emerald-500'
      };
    case 'LOST':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-500 text-white border-red-500'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-500 text-white border-gray-500'
      };
  }
};

export const getPriorityColor = (priority: Priority) => {
  switch (priority) {
    case 'HIGH':
      return {
        bg: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        badgeClass: 'bg-red-500 text-white border-red-500'
      };
    case 'MEDIUM':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-500 text-white border-amber-500'
      };
    case 'LOW':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-500 text-white border-blue-500'
      };
    case 'URGENT':
      return {
        bg: 'bg-red-700',
        text: 'text-red-700',
        border: 'border-red-700',
        badgeClass: 'bg-red-700 text-white border-red-700'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-500 text-white border-gray-500'
      };
  }
};

export const getTheatreColor = (theatre: SalesTheatre) => {
  switch (theatre) {
    case 'NORTH_AMERICA':
      return {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        border: 'border-blue-500',
        badgeClass: 'bg-blue-500 text-white border-blue-500'
      };
    case 'LAC':
      return {
        bg: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
        badgeClass: 'bg-green-500 text-white border-green-500'
      };
    case 'EMEA':
      return {
        bg: 'bg-purple-500',
        text: 'text-purple-500',
        border: 'border-purple-500',
        badgeClass: 'bg-purple-500 text-white border-purple-500'
      };
    case 'APJ':
      return {
        bg: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        badgeClass: 'bg-amber-500 text-white border-amber-500'
      };
    default:
      return {
        bg: 'bg-gray-500',
        text: 'text-gray-500',
        border: 'border-gray-500',
        badgeClass: 'bg-gray-500 text-white border-gray-500'
      };
  }
};

// Format functions
export const formatStatus = (status: POVStatus) => {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const formatPriority = (priority: Priority) => {
  return priority.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};

export const formatTheatreName = (theatre: SalesTheatre) => {
  switch (theatre) {
    case 'NORTH_AMERICA':
      return 'North America';
    case 'LAC':
      return 'LAC';
    case 'EMEA':
      return 'EMEA';
    case 'APJ':
      return 'APJ';
    default:
      return String(theatre).replace('_', ' ');
  }
};
