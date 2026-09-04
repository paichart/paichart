# Frontend Patterns (Production-Tested)

**Created**: 2025-11-02
**Source**: Week 6 POV Team Management implementation
**Confidence**: 95% (production-validated across multiple features)
**Status**: Gold standard patterns extracted from TeamSection.tsx and other CRUD components

---

## Overview

This document captures production-tested frontend patterns for building robust CRUD interfaces in the pAIchart platform. These patterns have been validated across 68+ components and prevent common issues like silent failures, inconsistent error handling, and poor user experience.

**Pattern Categories**:
1. Async Error Handling (prevents silent failures)
2. React Hook Best Practices (useEffect, useState)
3. CRUD Component Patterns (gold standards)
4. Form Submission Patterns (validation, errors, reset)
5. Toast Notification Patterns (consistency, clarity)

**Related Patterns**:
- See `admin-ui-quick-wins-pattern.md` for fast-win implementations of patterns 5 (Toast), plus Event Status Indicators and Clone functionality (98% confidence, Nov 25, 2025)

---

## 1. Async Error Handling Patterns

### 1.1 Double Catch Pattern ⭐⭐⭐ CRITICAL

**Purpose**: Prevent silent failures when React components don't await async handlers

**Problem**: Forms and buttons don't always await async functions, causing promise rejections to be swallowed

**Root Cause** (boundary-contract-specialist finding):
```tsx
// BROKEN - Silent failures
<form onSubmit={handleSubmit}>  // ← Doesn't await the promise!

const handleSubmit = async (e) => {
  try {
    await fetch('/api/...');
  } catch (error) {
    toast({ title: 'Failed' });  // ← This works, but...
  }
};

// If form doesn't await, promise rejection might be swallowed
// User sees error in console but NO toast
```

**Solution**: Double Catch Pattern

```tsx
// ✅ CORRECT - Defense in depth
<form onSubmit={(e) => {
  e.preventDefault();
  handleSubmit(e).catch((err) => {  // ← Layer 2: Promise catch
    console.error('[Component] Uncaught error:', err);
    toast({
      title: 'Operation failed',
      description: err.message || 'An error occurred',
      variant: 'destructive',
    });
  });
}}>

const handleSubmit = async (e) => {
  try {
    const response = await fetch('/api/...');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }
    toast({ title: 'Success' });
  } catch (error: any) {  // ← Layer 1: Try-catch
    console.error('[Component] Error:', error);
    toast({
      title: 'Failed',
      description: error.message,
      variant: 'destructive',
    });
  }
};
```

**Why Two Layers**:
- **Layer 1 (try-catch)**: Handles errors from fetch, JSON parsing, business logic
- **Layer 2 (.catch())**: Safety net for promise rejections if component doesn't await
- **Result**: Errors ALWAYS surface as toasts (no silent failures)

**When to Use**:
- ✅ Form onSubmit handlers
- ✅ Button onClick handlers (delete, confirm, etc.)
- ✅ Select onValueChange handlers (role changes, etc.)
- ✅ Any async user action that should show feedback

**Evidence**: Fixed 3 silent failures in TeamSection.tsx
- handleSubmit (add member) - Line 631
- handleRoleChange (update role) - Line 757
- confirmDelete (remove member) - Line 877

**Specialist**: boundary-contract-specialist identified root cause (Nov 2, 2025)

---

### 1.2 Defense-in-Depth Error Handling ⭐⭐ IMPORTANT

**Purpose**: Multi-layer error handling from backend to UI ensures errors always surface

**The 4 Layers**:

