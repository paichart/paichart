'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useGeographicalDistribution } from '@/lib/hooks/useGeographicalDistribution';
import { GeoDistributionWidget } from '@/components/dashboard/GeoDistributionWidget';

export default function GeoDistribution() {
  const { data: geoData, isLoading, error } = useGeographicalDistribution();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Geographical Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-[200px] text-destructive">
            Failed to load geographical data
          </div>
        ) : geoData ? (
          <GeoDistributionWidget data={geoData} />
        ) : (
          <div className="flex justify-center items-center h-[200px] text-muted-foreground">
            No geographical data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
