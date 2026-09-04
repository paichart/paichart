import { useQuery } from '@tanstack/react-query';

export function useGeographicalDistribution() {
  return useQuery({
    queryKey: ['geographical', 'distribution'],
    queryFn: async () => {
      const response = await fetch('/api/geographical/distribution');
      if (!response.ok) {
        throw new Error('Failed to fetch geographical distribution');
      }
      return response.json();
    },
  });
}
