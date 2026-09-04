/* eslint-disable no-console -- Debug page: console output is the primary UI */
'use client';

import { useEffect, useState } from 'react';

interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
}

interface POV {
  id: string;
  title: string;
  description: string;
  team: Team | null;
  metadata: any;
}

export default function POVDebugPage() {
  const [povs, setPovs] = useState<POV[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPOVs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/pov');
      if (!response.ok) {
        throw new Error('Failed to fetch POVs');
      }
      const data = await response.json();
      console.log('POV data:', data);
      setPovs(data.data || []);
    } catch (err) {
      console.error('Error fetching POVs:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOVs();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">POV Debug Page</h1>
      
      <div className="mb-4">
        <button 
          onClick={fetchPOVs} 
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          {loading ? 'Loading...' : 'Refresh POVs'}
        </button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {povs.length === 0 && !loading && !error && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          No POVs found.
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {povs.map((pov) => (
          <div key={pov.id} className="border rounded-lg shadow-md p-4">
            <div className="border-b pb-2 mb-4">
              <h2 className="text-xl font-bold">{pov.title}</h2>
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">POV Details</h3>
              <p><strong>ID:</strong> {pov.id}</p>
              <p><strong>Description:</strong> {pov.description}</p>
            </div>
            
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Team Information</h3>
              {pov.team ? (
                <div>
                  <p><strong>Team ID:</strong> {pov.team.id}</p>
                  <p><strong>Team Name:</strong> {pov.team.name}</p>
                  <h4 className="text-md font-semibold mt-2 mb-1">Team Members:</h4>
                  {pov.team.members.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {pov.team.members.map((member) => (
                        <li key={member.id}>
                          {member.user.name} ({member.user.email}) - Role: {member.role}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No team members found.</p>
                  )}
                </div>
              ) : (
                <p>No team associated with this POV.</p>
              )}
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-2">Metadata</h3>
              {pov.metadata ? (
                <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
                  {JSON.stringify(pov.metadata, null, 2)}
                </pre>
              ) : (
                <p>No metadata available.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