```typescript
// === LAYER 1: Backend Validation ===
// File: /app/api/pov/[povId]/team/members/route.ts
const validation = AddTeamMemberSchema.safeParse(body);
if (!validation.success) {
  return NextResponse.json(
    { error: 'Validation failed: ' + validation.error.errors[0].message },
    { status: 400 }
  );
}

// === LAYER 2: Backend Authorization ===
const authCheck = canManageTeamMembers(user, pov, { operation: 'add' });
if (!authCheck.allowed) {
  return NextResponse.json(
    { error: authCheck.reason },
    { status: 403 }
  );
}

// === LAYER 3: Frontend Try-Catch ===
// File: /components/poveditor/pov/sections/TeamSection.tsx
const handleSubmit = async (e) => {
  try {
    const response = await fetch('/api/...');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);  // ← Surfaces backend error
    }
    toast({ title: 'Success', variant: 'success' });
  } catch (error: any) {
    toast({
      title: 'Failed',
      description: error.message,  // ← Shows user the backend reason
      variant: 'destructive',
    });
  }
};

// === LAYER 4: Frontend Promise Catch (Double Catch) ===
<form onSubmit={(e) => {
  e.preventDefault();
  handleSubmit(e).catch((err) => {  // ← Safety net
    toast({ title: 'Failed', description: err.message });
  });
}}>
```

**Benefits**:
- ✅ Errors caught at every boundary
- ✅ Specific error messages (validation vs authorization vs server)
- ✅ Graceful degradation (if Layer 3 fails, Layer 4 catches)
- ✅ No silent failures
- ✅ Better debugging (console.error at each layer)

**Evidence**: All team management operations use 4-layer pattern

---

## 2. React Hook Best Practices

### 2.1 useEffect Multiple Triggers Pattern ⭐⭐ IMPORTANT

**Purpose**: Trigger same effect from multiple state changes without duplication

**Problem**: Multiple UI states need same data fetch

```tsx
// ❌ WRONG - Code duplication
useEffect(() => {
  if (showForm && povId) {
    fetchAvailableUsers();
  }
}, [showForm, povId]);

useEffect(() => {
  if (showBatchAdd && povId) {
    fetchAvailableUsers();  // ← Duplicated!
  }
}, [showBatchAdd, povId]);
```

**Solution**: OR Logic in Single useEffect

```tsx
// ✅ CORRECT - DRY
useEffect(() => {
  if ((showForm || showBatchAdd) && povId) {  // ← Multiple triggers
    fetchAvailableUsers();
  }
}, [showForm, showBatchAdd, povId]);  // ← Watch both state variables
```

**When to Use**:
- Multiple dialogs/forms sharing same data source
- Multiple buttons/actions triggering same fetch
- Conditional data loading based on multiple states

**Common Pattern**:
```tsx
useEffect(() => {
  if ((stateA || stateB || stateC) && requiredData) {
    fetchSharedData();
  }
}, [stateA, stateB, stateC, requiredData]);
```

**Evidence**: Fixed "Add Multiple" dropdown empty issue (Nov 2, 2025)
- Line 150-154 in TeamSection.tsx
- showForm OR showBatchAdd both trigger fetchAvailableUsers

---

### 2.2 Per-Operation Loading States

**Purpose**: Granular loading feedback for individual operations

**Pattern**:
```tsx
// State for each operation
const [isSubmitting, setIsSubmitting] = useState(false);       // Add operation
const [deletingId, setDeletingId] = useState<string | null>(null);  // Delete (per-item)
const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);  // Update (per-item)

// In handler
const handleSubmit = async () => {
  setIsSubmitting(true);
  try {
    await fetch(...);
  } finally {
    setIsSubmitting(false);
  }
};

// In UI
<Button disabled={isSubmitting}>
  {isSubmitting ? <Loader2 className="animate-spin" /> : 'Add Member'}
</Button>
```

**Why Per-Operation**:
- ✅ User can identify which operation is in progress
- ✅ Multiple operations can be pending simultaneously
- ✅ Prevents double-submission of same operation
- ✅ Better UX (specific loading indicators)

**Evidence**: TeamSection.tsx uses 3 separate loading states

---

## 3. CRUD Component Patterns

### 3.1 Gold Standard: TeamSection.tsx

**File**: `/components/poveditor/pov/sections/TeamSection.tsx` (943 lines)

