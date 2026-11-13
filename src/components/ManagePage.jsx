import { useState } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import UserManagement from './UserManagement';
import LocationManagement from './LocationManagement';

const TABS = [
  { id: 'roles', label: 'Roles & access', icon: ShieldCheck },
  { id: 'locations', label: 'Locations', icon: MapPin },
];

/** SuperAdmin settings: who can see what, and which locations exist. */
export default function ManagePage({ user }) {
  const [tab, setTab] = useState('roles');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div role="tablist" aria-label="Settings" className="flex gap-1 rounded-xl bg-slate-200/70 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`manage-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="manage-panel"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div id="manage-panel" role="tabpanel" aria-labelledby={`manage-tab-${tab}`}>
        {tab === 'roles' ? <UserManagement user={user} /> : <LocationManagement />}
      </div>
    </div>
  );
}
