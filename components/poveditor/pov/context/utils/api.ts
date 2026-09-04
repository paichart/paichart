/**
 * API functions for interacting with the POV API
 */

/**
 * Fetch POV data from the API
 * @param povId The ID of the POV to fetch
 * @returns The POV data
 */
export async function fetchPovData(povId: string) {
  // Check localStorage first for cached phase template IDs
  let cachedTemplateIds: string[] = [];
  try {
    const cachedData = localStorage.getItem(`phaseTemplates_${povId}`);
    if (cachedData) {
      cachedTemplateIds = JSON.parse(cachedData);
    }
  } catch {
    // Could not read cached phase templates
  }
  
  // Fetch the POV data
  const response = await fetch(`/api/pov/${povId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch POV data');
  }
  
  const povData = await response.json();
  
  // Use cached template IDs if available (for immediate UI response)
  if (cachedTemplateIds.length > 0) {
    povData.phaseTemplateIds = cachedTemplateIds;
  }
  
  // Still fetch from API to ensure data freshness
  try {
    // Fetch the phase templates for this POV
    const phaseTemplatesResponse = await fetch(`/api/pov/${povId}/phase-templates`);
    
    if (phaseTemplatesResponse.ok) {
      const phaseTemplatesData = await phaseTemplatesResponse.json();
      
      // Add the phase template IDs to the POV data
      if (Array.isArray(phaseTemplatesData)) {
        povData.phaseTemplateIds = phaseTemplatesData.map(template => template.id);
      } else if (phaseTemplatesData.phaseTemplateIds) {
        povData.phaseTemplateIds = phaseTemplatesData.phaseTemplateIds;
      }

      // Update the cache with the latest data
      try {
        localStorage.setItem(`phaseTemplates_${povId}`, JSON.stringify(povData.phaseTemplateIds));
      } catch {
        // Could not update cache
      }
    } else {
      // If API fails but we have cached data, use that
      if (cachedTemplateIds.length > 0 && !povData.phaseTemplateIds) {
        povData.phaseTemplateIds = cachedTemplateIds;
      } else {
        povData.phaseTemplateIds = povData.phaseTemplateIds || [];
      }
    }
  } catch {
    // If API fails but we have cached data, use that
    if (cachedTemplateIds.length > 0 && !povData.phaseTemplateIds) {
      povData.phaseTemplateIds = cachedTemplateIds;
    } else {
      povData.phaseTemplateIds = povData.phaseTemplateIds || [];
    }
  }
  
  return povData;
}

/**
 * Save POV data to the API
 * @param povId The ID of the POV to save (undefined for new POVs)
 * @param data The data to save
 * @returns The saved POV data
 */
export async function savePovData(povId: string | undefined, data: any) {
  const url = povId ? `/api/pov/${povId}` : '/api/pov';
  const method = povId ? 'PUT' : 'POST';
  
  // Extract phase template IDs from the data for separate API call
  let phaseTemplateIds: string[] = [];
  
  // Check all possible locations for phase template IDs
  if (data.metadata && data.metadata.phaseTemplates) {
    phaseTemplateIds = [...data.metadata.phaseTemplates];
  } else if (data.phaseTemplateIds && Array.isArray(data.phaseTemplateIds)) {
    phaseTemplateIds = [...data.phaseTemplateIds];
  }

  // Also check localStorage for cached phase template IDs
  try {
    const cacheKey = povId || 'current';
    const cachedData = localStorage.getItem(`phaseTemplates_${cacheKey}`);
    if (cachedData) {
      const cachedIds = JSON.parse(cachedData);
      if (Array.isArray(cachedIds) && cachedIds.length > 0 && phaseTemplateIds.length === 0) {
        phaseTemplateIds = cachedIds;
      }
    }
  } catch {
    // Could not read cached phase templates
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    let errorMessage = 'Failed to save POV data';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // If the response is not JSON, try to get the text
      try {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      } catch {
        // Could not parse error response
      }
    }
    throw new Error(errorMessage);
  }

  // Parse response
  const responseText = await response.text();
  let savedData = {};
  try {
    savedData = responseText ? JSON.parse(responseText) : {};
  } catch {
    // If we can't parse the response, use an empty object
    savedData = {};
  }

  // If the saved data is empty but we have a POV ID, fetch the complete POV data
  if (Object.keys(savedData).length === 0 && povId) {
    try {
      const fetchResponse = await fetch(`/api/pov/${povId}`);
      if (fetchResponse.ok) {
        const fetchedData = await fetchResponse.json();
        savedData = fetchedData;
      }
    } catch {
      // Error fetching complete POV data
    }
  }

  // For new POVs, we need to extract the ID from the saved data
  const newPovId = !povId && savedData && (savedData as any).id ? (savedData as any).id : undefined;

  // If we have phase template IDs and a POV ID (either existing or newly created), save them separately
  if (phaseTemplateIds.length > 0 && (povId || newPovId)) {
    const targetPovId = povId || newPovId;
    try {
      await savePhaseTemplates(targetPovId, phaseTemplateIds);
    } catch {
      // We don't want to fail the entire save operation if just the phase templates fail
      // The user can try saving again or use the recovery tools
    }
  }
  
  return savedData;
}

/**
 * Save phase templates for a POV
 * @param povId The ID of the POV
 * @param phaseTemplateIds The phase template IDs to save
 * @returns The response data
 */
export async function savePhaseTemplates(povId: string, phaseTemplateIds: string[]) {
  // Add retry logic for robustness
  const maxRetries = 3;
  let retryCount = 0;
  let success = false;
  let responseData = null;

  while (retryCount < maxRetries && !success) {
    try {
      const response = await fetch(`/api/pov/${povId}/phase-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phaseTemplateIds }),
      });

      if (!response.ok) {
        // If we get a 500 error, retry
        if (response.status === 500) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
          continue;
        }

        throw new Error(`Failed to save phase templates: ${response.status} ${response.statusText}`);
      }

      responseData = await response.json();
      success = true;
    } catch (fetchError) {
      retryCount++;

      if (retryCount >= maxRetries) {
        // Store the error in localStorage for debugging
        try {
          localStorage.setItem(`phaseTemplatesError_${povId}`, JSON.stringify({
            timestamp: new Date().toISOString(),
            error: fetchError instanceof Error ? fetchError.message : String(fetchError),
            phaseTemplateIds
          }));
        } catch {
          // Could not store error in localStorage
        }
        throw fetchError;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
    }
  }

  return responseData;
}
