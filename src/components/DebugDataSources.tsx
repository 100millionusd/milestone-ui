// src/components/DebugDataSources.tsx
'use client';

import React, { useState, useEffect } from 'react';

const DebugDataSources: React.FC = () => {
  const [bidsJsonData, setBidsJsonData] = useState<any>(null);
  const [localStorageData, setLocalStorageData] = useState<any>(null);
  const [sessionStorageData, setSessionStorageData] = useState<any>(null);

  useEffect(() => {
    // Fetch bids.json data
    fetch('/api/debug-bids')
      .then(res => res.json())
      .then(data => setBidsJsonData(data))
      .catch(err => console.error('Error fetching bids.json:', err));

    // Check localStorage
    const localData = localStorage.getItem('bids-data');
    setLocalStorageData(localData ? JSON.parse(localData) : null);

    // Check sessionStorage  
    const sessionData = sessionStorage.getItem('bids-data');
    setSessionStorageData(sessionData ? JSON.parse(sessionData) : null);
  }, []);

  return (
    <div className="bg-yellow-100 p-4 rounded-lg mt-4">
      <h3 className="font-bold mb-2">🔍 Data Source Debug</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h4 className="font-semibold">bids.json</h4>
          <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(bidsJsonData, null, 2)}
          </pre>
        </div>
        
        <div>
          <h4 className="font-semibold">localStorage</h4>
          <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(localStorageData, null, 2)}
          </pre>
        </div>
        
        <div>
          <h4 className="font-semibold">sessionStorage</h4>
          <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(sessionStorageData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default DebugDataSources;