import { SalesTheatre } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { ScrollArea } from '@/components/ui/ScrollArea';

interface GeoDistributionData {
  byTheatre: Record<SalesTheatre, number>;
  byRegion: Record<string, { name: string; count: number }>;
  byCountry: Record<string, { name: string; count: number }>;
}

interface GeoDistributionWidgetProps {
  data: GeoDistributionData;
  onFilterChange?: (filter: {
    theatre?: SalesTheatre;
    regionId?: string;
    countryId?: string;
  }) => void;
}

export function GeoDistributionWidget({
  data,
  onFilterChange,
}: GeoDistributionWidgetProps) {
  const formatSalesTheatre = (theatre: SalesTheatre) => {
    switch (theatre) {
      case 'NORTH_AMERICA':
        return 'North America';
      case 'LAC':
        return 'Latin America & Caribbean';
      case 'EMEA':
        return 'EMEA';
      case 'APJ':
        return 'APJ';
      default:
        return theatre;
    }
  };

  const totalPOVs = Object.values(data.byTheatre).reduce((sum, count) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographical Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="theatre" className="space-y-4">
          <TabsList>
            <TabsTrigger value="theatre" className="flex items-center">Theatre</TabsTrigger>
            <TabsTrigger value="region" className="flex items-center">Region</TabsTrigger>
            <TabsTrigger value="country" className="flex items-center">Country</TabsTrigger>
          </TabsList>

          <TabsContent value="theatre">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {Object.entries(data.byTheatre).map(([theatre, count]) => (
                  <button
                    key={theatre}
                    className="w-full p-2 text-left hover:bg-accent rounded-md transition-colors"
                    onClick={() => onFilterChange?.({ theatre: theatre as SalesTheatre })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {formatSalesTheatre(theatre as SalesTheatre)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {count} POVs
                        </span>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(count / totalPOVs) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="region">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {Object.entries(data.byRegion).map(([id, { name, count }]) => (
                  <button
                    key={id}
                    className="w-full p-2 text-left hover:bg-accent rounded-md transition-colors"
                    onClick={() => onFilterChange?.({ regionId: id })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {count} POVs
                        </span>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(count / totalPOVs) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="country">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {Object.entries(data.byCountry).map(([id, { name, count }]) => (
                  <button
                    key={id}
                    className="w-full p-2 text-left hover:bg-accent rounded-md transition-colors"
                    onClick={() => onFilterChange?.({ countryId: id })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {count} POVs
                        </span>
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(count / totalPOVs) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
