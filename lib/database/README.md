# Query Mappers - Performance Optimization Framework

This directory contains the query mapper implementation for Phase 1 performance optimization tasks 13-15.

## Overview

The query mappers implement the **includes ’ select + mappers** pattern to optimize database queries by:

1. Using `select` instead of heavy `include` statements
2. Implementing lazy loading with factory patterns
3. Providing strategy-based data expansion
4. Caching frequently accessed relationships

## Files

- `query-mappers.ts` - Main implementation with createTaskMapper, createPOVMapper, createPhaseMapper
- `test-mappers.ts` - Test script demonstrating usage patterns
- `README.md` - This documentation

## Quick Start

```typescript
import { 
  createTaskMapper, 
  createPOVMapper, 
  createPhaseMapper,
  MinimalSelects 
} from '@/lib/database/query-mappers';

// BEFORE: Heavy query
const heavyTasks = await prisma.task.findMany({
  include: { assignee: true, phase: true, dependencies: true }
});

// AFTER: Optimized query
const lightTasks = await prisma.task.findMany({
  select: MinimalSelects.task
});

const taskMappers = createTaskMapperBatch(lightTasks);

// Use only what you need
const basicData = taskMappers.map(m => m.getBasic());
const assignee = await taskMappers[0].getAssignee(); // Lazy loaded
```

## Key Features

### 1. Factory Pattern (createTaskMapper)
- Map minimal task data to full objects on demand
- Lazy loading of assignee, phase, stage, dependencies
- Caching to prevent duplicate queries

### 2. Proxy Pattern (createPOVMapper) 
- Map minimal POV data with lazy relationships
- Owner, team, phases loaded only when needed
- Support for task count aggregation

### 3. Strategy Pattern (createPhaseMapper)
- Map phase data with selective task loading
- Multiple strategies: 'minimal', 'summary', 'full'
- Task summary statistics with aggregation

## Usage Patterns

### Task Optimization
```typescript
// Get minimal data first
const tasks = await prisma.task.findMany({
  select: MinimalSelects.task,
  where: { phaseId: 'some-phase-id' }
});

// Create mappers
const mappers = createTaskMapperBatch(tasks);

// Access patterns:
mappers[0].getBasic()        // Immediate, no queries
await mappers[0].getAssignee()    // Single lazy query
await mappers[0].getExpanded({    // Full expansion
  includeAssignee: true,
  includePhase: true
});
```

### POV with Relationships
```typescript
const povs = await prisma.pOV.findMany({
  select: MinimalSelects.pov
});

const povMappers = createPOVMapperBatch(povs);

// Lazy load relationships
const owner = await povMappers[0].getOwner();
const phases = await povMappers[0].getPhases(true); // With task count
```

### Phase Task Strategies
```typescript
const phases = await prisma.phase.findMany({
  select: MinimalSelects.phase
});

const phaseMappers = createPhaseMapperBatch(phases);

// Different task loading strategies
const minimalTasks = await phaseMappers[0].getTasks('minimal');
const summaryTasks = await phaseMappers[0].getTasks('summary');
const fullTasks = await phaseMappers[0].getTasks('full');

// Or just get statistics
const stats = await phaseMappers[0].getTaskSummary();
```

## Performance Benefits

1. **Reduced Initial Query Time**: Select only essential fields
2. **Memory Efficiency**: Load relationships on demand
3. **Network Optimization**: Fewer fields transferred initially
4. **Caching**: Prevent duplicate queries for same data
5. **Selective Loading**: Load only what's actually used

## Integration with Other Specialists

### For Database-Manager-Specialist
- Use these mappers in your optimized query handlers
- Replace heavy includes with select + mappers pattern
- Monitor query performance improvements

### For Performance-Analyst-Specialist
- Measure before/after performance with test script
- Use these patterns in other query optimizations
- Extend mappers for additional entity types

### For API Handlers
```typescript
// In your API route handlers
import { createTaskMapperBatch, MinimalSelects } from '@/lib/database/query-mappers';

export async function GET(req: NextRequest) {
  // Get minimal data
  const tasks = await prisma.task.findMany({
    select: MinimalSelects.task,
    where: buildWhereClause(req)
  });

  // Create mappers
  const mappers = createTaskMapperBatch(tasks);

  // Return basic data for list views
  if (req.nextUrl.searchParams.get('view') === 'list') {
    return NextResponse.json({
      data: mappers.map(m => m.getBasic())
    });
  }

  // Or expand specific tasks for detail views
  const expanded = await Promise.all(
    mappers.slice(0, 10).map(m => m.getExpanded({
      includeAssignee: true,
      includePhase: true
    }))
  );

  return NextResponse.json({ data: expanded });
}
```

## Testing

Run the test script to see performance comparisons:

```bash
npx tsx lib/database/test-mappers.ts
```

## Extension Points

The mappers are designed to be extensible:

1. **Add New Entity Types**: Follow the same patterns for User, Team, etc.
2. **Custom Strategies**: Add new task loading strategies as needed
3. **Additional Relationships**: Extend mapper options for new fields
4. **Caching Layers**: Add Redis or in-memory caching to mappers

## Coordination with Phase 1 Tasks

These mappers support the other Phase 1 optimization tasks:

- **Tasks 1-3**: Dashboard optimizations can use POV and Phase mappers
- **Tasks 4-6**: Task list optimizations use Task mappers with strategies  
- **Tasks 7-9**: Detail view optimizations use selective expansion
- **Tasks 10-12**: API response optimizations use basic vs expanded patterns
- **Tasks 16-18**: Future caching layers can integrate with mapper caching

## Best Practices

1. **Start with MinimalSelects**: Always query minimal data first
2. **Lazy Load Selectively**: Only load relationships that are actually used
3. **Use Appropriate Strategies**: Choose minimal/summary/full based on UI needs
4. **Batch Operations**: Use batch functions for multiple items
5. **Cache Judiciously**: Mappers include caching, don't over-cache
6. **Monitor Performance**: Use timing functions to measure improvements

## Implementation Status

 **Task 13**: createTaskMapper() with factory pattern - COMPLETE
 **Task 14**: createPOVMapper() with proxy pattern - COMPLETE  
 **Task 15**: createPhaseMapper() with strategy pattern - COMPLETE

The mappers are ready for use by other specialists in their optimization work.