**What Makes It Gold Standard**:
- ✅ Complete CRUD operations (Create, Read, Update, Delete)
- ✅ Inline editing (Select in table for role changes)
- ✅ Confirmation dialogs (delete confirmation)
- ✅ Bulk operations (batch add dialog)
- ✅ Search/filter functionality
- ✅ Activity history viewer
- ✅ Toast notifications on all operations
- ✅ Loading states per operation
- ✅ Error handling (double catch on all async)
- ✅ Permission checks (owner-only, PROJECT_MANAGER)

**Pattern Breakdown**:

```tsx
// 1. State Management (Comprehensive)
const [items, setItems] = useState<Item[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [selectedItem, setSelectedItem] = useState<string>('');
const [showForm, setShowForm] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);
const [deletingId, setDeletingId] = useState<string | null>(null);
const [updatingId, setUpdatingId] = useState<string | null>(null);

// 2. Fetch on Mount
useEffect(() => {
  if (id) fetchItems();
}, [id]);

// 3. CRUD Operations with Error Handling
const handleCreate = async (e) => {
  setIsSubmitting(true);
  try {
    const response = await fetch('/api/...', { method: 'POST', body: ... });
    if (!response.ok) throw new Error(error.error);
    toast({ title: 'Created', variant: 'success' });
    fetchItems();  // Refresh list
    resetForm();
  } catch (error: any) {
    toast({ title: 'Failed', description: error.message, variant: 'destructive' });
  } finally {
    setIsSubmitting(false);
  }
};

// 4. Inline Editing (No Form Required)
<Select
  value={item.status}
  onValueChange={(newStatus) => {
    handleUpdate(item.id, { status: newStatus }).catch((err) => {
      toast({ title: 'Failed', description: err.message });
    });
  }}
  disabled={!canEdit || updatingId === item.id}
>

// 5. Delete Confirmation Flow
const handleDeleteClick = (item) => {
  setItemToDelete(item);
  setShowDeleteConfirm(true);
};

const confirmDelete = async () => {
  if (!itemToDelete) return;
  setDeletingId(itemToDelete.id);
  setShowDeleteConfirm(false);
  try {
    await fetch(`/api/.../${itemToDelete.id}`, { method: 'DELETE' });
    toast({ title: 'Deleted', variant: 'success' });
    fetchItems();
  } catch (error: any) {
    toast({ title: 'Failed', description: error.message });
  } finally {
    setDeletingId(null);
    setItemToDelete(null);
  }
};
```

**Checklist for New CRUD Components**:
- [ ] State: items, loading, selected, forms, confirmations
- [ ] Fetch on mount with useEffect
- [ ] Create: Form with validation, toast, refresh, reset
- [ ] Update: Inline editing OR form, toast, refresh
- [ ] Delete: Confirmation dialog, toast, refresh
- [ ] Loading states: Per-operation (not global)
- [ ] Error handling: Double catch on all async
- [ ] Toast: On success AND failure
- [ ] Permissions: Check before showing UI controls
- [ ] Accessibility: Proper ARIA labels, keyboard navigation

---

### 3.2 Common CRUD Operations

**List/Table Pattern**:
```tsx
// Filter and display
const filteredItems = items.filter(item =>
  item.name.toLowerCase().includes(searchQuery.toLowerCase())
);

<Table>
  {filteredItems.map(item => (
    <TableRow key={item.id}>
      <TableCell>{item.name}</TableCell>
      <TableCell>
        {/* Inline editing */}
        <Select value={item.status} onValueChange={...} />
      </TableCell>
      <TableCell>
        {canEdit && (
          <Button onClick={() => handleDelete(item.id)} variant="ghost" size="sm">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  ))}
</Table>
```

