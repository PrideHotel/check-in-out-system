import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Clock, History as HistoryIcon, LogOut, Menu, Users, X } from 'lucide-react';

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Check In/Out', icon: Clock },
  { to: '/history', label: 'History', icon: HistoryIcon },
];

const ADMIN_NAV_ITEM = { to: '/admin', label: 'Team Data', icon: Users };

function getInitials(user) {
  const source = user?.displayName || user?.email || '';
  const parts = source.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return 'PH';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function navLinkClass({ isActive }) {
  return [
    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-brand-50 text-brand-900 ring-1 ring-inset ring-brand-100'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');
}

const Header = ({ user, isAdmin, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navItems = isAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      {/* Brand accent line */}
      <div className="h-1 bg-brand-gradient" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 rounded-xl py-1 pr-2">
            <img
              src="/pride-logo.png"
              alt="Pride Hotels &amp; Resorts"
              className="h-9 w-auto"
              width="164"
              height="96"
            />
            <span className="hidden border-l border-slate-200 pl-3 sm:block">
              <span className="block text-sm font-semibold leading-tight text-slate-900">
                Sales Check In/Out
              </span>
              <span className="block text-xs leading-tight text-slate-500">
                Field visit tracker
              </span>
            </span>
          </Link>

          {user && (
            <>
              {/* Desktop navigation */}
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={to === '/'} className={navLinkClass}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </NavLink>
                ))}
              </nav>

              <div className="hidden items-center gap-3 md:flex">
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 py-1.5 pl-1.5 pr-3 ring-1 ring-inset ring-slate-200">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient text-xs font-bold text-white">
                    {getInitials(user)}
                  </span>
                  <span className="max-w-[10rem] truncate text-sm">
                    <span className="block truncate font-medium leading-tight text-slate-900">
                      {user.displayName || 'Sales Executive'}
                    </span>
                    <span className="block truncate text-xs leading-tight text-slate-500">
                      {user.email}
                    </span>
                  </span>
                </div>

                <button type="button" onClick={onLogout} className="btn-secondary">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Logout
                </button>
              </div>

              {/* Mobile menu toggle */}
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="btn-ghost -mr-2 px-2 md:hidden"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {user && menuOpen && (
        <div
          id="mobile-menu"
          className="animate-fade-in border-t border-slate-200 bg-white px-4 py-3 md:hidden"
        >
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-gradient text-xs font-bold text-white">
              {getInitials(user)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {user.displayName || 'Sales Executive'}
              </span>
              <span className="block truncate text-xs text-slate-500">{user.email}</span>
            </span>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={navLinkClass}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <button type="button" onClick={onLogout} className="btn-secondary mt-3 w-full">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;
