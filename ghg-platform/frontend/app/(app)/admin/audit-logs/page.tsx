'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  user: { fullName: string; email: string } | null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    api.get<AuditLogRow[]>('/audit-logs').then(setLogs);
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-medium">Audit logs</h1>
        <p className="text-sm text-gray-500">Append-only record of who changed what — Admin only</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
              <th className="py-2 font-normal">When</th>
              <th className="py-2 font-normal">Who</th>
              <th className="py-2 font-normal">Action</th>
              <th className="py-2 font-normal">Entity</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-gray-50">
                <td className="py-2 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="py-2">{l.user?.fullName ?? '—'}</td>
                <td className="py-2 capitalize">{l.action}</td>
                <td className="py-2 text-gray-500">{l.entityType}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-gray-400">No activity recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
