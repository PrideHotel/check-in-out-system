import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClockOff,
  Building2,
  Check,
  ChevronDown,
  Clock,
  History as HistoryIcon,
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
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useToast } from './ui/toast-context';
import { LOCATIONS } from '../constants/locations';
import { getFormattedDateTime, formatStopwatch, shortenAddress } from '../utils/datetime';
import {
  CLOCK_SKEW_ALERT_MINUTES,
  FORGOTTEN_AFTER_HOURS,
  clockSkewMinutes,
  hoursOpen,
  isForgotten,
  isOpen,
  visitEnd,
  visitStart,
} from '../utils/visits';

const GEOCODE_TIMEOUT_MS = 8000;

/**
 * Turns coordinates into a readable address with the public Nominatim
 * service. It is best-effort: the raw coordinates are always stored too, so a
 * slow, failing or rate-limited geocoder never blocks or spoils a check-in —
 * the address is simply left blank.
 */
async function reverseGeocode(lat, lng) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en' +
      `&lat=${lat}&lon=${lng}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);
    const data = await response.json();
    return data.display_name || '';
  } catch (error) {
    console.warn('Reverse geocoding failed; keeping the coordinates only.', error);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** A fresh, high-accuracy GPS reading as `{ lat, lng, accuracy }`. */
function readDevicePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: Math.round(coords.accuracy),
        }),
      (error) => {
        console.error('Error getting location:', error);
        reject(new Error('Location access is required. Please allow location and try again.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

async function capturePosition() {
  const coords = await readDevicePosition();
  const address = await reverseGeocode(coords.lat, coords.lng);
  return { coords, address };
}

/** Date -> the "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const ACTIVE_CHECK_IN_MESSAGE = 'You have an active check-in. Please check out first.';

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
  const [reportingLeave, setReportingLeave] = useState(false);
  const [leftAt, setLeftAt] = useState('');

  const isBusy = isCheckingIn || isCheckingOut;

  // Latest typed text and committed selection, readable from event listeners
  // registered once (the outside-click handler) without going stale.
  const locationStateRef = useRef({ typed: '', selected: '' });
  locationStateRef.current = { typed: searchQuery, selected: formData.location };

  // A location only counts if it is one of the listed properties.
  const hasValidLocation = LOCATIONS.includes(formData.location);

  const filteredLocations = useMemo(() => {
    // Reopening the list after a pick shows every option, not just the one
    // already chosen.
    if (searchQuery === formData.location) return LOCATIONS;
    return LOCATIONS.filter((location) =>
      location.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );
  }, [searchQuery, formData.location]);

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

  // The location is select-only: typing filters the list but never becomes
  // the value. When the field is left, text that exactly names a location
  // (in any letter case) is accepted as that location; anything else is
  // discarded and the field goes back to the last real selection.
  const commitLocationInput = useCallback(() => {
    const { typed, selected } = locationStateRef.current;
    const exact = LOCATIONS.find(
      (location) => location.toLowerCase() === typed.trim().toLowerCase()
    );

    setShowDropdown(false);
    if (exact) {
      setFormData((prev) => ({ ...prev, location: exact }));
      setSearchQuery(exact);
    } else {
      setSearchQuery(selected);
    }
  }, []);

  // Close the location dropdown on outside click / Escape.
  useEffect(() => {
    if (!showDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        commitLocationInput();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown, commitLocationInput]);

  // Keep the highlighted option scrolled into view while arrowing through the list.
  useEffect(() => {
    if (showDropdown) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, showDropdown]);

  const startedAt = visitStart(formData);
  const elapsedMs = startedAt ? now - startedAt.getTime() : 0;
  const forgotten = isCheckedIn && isForgotten(formData, now);

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({ ...prev, location }));
    setSearchQuery(location);
    setShowDropdown(false);
  };

  const handleLocationSearch = (event) => {
    setSearchQuery(event.target.value);
    setShowDropdown(true);
    setActiveIndex(0);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLocationKeyDown = (event) => {
    if (event.key === 'Escape') {
      commitLocationInput();
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

  const handleCheckIn = async () => {
    if (!hasValidLocation) {
      toast.error('Choose your location from the list before checking in.', {
        title: 'Pick a location',
      });
      return;
    }
    const companyName = formData.companyName.trim();
    if (!formData.name || !companyName) {
      toast.error('Fill in your location and the company name before checking in.', {
        title: 'Missing details',
      });
      return;
    }

    setIsCheckingIn(true);
    try {
      const uid = auth.currentUser.uid;

      // Visits opened before the check-in lock existed can only be found by a
      // query, which a transaction cannot run — so check for them up front.
      const open = await getDocs(
        query(
          collection(db, 'check-ins'),
          where('userId', '==', uid),
          where('checkOutTime', '==', '')
        )
      );
      if (!open.empty) throw new Error(ACTIVE_CHECK_IN_MESSAGE);

      // GPS and geocoding are slow and may prompt the user, so they happen
      // before the transaction, which Firestore may retry.
      const { coords, address } = await capturePosition();

      const recordRef = doc(collection(db, 'check-ins'));
      const lockRef = doc(db, 'active', uid);

      // One lock document per person, written in the same transaction as the
      // visit. Two check-ins racing (a double tap, two devices) both try to
      // take the lock and only one can — the security rules refuse a visit
      // whose lock was not taken alongside it.
      await runTransaction(db, async (transaction) => {
        const lock = await transaction.get(lockRef);
        if (lock.exists()) {
          const held = await transaction.get(doc(db, 'check-ins', lock.data().checkInId));
          if (held.exists() && isOpen(held.data())) throw new Error(ACTIVE_CHECK_IN_MESSAGE);
        }

        transaction.set(recordRef, {
          name: formData.name,
          location: formData.location,
          companyName,
          userId: uid,
          userEmail: auth.currentUser.email,
          // The phone's own clock, kept for comparison: the server time below
          // is what counts, and a large gap between the two is flagged.
          checkInTime: getFormattedDateTime(),
          checkInAt: serverTimestamp(),
          checkInAdd: address,
          checkInCoords: coords,
          checkOutTime: '',
          checkOutAdd: '',
        });
        transaction.set(lockRef, { checkInId: recordRef.id, since: serverTimestamp() });
      });

      // Read the visit back so the times shown are the server's.
      const saved = (await getDoc(recordRef)).data();
      setCurrentDocId(recordRef.id);
      setFormData({ ...EMPTY_FORM, ...saved });
      setIsCheckedIn(true);
      toast.success(`Visit at ${companyName} started.`, { title: 'Checked in' });

      const skew = clockSkewMinutes(saved);
      if (skew !== null && Math.abs(skew) >= CLOCK_SKEW_ALERT_MINUTES) {
        toast.info(
          `Your phone's clock is ${Math.abs(skew)} minutes ${skew > 0 ? 'ahead' : 'behind'}. ` +
            'The correct time was recorded — please set your phone to automatic time.',
          { title: 'Phone clock is wrong', duration: 10000 }
        );
      }
    } catch (error) {
      console.error('Check-in error:', error);
      toast.error(error.message || 'Something went wrong during check-in.', {
        title: 'Check-in failed',
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  /**
   * Closes the open visit. With `reportedAt`, the salesperson forgot to check
   * out and is telling us when they really left: the record still gets the
   * server's closing time, the reported time is stored beside it and the
   * visit is marked as a late check-out. No GPS is taken then — they are no
   * longer where the visit happened.
   */
  const performCheckOut = async ({ reportedAt } = {}) => {
    if (!currentDocId) {
      toast.error('No active check-in was found.');
      return;
    }
    setIsCheckingOut(true);
    try {
      const update = {
        checkOutTime: getFormattedDateTime(),
        checkOutAt: serverTimestamp(),
      };

      if (reportedAt) {
        update.reportedCheckOutAt = Timestamp.fromDate(reportedAt);
        update.lateCheckout = true;
      } else {
        const { coords, address } = await capturePosition();
        update.checkOutAdd = address;
        update.checkOutCoords = coords;
      }

      const recordRef = doc(db, 'check-ins', currentDocId);
      const batch = writeBatch(db);
      batch.update(recordRef, update);
      batch.delete(doc(db, 'active', auth.currentUser.uid));
      await batch.commit();

      const saved = (await getDoc(recordRef)).data();
      const company = formData.companyName;
      setFormData({ ...EMPTY_FORM, ...saved });
      setIsCheckedIn(false);
      setCurrentDocId(null);
      setReportingLeave(false);
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

  const handleCheckOut = () => performCheckOut();

  const submitReportedLeave = () => {
    const chosen = leftAt ? new Date(leftAt) : null;
    if (!chosen || Number.isNaN(chosen.getTime())) {
      toast.error('Enter the date and time you left.', { title: 'When did you leave?' });
      return;
    }
    if (startedAt && chosen <= startedAt) {
      toast.error('That is before you checked in.', { title: 'Check the time' });
      return;
    }
    if (chosen.getTime() > Date.now()) {
      toast.error('That time is in the future.', { title: 'Check the time' });
      return;
    }
    performCheckOut({ reportedAt: chosen });
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

        {/* Forgotten check-out */}
        {forgotten && (
          <div className="space-y-3 border-t border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-2.5">
              <AlarmClockOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">
                  You have been checked in for {Math.floor(hoursOpen(formData, now))} hours
                </p>
                <p className="text-amber-800">
                  Did you forget to check out? If you left a while ago, tell us when — otherwise
                  check out now.
                </p>
              </div>
            </div>

            {reportingLeave ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="leftAt" className="label text-amber-900">
                    When did you leave?
                  </label>
                  <input
                    id="leftAt"
                    type="datetime-local"
                    value={leftAt}
                    min={startedAt ? toLocalInputValue(startedAt) : undefined}
                    max={toLocalInputValue(new Date(now))}
                    onChange={(event) => setLeftAt(event.target.value)}
                    className="input"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReportingLeave(false)}
                    disabled={isBusy}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitReportedLeave}
                    disabled={isBusy}
                    className="btn-primary"
                  >
                    {isCheckingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Record check-out
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLeftAt('');
                    setReportingLeave(true);
                  }}
                  disabled={isBusy}
                  className="btn-secondary"
                >
                  <HistoryIcon className="h-4 w-4" aria-hidden="true" />
                  I left earlier…
                </button>
                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={isBusy}
                  className="btn-success"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Check out now
                </button>
              </div>
            )}

            <p className="text-xs text-amber-700">
              Visits open longer than {FORGOTTEN_AFTER_HOURS} hours are highlighted for your
              manager, who can also close them.
            </p>
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
                onChange={handleLocationSearch}
                onFocus={() => setShowDropdown(true)}
                // The input keeps focus after a pick, so focus alone would not
                // reopen the list when it is clicked again.
                onClick={() => setShowDropdown(true)}
                onBlur={(event) => {
                  // Focus moving to the clear button stays inside the field.
                  if (!dropdownRef.current?.contains(event.relatedTarget)) {
                    commitLocationInput();
                  }
                }}
                onKeyDown={handleLocationKeyDown}
                disabled={isCheckedIn || isBusy}
                className="input input-icon pr-16"
                placeholder="Search and pick a location…"
              />

              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
                {searchQuery && !isCheckedIn && !isBusy && (
                  <button
                    type="button"
                    // Out of the tab order: otherwise Tab from the input lands
                    // here, which counts as staying in the field, and typed
                    // text would survive the user leaving.
                    tabIndex={-1}
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
                  // Keep focus in the input while an option is clicked, so the
                  // blur handler does not discard the text before the pick.
                  onMouseDown={(event) => event.preventDefault()}
                  className="absolute z-20 mt-2 max-h-60 w-full animate-scale-in overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card-hover"
                >
                  {filteredLocations.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-slate-500">
                      No location matches “{searchQuery}”.
                      <span className="mt-1 block text-xs text-slate-400">
                        Only the listed locations can be used.
                      </span>
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
                value={startedAt ? getFormattedDateTime(startedAt) : '—'}
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
                value={
                  isOpen(formData) || !visitEnd(formData)
                    ? '—'
                    : `${getFormattedDateTime(visitEnd(formData))}${
                        formData.lateCheckout ? ' (reported)' : ''
                      }`
                }
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
