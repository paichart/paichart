import { useQuery } from '@tanstack/react-query';
import { ActivePoVStats, TeamStatusData, Milestone, ResourceUsageData, RiskOverviewData, SuccessRateData } from '../types';

interface DashboardData {
  activePoVStats: ActivePoVStats;
  teamStatus: TeamStatusData;
  milestones: Milestone[];
  resourceUsage: ResourceUsageData;
  riskOverview: RiskOverviewData;
  successRate: SuccessRateData;
}

async function fetchDashboardData(widget?: string): Promise<DashboardData | any> {
  console.log('[useDashboardData] Fetching data for widget:', widget || 'all');
  
  try {
    const url = new URL('/api/dashboard', window.location.origin);
    if (widget) {
      url.searchParams.set('widget', widget);
    }

    const response = await fetch(url.toString(), {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });

    // First try to get the response as text
    const responseText = await response.text();
    console.log('[useDashboardData] Raw response:', responseText);

    // Then parse it as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('[useDashboardData] JSON parse error:', e);
      throw new Error('Invalid response format from server');
    }

    if (!response.ok) {
      const errorMessage = responseData?.error || 'Failed to fetch dashboard data';
      console.error('[useDashboardData] Request failed:', errorMessage);
      throw new Error(errorMessage);
    }

    const { data, error } = responseData;
    
    if (error) {
      console.error('[useDashboardData] API error:', error);
      throw new Error(error);
    }

    if (!data) {
      console.error('[useDashboardData] No data in response');
      throw new Error('No data received from API');
    }

    // For individual widget requests, extract the widget data
    if (widget) {
      const widgetKey = widget === 'activePoVs' ? 'activePoVStats' : widget;
      if (!(widgetKey in data)) {
        console.error('[useDashboardData] Widget data not found:', widgetKey);
        throw new Error(`Widget data not found: ${widgetKey}`);
      }
      return data[widgetKey];
    }

    return data;
  } catch (error) {
    console.error('[useDashboardData] Fetch error:', error);
    throw error;
  }
}

export function useDashboardData(widget?: string) {
  return useQuery({
    queryKey: ['dashboard', widget],
    queryFn: () => fetchDashboardData(widget),
    retry: (failureCount, error) => {
      // Don't retry on specific errors
      if (error instanceof Error) {
        // Don't retry on database connection errors
        if (error.message.includes('Too many database connections') ||
            error.message.includes('PrismaClientInitializationError')) {
          console.log('[useDashboardData] Not retrying database error');
          return false;
        }

        // Don't retry on auth errors
        if (error.message.includes('Unauthorized') ||
            error.message.includes('401') ||
            error.message.includes('403')) {
          console.log('[useDashboardData] Not retrying auth error');
          return false;
        }

        // Don't retry on invalid data format
        if (error.message.includes('Invalid response format')) {
          console.log('[useDashboardData] Not retrying format error');
          return false;
        }
      }

      // Retry up to 3 times for other errors
      const shouldRetry = failureCount < 3;
      console.log('[useDashboardData] Retry attempt', failureCount, 'of 3:', shouldRetry);
      return shouldRetry;
    },
    retryDelay: (attemptIndex) => {
      const delay = Math.min(1000 * 2 ** attemptIndex, 30000);
      console.log('[useDashboardData] Retry delay:', delay, 'ms');
      return delay;
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchInterval: 60000, // Refetch every minute
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    throwOnError: true
  });
}
