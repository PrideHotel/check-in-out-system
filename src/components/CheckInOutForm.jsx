import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  runTransaction,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useToast } from './ui/toast-context';
import {
  getFormattedDateTime,
  parseFormattedDateTime,
  formatStopwatch,
  shortenAddress,
} from '../utils/datetime';

const LOCATIONS = [
  'Alkapuri',
  'Ambaji',
  'Becharaji',
  'Bharuch',
  'Bhopal',
  'Canopus',
  'Daman',
  'Deoghar',
  'Digha',
  'Dwarka',
  'Goa',
  'Haldwani',
  'Haridwar',
  'Indore',
  'Jaipur',
  'Manjusar',
  'Mussoorie',
  'Phaltan',
  'Puri',
  'Rajkot',
  'Ranakpur',
  'Udaipur',
];

// Reverse geocoding helper (Nominatim).
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch address');
    }
    const data = await response.json();
    return data.display_name || `Lat: ${lat}, Lon: ${lon}`;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return `Lat: ${lat}, Lon: ${lon}`;
  }
}

const EMPTY_FORM = {
  name: '',
  location: '',
  companyName: '',
  checkInTime: '',
  checkOutTime: '',
  checkInAdd: '',
  checkOutAdd: '',
};

const CheckInOutForm = () => {
  const auth = getAuth();
  const toast = useToast();
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const isBusy = isCheckingIn || isCheckingOut;

  const filteredLocations = useMemo(
    () =>
      LOCATIONS.filter((location) =>
        location.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [searchQuery]
  );

  const checkExistingCheckIn = useCallback(async () => {
    if (!auth.currentUser) {
      setIsLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'check-ins'),
        where('userId', '==', auth.currentUser.uid),
        where('checkOutTime', '==', '')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        setCurrentDocId(docSnap.id);
        setFormData({
          ...EMPTY_FORM,
          ...data,
          name: data.name || auth.currentUser.displayName || '',
        });
        // Keep the visible location field in sync with the restored record.
        setSearchQuery(data.location || '');
        setIsCheckedIn(true);
      } else {
        setFormData((prev) => ({
          ...EMPTY_FORM,
          name: prev.name || auth.currentUser.displayName || '',
        }));
      }
    } catch (error) {
      console.error('Error checking check-in:', error);
      toast.error('Could not load your current status. Pull down to refresh.');
    } finally {
      setIsLoading(false);
    }
  }, [auth, toast]);

  useEffect(() => {
    checkExistingCheckIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auth.currentUser?.displayName) {
      setFormData((prev) => ({ ...prev, name: prev.name || auth.currentUser.displayName }));
    }
  }, [auth.currentUser]);

  // Live clock — drives both the header time and the on-site stopwatch.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close the location dropdown on outside click / Escape.
  useEffect(() => {
    if (!showDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Keep the highlighted option scrolled into view while arrowing through the list.
  useEffect(() => {
    if (showDropdown) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, showDropdown]);

  const elapsedMs = useMemo(() => {
    const start = parseFormattedDateTime(formData.checkInTime);
    return start ? now - start.getTime() : 0;
  }, [formData.checkInTime, now]);

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({ ...prev, location }));
    setSearchQuery(location);
    setShowDropdown(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'location') {
      setSearchQuery(value);
      setShowDropdown(true);
      setActiveIndex(0);
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationKeyDown = (event) => {
    if (event.key === 'Escape') {
      setShowDropdown(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!showDropdown) {
        setShowDropdown(true);
        return;
      }
      if (filteredLocations.length === 0) return;
      setActiveIndex((index) => {
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        return (next + filteredLocations.length) % filteredLocations.length;
      });
      return;
    }
    if (event.key === 'Enter' && showDropdown && filteredLocations[activeIndex]) {
      event.preventDefault();
      handleLocationSelect(filteredLocations[activeIndex]);
    }
  };

  const clearLocation = () => {
    setFormData((prev) => ({ ...prev, location: '' }));
    setSearchQuery('');
    setActiveIndex(0);
    setShowDropdown(true);
  };

  // Device location, resolved to a human-readable address.
  const getDeviceAddress = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation is not supported by this browser.'));
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          resolve(await reverseGeocode(latitude, longitude));
        },
        (error) => {
          console.error('Error getting location:', error);
          reject(new Error('Location access is required. Please allow location and try again.'));
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }
      );
    });
  };

  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName || !formData.location) {
      toast.error('Fill in your location and the company name before checking in.', {
        title: 'Missing details',
      });
      return;
    }
    setIsCheckingIn(true);
    try {
      await runTransaction(db, async () => {
        const q = query(
          collection(db, 'check-ins'),
          where('userId', '==', auth.currentUser.uid),
          where('checkOutTime', '==', '')
        );

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          throw new Error('You have an active check-in. Please check out first.');
        }

        const address = await getDeviceAddress();
        const checkInTime = getFormattedDateTime();

        const checkInData = {
          ...formData,
          checkInTime,
          checkOutTime: '',
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          checkInAdd: address,
          checkOutAdd: '',
        };

        const docRef = await addDoc(collection(db, 'check-ins'), checkInData);
        setCurrentDocId(docRef.id);
        setFormData(checkInData);
        setIsCheckedIn(true);
      });
      toast.success(`Visit at ${formData.companyName} started.`, { title: 'Checked in' });
    } catch (error) {
      console.error('Check-in error:', error);
      toast.error(error.message || 'Something went wrong during check-in.', {
        title: 'Check-in failed',
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!currentDocId) {
      toast.error('No active check-in was found.');
      return;
    }
    setIsCheckingOut(true);
    try {
      const address = await getDeviceAddress();
      const checkOutTime = getFormattedDateTime();

      await updateDoc(doc(db, 'check-ins', currentDocId), {
        checkOutTime,
        checkOutAdd: address,
      });

      const company = formData.companyName;
      setFormData((prev) => ({ ...prev, checkOutTime, checkOutAdd: address }));
      setIsCheckedIn(false);
      setCurrentDocId(null);
      toast.success(`Visit at ${company} recorded.`, { title: 'Checked out' });

      // Give the user a moment to read the completed record, then reset the form.
      setTimeout(() => {
        setFormData({ ...EMPTY_FORM, name: auth.currentUser?.displayName || '' });
        setSearchQuery('');
      }, 4000);
    } catch (error) {
      console.error('Error during check-out:', error);
      toast.error(error?.message || 'Something went wrong during check-out.', {
        title: 'Check-out failed',
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const clockLabel = new Date(now).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateLabel = new Date(now).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="mx-auto w-full max-w-xl animate-fade-in-up space-y-5">
      {/* Status banner */}
      <section
        className={`card overflow-hidden ${isCheckedIn ? 'ring-1 ring-emerald-200' : ''}`}
        aria-live="polite"
      >
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                isCheckedIn
                  ? 'animate-pulse-ring bg-emerald-50 text-emerald-600'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Clock className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Current status
              </p>
              {isLoading ? (
                <span className="mt-1 block h-5 w-32 skeleton" />
              ) : isCheckedIn ? (
                <p className="text-base font-bold text-emerald-700">
                  On site at {formData.companyName || 'client'}
                </p>
              ) : (
                <p className="text-base font-bold text-slate-800">Ready to check in</p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            {isCheckedIn ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Time on site
                </p>
                <p className="tabular text-2xl font-bold text-slate-900">
                  {formatStopwatch(elapsedMs)}
                </p>
              </>
            ) : (
              <>
                <p className="tabular text-2xl font-bold text-slate-900">{clockLabel}</p>
                <p className="text-xs text-slate-500">{dateLabel}</p>
              </>
            )}
          </div>
        </div>

        {isCheckedIn && formData.checkInAdd && (
          <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
            <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
            <span title={formData.checkInAdd}>
              Checked in from {shortenAddress(formData.checkInAdd, 4)}
            </span>
          </div>
        )}
      </section>

      {/* Visit details */}
      <section className="card">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
          <h1 className="text-lg font-bold text-slate-900">Visit details</h1>
          <p className="text-sm text-slate-500">
            Confirm where you are before recording your visit.
          </p>
        </div>

        <div className="card-pad space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="label">
              <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Sales person
            </label>
            <div className="relative">
              <UserRound className="field-icon" aria-hidden="true" />
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                readOnly
                className="input input-icon input-readonly"
              />
            </div>
          </div>

          {/* Location combobox */}
          <div>
            <label htmlFor="location" className="label">
              <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Location <span className="text-brand-700">*</span>
            </label>
            <div className="relative" ref={dropdownRef}>
              <Search className="field-icon" aria-hidden="true" />
              <input
                id="location"
                type="text"
                name="location"
                role="combobox"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
                aria-controls="location-listbox"
                autoComplete="off"
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleLocationKeyDown}
                disabled={isCheckedIn || isBusy}
                className="input input-icon pr-16"
                placeholder="Search location…"
              />

              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
                {searchQuery && !isCheckedIn && !isBusy && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Clear location"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    showDropdown ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </div>

              {showDropdown && !isCheckedIn && (
                <ul
                  id="location-listbox"
                  role="listbox"
                  className="absolute z-20 mt-2 max-h-60 w-full animate-scale-in overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card-hover"
                >
                  {filteredLocations.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-slate-500">
                      No location matches “{searchQuery}”.
                    </li>
                  )}
                  {filteredLocations.map((loc, index) => {
                    const isSelected = formData.location === loc;
                    return (
                      <li
                        key={loc}
                        ref={(node) => {
                          optionRefs.current[index] = node;
                        }}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleLocationSelect(loc)}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                          index === activeIndex
                            ? 'bg-brand-50 text-brand-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          {loc}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-brand-700" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Company */}
          <div>
            <label htmlFor="companyName" className="label">
              <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              Company name <span className="text-brand-700">*</span>
            </label>
            <div className="relative">
              <Building2 className="field-icon" aria-hidden="true" />
              <input
                id="companyName"
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                disabled={isCheckedIn || isBusy}
                className="input input-icon"
                placeholder="Company you are visiting"
              />
            </div>
          </div>

          {/* Times */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="checkInTime" className="label">
                <LogIn className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Check in time
              </label>
              <input
                id="checkInTime"
                type="text"
                value={formData.checkInTime || '—'}
                readOnly
                className="input input-readonly tabular"
              />
            </div>
            <div>
              <label htmlFor="checkOutTime" className="label">
                <LogOut className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Check out time
              </label>
              <input
                id="checkOutTime"
                type="text"
                value={formData.checkOutTime || '—'}
                readOnly
                className="input input-readonly tabular"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={isCheckedIn || isBusy || isLoading}
              className={isCheckedIn || isBusy || isLoading ? 'btn-disabled py-3' : 'btn-primary py-3'}
            >
              {isCheckingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Getting location…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Check In
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCheckOut}
              disabled={!isCheckedIn || isBusy}
              className={!isCheckedIn || isBusy ? 'btn-disabled py-3' : 'btn-success py-3'}
            >
              {isCheckingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Getting location…
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Check Out
                </>
              )}
            </button>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            Your device location is captured at both check-in and check-out, so keep location access
            enabled.
          </p>
        </div>
      </section>
    </div>
  );
};

export default CheckInOutForm;