**Create Pattern**:
```tsx
// Form with validation
<form onSubmit={(e) => {
  e.preventDefault();
  handleSubmit(e).catch((err) => {
    toast({ title: 'Failed', description: err.message });
  });
}}>
  <Input value={name} onChange={(e) => setName(e.target.value)} />
  <Button type="submit" disabled={isSubmitting}>
    {isSubmitting ? <Loader2 className="animate-spin" /> : 'Create'}
  </Button>
</form>
```

**Update Pattern** (Inline):
```tsx
// Inline editing in table (no form needed for simple updates)
<Select
  value={item.role}
  onValueChange={(newRole) => {
    handleRoleChange(item.id, newRole).catch((err) => {
      toast({ title: 'Failed', description: err.message });
      fetchItems();  // Revert UI on error
    });
  }}
  disabled={!canEdit || updatingId === item.id}
>
```

**Delete Pattern** (With Confirmation):
```tsx
// Two-step delete: Confirm dialog → API call
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

// Step 1: Show confirmation
<Button onClick={() => {
  setItemToDelete(item);
  setShowDeleteConfirm(true);
}}>
  Delete
</Button>

// Step 2: Confirm and delete
<Dialog open={showDeleteConfirm}>
  <DialogContent>
    <DialogTitle>Delete {itemToDelete?.name}?</DialogTitle>
    <Button onClick={() => {
      confirmDelete().catch((err) => {
        toast({ title: 'Failed', description: err.message });
      });
    }}>
      Delete
    </Button>
  </DialogContent>
</Dialog>
```

---

## 2. Form Submission Patterns

### 2.1 Client-Side Validation Pattern

**Purpose**: Validate before API call (faster feedback, reduced server load)

```tsx
import { useToast } from '@/lib/hooks/useToast';
import { AddTeamMemberSchema } from '@/lib/validation/team-validation';

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // ✅ Client-side validation with safeParse
  const validation = AddTeamMemberSchema.safeParse({
    userId: selectedUserId,
    role: memberRole,
  });

  if (!validation.success) {
    toast({
      title: 'Validation Error',
      description: validation.error.errors[0].message,
      variant: 'destructive',
    });
    return;  // Stop here, don't call API
  }

  setIsSubmitting(true);

  try {
    const response = await fetch('/api/...', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validation.data),  // ✅ Use validated data
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit');
    }

    toast({ title: 'Success', variant: 'success' });
    resetForm();
  } catch (error: any) {
    toast({
      title: 'Failed',
      description: error.message,
      variant: 'destructive',
    });
  } finally {
    setIsSubmitting(false);
  }
};
```

**Pattern**:
- ✅ Use `.safeParse()` in frontend (NOT `.parse()`)
- ✅ Show validation errors immediately (no API call)
- ✅ Send `validation.data` (pre-validated) to API
- ✅ Backend still validates (defense-in-depth)

**Evidence**: Used in all team management forms (TeamSection.tsx lines 268-280)

---

### 2.2 Form Reset Pattern

**Purpose**: Clear form state after successful submission

```tsx
const resetForm = () => {
  setSelectedUserId('');
  setMemberRole(TeamRole.MEMBER);
  setShowForm(false);
};

const handleSubmit = async (e) => {
  // ... API call

  if (response.ok) {
    toast({ title: 'Success' });
    fetchItems();  // Refresh list
    resetForm();   // ✅ Clear form state
  }
};
```

**Common Reset Actions**:
- Clear input fields
- Reset to default values
- Close dialog/form
- Clear selection state

**Evidence**: Used in TeamSection.tsx (line 257-261, called on line 311)

---

### 2.3 Refresh After Mutation Pattern

**Purpose**: Keep UI synchronized with server state

```tsx
const handleCreate = async (data) => {
  const response = await fetch('/api/...', { method: 'POST', body: data });
  if (response.ok) {
    fetchItems();            // ✅ Refresh main list
    fetchAvailableItems();   // ✅ Refresh related lists
  }
};

const handleDelete = async (id) => {
  const response = await fetch(`/api/.../${id}`, { method: 'DELETE' });
  if (response.ok) {
    fetchItems();            // ✅ Refresh list
    fetchAvailableItems();   // ✅ Other list might be affected
  }
};
```

