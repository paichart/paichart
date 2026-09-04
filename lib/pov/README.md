# POV Module

This module handles all POV (Point of View) related functionality, including POV management, phases, and team collaboration.

## Architecture

The module follows a layered architecture:

### Types (`/types`)
- `core.ts` - Core domain types and enums
- `requests.ts` - Request/response types for API endpoints

### Prisma Layer (`/prisma`)
- `select.ts` - Prisma select objects and response types
- `mappers.ts` - Functions to map between Prisma and domain types

### Services (`/services`)
- `activity.ts` - Activity logging for POV operations
- `metadata.ts` - POV metadata management
- `team.ts` - Team management functionality
- `validation.ts` - Business rule validation

### Handlers (`/handlers`)
- `get.ts` - GET request handlers
- `post.ts` - POST request handlers
- `put.ts` - PUT request handlers
- `delete.ts` - DELETE request handlers

## API Endpoints

### POV Operations
- `GET /api/pov` - List POVs with filtering and pagination
- `POST /api/pov` - Create a new POV
- `GET /api/pov/[povId]` - Get POV details
- `PUT /api/pov/[povId]` - Update POV
- `DELETE /api/pov/[povId]` - Delete POV

### Phase Operations
- `POST /api/pov/[povId]/phase` - Create a new phase
- `PUT /api/pov/[povId]/phase/[phaseId]` - Update phase
- `DELETE /api/pov/[povId]/phase/[phaseId]` - Delete phase
- `PUT /api/pov/[povId]/phase/reorder` - Reorder phases
- `POST /api/pov/[povId]/phase/multiple` - Delete multiple phases

## Usage Examples

### Creating a POV

```typescript
const response = await createPOVHandler(req, {
  title: "New POV",
  description: "POV description",
  status: POVStatus.DRAFT,
  priority: Priority.MEDIUM,
  startDate: new Date(),
  endDate: new Date(),
  metadata: {
    customer: "Customer Name",
    teamSize: "5",
    successCriteria: "Success criteria",
    technicalRequirements: "Technical requirements"
  }
});
```

### Adding a Phase

```typescript
const response = await createPhaseHandler(req, povId, {
  name: "Planning Phase",
  description: "Initial planning phase",
  type: PhaseType.PLANNING,
  startDate: new Date(),
  endDate: new Date()
});
```

### Reordering Phases

```typescript
await reorderPhasesHandler(req, povId, [
  { id: "phase1", order: 0 },
  { id: "phase2", order: 1 },
  { id: "phase3", order: 2 }
]);
```

## Error Handling

All handlers use consistent error handling:
- Business rule violations return 400 status
- Not found errors return 404 status
- Permission errors return 403 status
- Server errors return 500 status

Errors include descriptive messages to help identify the issue.

## Validation

The module includes comprehensive validation:
- Input validation using request schemas
- Business rule validation (e.g., date ranges, status transitions)
- Permission checks for all operations
- Data integrity validation (e.g., phase ordering)

## Activity Logging

All significant operations are logged:
- POV creation/updates/deletion
- Phase changes
- Team member changes
- Status changes
- Metadata updates

## Team Management

The module handles team collaboration:
- Automatic team creation with POV
- Team member management
- Role-based permissions
- Team activity tracking
