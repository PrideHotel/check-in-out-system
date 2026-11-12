import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from './ui/toast-context';
import {
  DEFAULT_RADIUS_KM,
  isValidLocationName,
  loadLocations,
  removeLocation,
  saveLocation,
  useLocations,
} from '../utils/locationStore';

const LOOKUP_TIMEOUT_MS = 8000;

/** Looks a place name up on OpenStreetMap; returns `{ lat, lng, label }` or null. */
async function lookUpPlace(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&accept-language=en' +
      `&q=${encodeURIComponent(name)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Lookup responded ${response.status}`);
    const [best] = await response.json();
    if (!best) return null;
    return { lat: Number(best.lat), lng: Number(best.lon), label: best.display_name || '' };
  } finally {
    clearTimeout(timer);
  }
}

const mapUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

const describeError = (error) =>
  error?.code === 'permission-denied'
    ? 'The database refused this. Publish the latest firestore.rules in the Firebase console, then try again.'
    : 'Could not save. Check your connection and try again.';

/**
 * Add / edit form. `initial` is a location from the store, or null for a new one.
 */
function LocationEditor({ initial, takenNames, onCancel, onSave, saving }) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [lat, setLat] = useState(initial?.point ? String(initial.point.lat) : '');
  const [lng, setLng] = useState(initial?.point ? String(initial.point.lng) : '');
  const [radius, setRadius] = useState(String(initial?.point?.radiusKm ?? DEFAULT_RADIUS_KM));
  const [error, setError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState('');

  const cleanName = name.replace(/\s+/g, ' ').trim();

  const handleLookup = async () => {
    if (!cleanName) {
      setError('Type the location name first.');
      return;
    }
    setError('');
    setLookupNote('');
    setLookingUp(true);
    try {
      const found = await lookUpPlace(cleanName);
      if (!found) {
        setLookupNote('Nothing found for that name. You can type the position in by hand, or leave it empty.');
      } else {
        setLat(found.lat.toFixed(5));
        setLng(found.lng.toFixed(5));
        setLookupNote(`Found: ${found.label}. Check it on the map before saving.`);
      }
    } catch (lookupError) {
      console.warn('Place lookup failed:', lookupError);
      setLookupNote('The lookup service did not answer. You can type the position in by hand, or leave it empty.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (isNew) {
      if (!isValidLocationName(cleanName)) {
        setError(
          'Use 1–40 characters: letters, numbers, spaces and . & ( ) - only, starting with a letter or number.'
        );
        return;
      }
      if (takenNames.some((taken) => taken.toLowerCase() === cleanName.toLowerCase())) {
        setError(`“${cleanName}” is already on the list.`);
        return;
      }
    }

    let point = null;
    if (lat.trim() || lng.trim()) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      const radiusKm = Number(radius);
      if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError('Fill in both latitude and longitude, or leave both empty.');
        return;
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setError('That position is not a real place on the map. Latitude is −90 to 90, longitude −180 to 180.');
        return;
      }
      if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 1000) {
        setError('The allowed distance must be between 1 and 1000 km.');
        return;
      }
      point = { lat: latitude, lng: longitude, radiusKm };
    }

    onSave({ name: isNew ? cleanName : initial.name, point });
  };

  const hasPosition = lat.trim() && lng.trim() && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  return (
    <form onSubmit={handleSubmit} className="card card-pad space-y-4" aria-label={isNew ? 'Add a location' : `Edit ${initial.name}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{isNew ? 'Add a location' : `Edit ${initial.name}`}</h2>
        <button type="button" onClick={onCancel} className="btn-ghost" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label htmlFor="location-name" className="label">
          Name
        </label>
        <input
          id="location-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          readOnly={!isNew}
          maxLength={40}
          className={`input ${isNew ? '' : 'input-readonly'}`}
          placeholder="e.g. Nashik"
          autoFocus={isNew}
        />
        {!isNew && (
          <p className="mt-1.5 text-xs text-slate-500">
            A name cannot be changed once visits may have been logged against it. Hide this one and add a new
            location instead.
          </p>
        )}
      </div>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Position on the map (optional)</legend>
        <p className="text-xs text-slate-500">
          Used only to flag visits recorded far from the location. Without it the location works normally, just
          with no distance check.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="location-lat" className="label">
              Latitude
            </label>
            <input
              id="location-lat"
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              className="input"
              placeholder="19.9975"
            />
          </div>
          <div>
            <label htmlFor="location-lng" className="label">
              Longitude
            </label>
            <input
              id="location-lng"
              type="text"
              inputMode="decimal"
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              className="input"
              placeholder="73.7898"
            />
          </div>
          <div>
            <label htmlFor="location-radius" className="label">
              Allowed distance (km)
            </label>
            <input
              id="location-radius"
              type="text"
              inputMode="decimal"
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
              className="input"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleLookup} disabled={lookingUp} className="btn-secondary">
            {lookingUp ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            Find position from the name
          </button>
          {hasPosition && (
            <a
              href={mapUrl(Number(lat), Number(lng))}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
            >
              Check on the map
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        {lookupNote && <p className="text-xs text-slate-600">{lookupNote}</p>}
      </fieldset>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {isNew ? 'Add location' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

export default function LocationManagement() {
  const toast = useToast();
  const { all, loaded, error } = useLocations();
  const [editing, setEditing] = useState(null); // null | 'new' | location
  const [saving, setSaving] = useState(false);
  const [busyName, setBusyName] = useState('');

  // Always show the latest list when this screen opens.
  useEffect(() => {
    loadLocations({ force: true });
  }, []);

  const run = async (name, action, successMessage) => {
    setBusyName(name);
    try {
      await action();
      toast.success(successMessage);
      return true;
    } catch (actionError) {
      console.error('Location change failed:', actionError);
      toast.error(describeError(actionError), { title: 'Not saved' });
      return false;
    } finally {
      setBusyName('');
    }
  };

  const handleSave = async ({ name, point }) => {
    setSaving(true);
    const existing = editing === 'new' ? null : editing;
    const ok = await run(
      name,
      () => saveLocation(name, { active: existing ? existing.active : true, point }),
      existing ? `${name} updated.` : `${name} added. Salespeople can pick it straight away.`
    );
    setSaving(false);
    if (ok) setEditing(null);
  };

  const toggleActive = (location) =>
    run(
      location.name,
      () =>
        saveLocation(location.name, {
          active: !location.active,
          // Keep a reference point that was set from the app.
          point: location.changed && location.point ? location.point : null,
        }),
      location.active
        ? `${location.name} hidden. Nobody can check in there until you show it again.`
        : `${location.name} is available again.`
    );

  const handleRemove = (location) => {
    const question = location.builtIn
      ? `Reset ${location.name} to its original settings?`
      : `Delete ${location.name}? Past visits keep the name, but nobody can check in there any more.`;
    if (!window.confirm(question)) return;
    run(
      location.name,
      () => removeLocation(location.name),
      location.builtIn ? `${location.name} reset.` : `${location.name} deleted.`
    );
  };

  const activeCount = all.filter((location) => location.active).length;

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
          <p className="text-sm text-slate-500">
            The list salespeople choose from when they check in. {activeCount} available
            {all.length !== activeCount ? `, ${all.length - activeCount} hidden` : ''}.
          </p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing('new')} className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a location
          </button>
        )}
      </div>

      {loaded && error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {error.code === 'permission-denied'
              ? 'Locations cannot be changed yet: publish the latest firestore.rules in the Firebase console, then reload. Until then the built-in list below is in use.'
              : 'Could not load saved changes to the list. The built-in list is shown; reload to try again.'}
          </span>
        </div>
      )}

      {editing !== null && (
        <LocationEditor
          key={editing === 'new' ? 'new' : editing.name}
          initial={editing === 'new' ? null : editing}
          takenNames={all.map((location) => location.name)}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <div className="card overflow-hidden">
        <ul className="divide-y divide-slate-100" aria-label="Locations">
          {all.map((location) => {
            const busy = busyName === location.name;
            return (
              <li key={location.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className={`flex flex-wrap items-center gap-2 font-semibold ${location.active ? 'text-slate-900' : 'text-slate-400'}`}>
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    {location.name}
                    {!location.active && <span className="badge badge-done">Hidden</span>}
                    {!location.builtIn && <span className="badge badge-active">Added</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {location.point ? (
                      <>
                        <a
                          href={mapUrl(location.point.lat, location.point.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="tabular hover:underline"
                        >
                          {location.point.lat.toFixed(4)}, {location.point.lng.toFixed(4)}
                        </a>{' '}
                        · visits beyond {location.point.radiusKm} km are flagged
                      </>
                    ) : (
                      'No position set — distance is not checked'
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => setEditing(location)}
                    disabled={busy}
                    className="btn-ghost"
                    aria-label={`Edit ${location.name}`}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(location)}
                    disabled={busy}
                    className="btn-ghost"
                    aria-label={location.active ? `Hide ${location.name}` : `Show ${location.name}`}
                    title={location.active ? 'Hide from the list' : 'Show in the list'}
                  >
                    {location.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {location.changed && (
                    <button
                      type="button"
                      onClick={() => handleRemove(location)}
                      disabled={busy}
                      className="btn-ghost"
                      aria-label={location.builtIn ? `Reset ${location.name}` : `Delete ${location.name}`}
                      title={location.builtIn ? 'Reset to original' : 'Delete'}
                    >
                      {location.builtIn ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