**When to Refresh**:
- ✅ After CREATE: Refresh list to show new item
- ✅ After UPDATE: Refresh to show changes (or optimistic update)
- ✅ After DELETE: Refresh to remove item
- ✅ Refresh related lists (available users, dependencies, etc.)

**Evidence**: TeamSection.tsx refreshes both `teamMembers` and `availableUsers` after mutations

---

## 3. Toast Notification Patterns

### 3.1 When to Use Toast

**ALWAYS show toast for**:
- ✅ User-initiated actions (create, update, delete)
- ✅ Success feedback (confirm action completed)
- ✅ Error feedback (explain why it failed)
- ✅ Permission denials (403 errors)
- ✅ Validation errors (client-side failures)

**NEVER show toast for**:
- ❌ Background data fetching (polling, auto-refresh)
- ❌ Silent operations (auto-save without user action)
- ❌ Expected state changes (form field updates)

**Evidence**: 23 components in codebase use toasts consistently

---

### 3.2 Toast Consistency Pattern

**Structure**:
```tsx
// Success toast
toast({
  title: 'Team member added',                    // ✅ Past tense, specific
  description: `${name} has been added to the team.`,  // ✅ Details
  variant: 'success',
});

// Error toast
toast({
  title: 'Failed to add team member',            // ✅ Failed to..., specific
  description: error.message,                    // ✅ Backend error reason
  variant: 'destructive',
});

// Validation error toast
toast({
  title: 'Validation Error',                     // ✅ Generic title
  description: validation.error.errors[0].message,  // ✅ Specific validation message
  variant: 'destructive',
});
```

**Title Guidelines**:
- Success: "{Entity} {action-past-tense}" (e.g., "Team member added")
- Error: "Failed to {action}" (e.g., "Failed to add team member")
- Validation: "Validation Error"

**Description Guidelines**:
- Success: Details with names/context
- Error: Backend error message (error.message)
- Validation: Zod error message

**Variants**:
- `'success'` - Green checkmark
- `'destructive'` - Red X (errors)
- `'default'` - Info/neutral

**Evidence**: TeamSection.tsx has 10+ toasts following this pattern

---

### 3.3 Error-Specific Toast Messages

**Pattern**: Different messages for different error types

```tsx
try {
  const response = await fetch('/api/...');

  if (!response.ok) {
    const error = await response.json();

    // Special handling for specific status codes
    if (response.status === 409) {  // Conflict (e.g., has active tasks)
      toast({
        title: 'Cannot remove team member',
        description: error.error,  // Backend provides specific reason
        variant: 'destructive',
      });
      return;  // Don't throw, already handled
    }

    // Generic error for other cases
    throw new Error(error.error || 'Operation failed');
  }

  toast({ title: 'Success', variant: 'success' });
} catch (error: any) {
  // Generic error handler
  toast({
    title: 'Failed',
    description: error.message,
    variant: 'destructive',
  });
}
```

**Common Status Codes**:
- 400: Validation error (show validation.error message)
- 403: Permission denied (show auth.reason)
- 404: Not found (show "Item not found")
- 409: Conflict (show conflict reason - e.g., "Member has active tasks")
- 500: Server error (show generic "Server error occurred")

**Evidence**: TeamSection.tsx line 391-401 (409 handling for active tasks)

---

## 4. Permission-Based UI Pattern

### 4.1 Permission Checks for UI Controls

**Purpose**: Hide/disable controls based on user permissions

```tsx
// Check permissions
const canManageTeam = true;  // Backend enforces, frontend just guides

// Use in UI
{canManageTeam && (
  <Button onClick={() => setShowForm(true)}>
    <UserPlus className="h-4 w-4 mr-2" />
    Add Team Member
  </Button>
)}

// Disable specific actions
<Button
  onClick={handleDelete}
  disabled={!canManageTeam || item.userId === ownerId}
>
  Remove
</Button>
```

