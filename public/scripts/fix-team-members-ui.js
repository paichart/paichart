/**
 * Script to fix the team members UI
 * 
 * This script adds a fix for the issue where team members are not being
 * displayed in the UI after they are added.
 */

// Function to fix the team members UI
function fixTeamMembersUI() {
  console.log('Applying fix for team members UI...');
  
  // Find the POV editor context
  const editorContext = document.querySelector('[data-editor-context]')?.__EDITOR_CONTEXT__;
  
  if (!editorContext) {
    console.error('Could not find editor context');
    return;
  }
  
  // Store the original updateField function
  const originalUpdateField = editorContext.updateField;
  
  // Replace the updateField function with our enhanced version
  editorContext.updateField = function(path, value) {
    console.log(`[UI FIX] Updating field ${path.join('.')} to:`, value);
    
    // Check if this is a team member update
    if (path[0] === 'data' && (
        path[1] === 'projectManager' || 
        path[1] === 'salesEngineers' || 
        path[1] === 'technicalTeam'
    )) {
      console.log(`[UI FIX] Team member update detected: ${path[1]}`);
      
      // Call the original updateField function
      const result = originalUpdateField(path, value);
      
      // Force a UI update by dispatching a SET_DATA action
      setTimeout(() => {
        console.log('[UI FIX] Forcing UI update...');
        
        // Get the current state
        const { state } = editorContext;
        
        // Create a new data object with the same values
        const newData = { ...state.data };
        
        // Dispatch a SET_DATA action to force a UI update
        editorContext.dispatch({
          type: 'SET_DATA',
          data: newData
        });
        
        // Mark the form as dirty
        editorContext.dispatch({
          type: 'MARK_DIRTY'
        });
        
        console.log('[UI FIX] UI update forced');
      }, 100);
      
      return result;
    }
    
    // Call the original updateField function for other fields
    return originalUpdateField(path, value);
  };
  
  // Find the team members UI component
  const teamMembersUI = document.querySelector('[data-team-members-ui]');
  
  if (teamMembersUI) {
    console.log('[UI FIX] Found team members UI component');
    
    // Force a re-render of the team members UI component
    teamMembersUI.style.display = 'none';
    setTimeout(() => {
      teamMembersUI.style.display = '';
      console.log('[UI FIX] Forced re-render of team members UI component');
    }, 100);
  } else {
    console.warn('[UI FIX] Could not find team members UI component');
  }
  
  // Add a function to manually update the team members UI
  window.updateTeamMembersUI = function() {
    console.log('[UI FIX] Manually updating team members UI...');
    
    // Get the current state
    const { state } = editorContext;
    
    // Log the current team members
    console.log('[UI FIX] Current project manager:', state.data.projectManager);
    console.log('[UI FIX] Current sales engineers:', state.data.salesEngineers);
    console.log('[UI FIX] Current technical team:', state.data.technicalTeam);
    
    // Create a new data object with the same values
    const newData = { ...state.data };
    
    // Dispatch a SET_DATA action to force a UI update
    editorContext.dispatch({
      type: 'SET_DATA',
      data: newData
    });
    
    // Mark the form as dirty
    editorContext.dispatch({
      type: 'MARK_DIRTY'
    });
    
    console.log('[UI FIX] Team members UI updated');
    
    // Find all team member UI elements
    const teamMemberElements = document.querySelectorAll('[data-team-member]');
    
    console.log(`[UI FIX] Found ${teamMemberElements.length} team member elements`);
    
    // Log the team member elements
    teamMemberElements.forEach((element, index) => {
      console.log(`[UI FIX] Team member element ${index}:`, element);
    });
    
    // Find the team members list
    const teamMembersList = document.querySelector('[data-team-members-list]');
    
    if (teamMembersList) {
      console.log('[UI FIX] Found team members list:', teamMembersList);
      
      // Force a re-render of the team members list
      teamMembersList.style.display = 'none';
      setTimeout(() => {
        teamMembersList.style.display = '';
        console.log('[UI FIX] Forced re-render of team members list');
      }, 100);
    } else {
      console.warn('[UI FIX] Could not find team members list');
    }
  };
  
  console.log('Applied fix for team members UI');
  console.log('Use window.updateTeamMembersUI() to manually update the team members UI');
}

// Apply the fix
fixTeamMembersUI();

console.log('Team members UI fix script loaded.');
