'use client';

import { useState, useEffect } from 'react';
import { Role } from '../types';

export function useRoles() {
  const [data, setData] = useState<Role[]>();
  const [error, setError] = useState<Error>();
  const [isLoading, setIsLoading] = useState(true);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/roles');
      if (!response.ok) {
        throw new Error('Failed to fetch roles');
      }
      const result = await response.json();
      setData(result.data);
      setError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch roles');
      console.error('Failed to fetch roles:', error);
      setError(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  return {
    data,
    error,
    isLoading,
    mutate: fetchRoles
  };
}