**Pattern**: Backend enforces, frontend guides
- ✅ Backend: Authoritative permission check (returns 403)
- ✅ Frontend: Hide/disable buttons (better UX, prevents error)
- ✅ Defense-in-depth: Even if frontend bypassed, backend blocks

**When to Show/Hide**:
- **Hide**: User will NEVER have permission (e.g., non-admin seeing admin-only features)
- **Disable**: User might have permission later (e.g., owner-only while not owner)
- **Show with error**: User should know feature exists (show disabled with tooltip)

**Evidence**: TeamSection.tsx uses permission checks throughout (canManageTeam)

---

### 4.2 Owner Protection Pattern

**Purpose**: Prevent operations on critical entities (owner, self)

```tsx
// Disable operations on owner
<Button
  onClick={() => handleDelete(member.id)}
  disabled={member.userId === povOwnerId}  // ✅ Can't delete owner
>
  Remove
</Button>

<Select
  onValueChange={(role) => handleRoleChange(member.id, role)}
  disabled={member.userId === povOwnerId}  // ✅ Can't change owner role
>

// Show badge for owner
{member.userId === povOwnerId && (
  <Badge variant="outline">Owner</Badge>
)}
```

**Common Protections**:
- ✅ Cannot delete owner
- ✅ Cannot change owner role
- ✅ Cannot change own role (prevents accidents)
- ✅ Visual indicators (badges, tooltips)

**Evidence**: TeamSection.tsx lines 766, 799-801

---

## 5. Data Fetching Patterns

### 5.1 Fetch on Mount Pattern

```tsx
useEffect(() => {
  if (resourceId) {
    fetchData();
  }
}, [resourceId]);

const fetchData = async () => {
  setIsLoading(true);
  try {
    const response = await fetch(`/api/resource/${resourceId}`);
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    setItems(data);
  } catch (error: any) {
    toast({
      title: 'Failed to load data',
      description: error.message,
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
  }
};
```

**Pattern**:
- Check resourceId exists (prevents unnecessary fetch)
- Loading state before fetch
- Toast on error (not on success - auto-loading is expected)
- Finally block ensures loading state cleared

---

### 5.2 Conditional Fetch Pattern

```tsx
// Only fetch when needed (user opens dialog, tab, etc.)
useEffect(() => {
  if (showDialog && resourceId) {
    fetchData();
  }
}, [showDialog, resourceId]);
```

**Use Cases**:
- Dialog opens → Fetch dialog data
- Tab switches → Fetch tab data
- Accordion expands → Fetch section data

