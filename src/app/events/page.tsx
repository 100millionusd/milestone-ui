'use client';

import { useEffect, useState } from 'react';

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${base}/events?limit=100`, { cache: 'no-store' });
        const j = await r.json();
        setEvents(j.events || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [base]);

  return (
    <div className="card">
      <h3>On-chain Events</h3>
      {loading ? <div>Loading…</div> : (
        events.length === 0 ? <div className="muted">No events yet.</div> : (
          <table>
            <thead><tr><th>Block</th><th>Event</th><th>Args</th></tr></thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="mono small">{e.blockNumber}</td>
                  <td>{e.event}</td>
                  <td className="mono small">{JSON.stringify(e.args)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