**Benefits**:
- ✅ Performance (don't fetch unused data)
- ✅ Fresh data (fetch when actually needed)
- ✅ Reduced API calls

**Evidence**: TeamSection.tsx fetches available users only when form/dialog opens (line 150-154)

---

## 6. Error Message Patterns

### 6.1 Frontend Error Message Sources

**4 Sources of Error Messages**:

```tsx
// Source 1: Client-side validation (Zod)
const validation = Schema.safeParse(data);
if (!validation.success) {
  toast({
    title: 'Validation Error',
    description: validation.error.errors[0].message,  // ← Zod message
  });
}

// Source 2: Backend validation (400)
if (!response.ok && response.status === 400) {
  const error = await response.json();
  throw new Error(error.error);  // ← Backend validation message
}

// Source 3: Backend authorization (403)
if (!response.ok && response.status === 403) {
  const error = await response.json();
  throw new Error(error.error);  // ← Backend authorization message
}

// Source 4: Fallback (catch block)
catch (error: any) {
  toast({
    description: error.message || 'An unexpected error occurred',  // ← Fallback
  });
}
```

**Priority**:
1. Use backend message if available (most specific)
2. Use Zod message for validation (clear field errors)
3. Use fallback for unexpected errors

---

### 6.2 User-Friendly Error Messages

**Transform Technical Errors**:

```tsx
// ❌ BAD - Technical error
toast({ description: 'ERR_NETWORK_FAILURE' });

// ✅ GOOD - User-friendly
toast({ description: 'Unable to connect. Please check your internet connection.' });

// ❌ BAD - Vague
toast({ description: 'Failed' });

// ✅ GOOD - Specific
toast({ description: 'Failed to add team member. User may already be on the team.' });
```

**Pattern**: Backend provides clear messages, frontend passes them through

---

## 7. Loading State Patterns

### 7.1 Granular Loading States

**Pattern**: Per-operation loading, not global

```tsx
// ✅ CORRECT - Know exactly what's loading
const [isLoadingList, setIsLoadingList] = useState(true);        // Initial load
const [isSubmitting, setIsSubmitting] = useState(false);         // Form submission
const [deletingId, setDeletingId] = useState<string | null>(null);  // Per-item delete
const [updatingId, setUpdatingId] = useState<string | null>(null);  // Per-item update

// ❌ WRONG - Too broad
const [isLoading, setIsLoading] = useState(false);  // What's loading?
```

**UI Usage**:
```tsx
// Show spinner on specific button
<Button disabled={isSubmitting}>
  {isSubmitting ? (
    <><Loader2 className="animate-spin mr-2" />Saving...</>
  ) : (
    'Save'
  )}
</Button>

// Show spinner on specific row
<Button disabled={deletingId === item.id}>
  {deletingId === item.id ? (
    <Loader2 className="animate-spin" />
  ) : (
    <Trash2 />
  )}
</Button>
```

**Benefits**:
- ✅ User knows exactly what's happening
- ✅ Can perform other operations while one is loading
- ✅ Clear visual feedback per action

---

## 8. Optimistic Update Pattern (Optional)

**When to Use**: Fast operations where failure is rare

```tsx
// Optimistic update (update UI first, then API)
const handleUpdate = async (id, newData) => {
  // Update UI immediately
  setItems(items.map(item =>
    item.id === id ? { ...item, ...newData } : item
  ));

  try {
    const response = await fetch(`/api/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(newData),
    });

    if (!response.ok) {
      throw new Error('Failed');
    }

    toast({ title: 'Updated', variant: 'success' });
  } catch (error: any) {
    // Revert on failure
    fetchItems();  // ✅ Refresh from server to revert
    toast({
      title: 'Failed to update',
      description: error.message,
      variant: 'destructive',
    });
  }
};
```

**Use With Caution**:
- ✅ Good for: Simple updates (toggle status, change role)
- ⚠️ Risky for: Complex operations, authorization-sensitive actions
- ❌ Don't use for: Deletes (can't easily revert), Creates (no ID yet)

**Alternative**: Simple loading states (Week 6 pattern)
- No optimistic updates
- Show loading spinner
- Refresh after success
- **Simpler, more predictable** (recommended for most cases)

---

## 9. Common Pitfalls and Solutions

### Pitfall 1: Silent Failures ⚠️

**Problem**: Async errors not showing toast

**Solution**: Double catch pattern (see section 1.1)

**Evidence**: Fixed 3 silent failures in Week 6

---

### Pitfall 2: Missing Loading States ⚠️

**Problem**: User clicks multiple times, duplicate operations

**Solution**: Disable buttons during operations

```tsx
<Button
  onClick={handleAction}
  disabled={isSubmitting}  // ✅ Prevent double-click
>
  {isSubmitting ? <Loader2 className="animate-spin" /> : 'Submit'}
</Button>
```

---

### Pitfall 3: Not Refreshing After Mutation ⚠️

**Problem**: UI shows old data after successful operation

**Solution**: Always refresh after mutations

```tsx
if (response.ok) {
  fetchItems();  // ✅ Always refresh
}
```

---

### Pitfall 4: Generic Error Messages ⚠️

**Problem**: User doesn't know why operation failed

**Solution**: Use backend error messages

```tsx
// ✅ Pass through backend message
const error = await response.json();
throw new Error(error.error);  // Backend provides specific reason
```

---

## 10. Component Checklist

**Every CRUD Component Should Have**:

### State Management:
- [ ] Items list state
- [ ] Loading state (per-operation, not global)
- [ ] Selected item state
- [ ] Form visibility states
- [ ] Confirmation dialog states

### Data Fetching:
- [ ] Fetch on mount (useEffect with resourceId dependency)
- [ ] Conditional fetch (when dialog/form opens)
- [ ] Error handling on fetch
- [ ] Toast only on fetch errors (not success)

### CRUD Operations:
- [ ] CREATE: Form with validation, toast, refresh, reset
- [ ] READ: Fetch on mount, loading state, error handling
- [ ] UPDATE: Inline editing OR form, toast, refresh
- [ ] DELETE: Confirmation dialog, toast, refresh

### Error Handling:
- [ ] Client-side validation (safeParse before API call)
- [ ] Double catch on all async handlers
- [ ] Toast on all user-initiated errors
- [ ] Specific error messages (not generic)

### User Experience:
- [ ] Loading spinners on buttons
- [ ] Disable buttons during operations
- [ ] Permission-based show/hide
- [ ] Owner protection (can't delete owner, etc.)
- [ ] Success feedback (toasts)
- [ ] Error feedback (toasts with reasons)

### Accessibility:
- [ ] ARIA labels
- [ ] Keyboard navigation
- [ ] Focus management

---

## Gold Standard Components (Reference)

### TeamSection.tsx (943 lines) ⭐⭐⭐
**File**: `/components/poveditor/pov/sections/TeamSection.tsx`

**Patterns Used**:
- ✅ All 4 async error handling patterns
- ✅ Complete CRUD operations
- ✅ Inline editing (role changes)
- ✅ Confirmation dialogs (delete)
- ✅ Bulk operations (batch add)
- ✅ Search/filter
- ✅ Activity history
- ✅ Permission checks
- ✅ Owner protection
- ✅ Toast notifications (10+)
- ✅ Loading states (3 separate)

**Use as Reference**: When building new CRUD components

---

## Pattern Evolution

**How These Patterns Were Discovered**:

1. **Week 6 Implementation**: Built TeamSection.tsx with team CRUD
2. **User Testing**: Found 3 silent failures (no toast on 403)
3. **boundary-contract Review**: Identified root cause (form doesn't await)
4. **Solution**: Double catch pattern
5. **Applied**: To all 3 async handlers (submit, delete, role change)
6. **Validated**: Production testing confirmed fix
7. **Captured**: In this pattern doc

**Pattern**: Discover → Test → Review → Fix → Validate → Capture

---

## References

**Components Using These Patterns**:
- `/components/poveditor/pov/sections/TeamSection.tsx` - Team CRUD (gold standard)
- `/components/poveditor/pov/sections/TaskSection.tsx` - Task CRUD
- `/components/poveditor/pov/sections/PhaseSection.tsx` - Phase CRUD
- Other *Section.tsx components follow similar patterns

**Specialist Reviews That Found Patterns**:
- boundary-contract-specialist: Silent failure root cause (Nov 2, 2025)
- architectural-review-specialist: DRY violation in team auth (Nov 2, 2025)
- validation-engine-specialist: Client-side validation patterns (Nov 1, 2025)

**Related Docs**:
- `/.claude/knowledge/protocols/boundary-crossing-development-protocol.md` - Full-stack patterns
- `/.claude/knowledge/patterns/security-patterns.md` - Backend security patterns
- `/.claude/knowledge/patterns/api-efficiency-patterns.md` - API optimization patterns

---

**Pattern Doc Version**: 1.0
**Created**: 2025-11-02
**Status**: Production-validated
**Confidence**: 95% (patterns tested across multiple features)
**Next Review**: After Week 7 implementation (validate patterns still apply)
