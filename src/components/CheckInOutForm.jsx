import React, { useState, useEffect, useRef } from 'react';
import Select from 'react-select'; // For the searchable dropdown
import { Clock } from 'lucide-react';
import { db, auth } from '../firebase.js'; // Assume you export both 'db' and 'auth' from firebase.js
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDocs,
  updateDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // For PDF table generation

//
// 1. Reverse Geocoding Helper (using Nominatim)
//
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

//
// 2. Consistent Date/Time Formatter (24-hour -> "DD-MM-YYYY HH:mm:ss")
//
function formatDateTime(ts) {
  if (!ts) return '';
  let dateObj;
  // If ts is Firestore Timestamp, convert to JS Date
  if (ts.seconds) {
    dateObj = new Date(ts.seconds * 1000);
  } else {
    // If it's already a Date or string
    dateObj = new Date(ts);
  }
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

const CheckInOutForm = () => {
  //
  // State for normal user check-in form
  //
  const [formData, setFormData] = useState({
    name: '',
    location: '',     // we'll store the location string from react-select
    companyName: '',
    checkInTime: '',
    checkOutTime: ''
  });

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [showMessage, setShowMessage] = useState('');

  //
  // Admin states
  //
  const [isAdmin, setIsAdmin] = useState(false);
  const [records, setRecords] = useState([]);       // all check-in records (admin view)
  const [lastDoc, setLastDoc] = useState(null);     // for pagination
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter states for admin
  const [filters, setFilters] = useState({
    date: '',
    companyName: '',
    location: '',
    name: '',
    userId: ''
  });

  //
  // Searchable dropdown for location
  // Instead of a static array, you can define them as needed or fetch from DB.
  // For now, let's just create them from your 'locations' array or user input
  //
  const locationValues = [
    'Ambaji',
    'Bechraji',
    'Bharuch',
    'Bhopal',
    'Canopus',
    'Deoghar',
    'Dwarka',
    'Haldwani',
    'Haridwar',
    'Jaipur',
    'Rajkot'
  ].map(loc => ({ label: loc, value: loc }));

  //
  // Detect if the current user is admin or normal
  //
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Check for admin claim
        user.getIdTokenResult().then((tokenRes) => {
          setIsAdmin(!!tokenRes.claims.admin);
        });
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  //
  // Check if there's an active check-in for the normal user
  //
  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  //
  // If the user has a displayName, auto-fill the name field
  //
  useEffect(() => {
    const user = auth.currentUser;
    if (user && user.displayName) {
      setFormData((prev) => ({ ...prev, name: user.displayName }));
    }
  }, [auth.currentUser]);

  //
  // Real-time subscription for admin or normal user
  // Admin -> see all records with filters, normal -> see only their own
  //
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let q = collection(db, 'check-ins');
    let unsub;

    if (isAdmin) {
      // Admin subscription with filters
      // We won't implement a real-time filter approach with many where() for all fields
      // but let's do a simple approach: date filter, userId, companyName, location, name
      // For advanced usage, you might refetch on filter changes instead of onSnapshot
      const doQuery = async () => {
        let baseQ = query(q, orderBy('checkInTime', 'desc'), limit(10));
        // We can't chain multiple .where() for all filters if some are not set.
        // So let's do a small function that builds the query
        const constraints = [];
        if (filters.userId) {
          constraints.push(where('userId', '==', filters.userId));
        }
        if (filters.name) {
          constraints.push(where('name', '==', filters.name));
        }
        if (filters.companyName) {
          constraints.push(where('companyName', '==', filters.companyName));
        }
        if (filters.location) {
          constraints.push(where('location', '==', filters.location));
        }
        if (filters.date) {
          // filter by date range
          const start = new Date(filters.date);
          start.setHours(0, 0, 0, 0);
          const end = new Date(filters.date);
          end.setHours(23, 59, 59, 999);
          constraints.push(where('checkInTime', '>=', Timestamp.fromDate(start)));
          constraints.push(where('checkInTime', '<=', Timestamp.fromDate(end)));
        }

        if (constraints.length > 0) {
          constraints.forEach((c) => {
            baseQ = query(baseQ, c);
          });
        }
        unsub = onSnapshot(baseQ, (snap) => {
          const dataArr = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setRecords(dataArr);
          setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
        });
      };
      doQuery();
    } else {
      // Normal user subscription
      const userQ = query(q, where('userId', '==', user.uid), orderBy('checkInTime', 'desc'));
      unsub = onSnapshot(userQ, (snap) => {
        const dataArr = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setRecords(dataArr);
      });
    }
    return () => unsub && unsub();
  }, [isAdmin, filters]);

  //
  // Check existing check-in for the current user
  //
  const checkExistingCheckIn = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const qCheck = query(
        collection(db, 'check-ins'),
        where('userId', '==', user.uid),
        where('checkOutTime', '==', '')
      );
      const querySnapshot = await getDocs(qCheck);
      if (!querySnapshot.empty) {
        const activeDoc = querySnapshot.docs[0];
        setCurrentDocId(activeDoc.id);
        setFormData(activeDoc.data());
        setIsCheckedIn(true);
      }
    } catch (error) {
      console.error('Error checking existing check-in:', error);
    }
  };

  //
  // handle input changes for normal user
  //
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  //
  // handle location change from react-select
  //
  const handleLocationChange = (selectedOption) => {
    setFormData((prev) => ({
      ...prev,
      location: selectedOption ? selectedOption.value : ''
    }));
  };

  //
  // 3. Get user device location with higher accuracy for checkInAdd / checkOutAdd
  //
  const getDeviceAddress = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject('Geolocation not supported by this browser.');
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const addressString = await reverseGeocode(latitude, longitude);
          resolve(addressString);
        },
        (error) => {
          console.error('Error getting location:', error);
          reject('User denied or location unavailable.');
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }
      );
    });
  };

  //
  // handle Check-In for normal user
  //
  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }
    try {
      const address = await getDeviceAddress();
      const checkInTime = Timestamp.now(); // store Firestore timestamp
      const checkInData = {
        ...formData,
        checkInTime,
        checkOutTime: null,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        checkInAdd: address,
        checkOutAdd: ''
      };
      const docRef = await addDoc(collection(db, 'check-ins'), checkInData);
      setCurrentDocId(docRef.id);
      setFormData(checkInData);
      setIsCheckedIn(true);
    } catch (error) {
      console.error('Error during check-in:', error);
      alert(error?.message || 'Error during check-in. Location access needed.');
    }
  };

  //
  // handle Check-Out for normal user
  //
  const handleCheckOut = async () => {
    if (!currentDocId) {
      alert('No active check-in found');
      return;
    }
    try {
      const address = await getDeviceAddress();
      const checkOutTime = Timestamp.now();
      await updateDoc(doc(db, 'check-ins', currentDocId), {
        checkOutTime,
        checkOutAdd: address
      });
      setFormData((prev) => ({
        ...prev,
        checkOutTime
      }));
      setIsCheckedIn(false);
      setCurrentDocId(null);
      setShowMessage('Successfully Checked Out!');
      setTimeout(() => {
        setShowMessage('');
        setFormData({
          name: auth.currentUser?.displayName || '',
          location: '',
          companyName: '',
          checkInTime: '',
          checkOutTime: ''
        });
      }, 3000);
    } catch (error) {
      console.error('Error during check-out:', error);
      alert(error?.message || 'Error during check-out. Location access needed.');
    }
  };

  //
  // Admin Dashboard Functions
  //

  // load more for pagination
  const handleLoadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    let baseQ = query(collection(db, 'check-ins'), orderBy('checkInTime', 'desc'), startAfter(lastDoc), limit(10));
    const constraints = [];
    if (filters.userId) {
      constraints.push(where('userId', '==', filters.userId));
    }
    if (filters.name) {
      constraints.push(where('name', '==', filters.name));
    }
    if (filters.companyName) {
      constraints.push(where('companyName', '==', filters.companyName));
    }
    if (filters.location) {
      constraints.push(where('location', '==', filters.location));
    }
    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      constraints.push(where('checkInTime', '>=', Timestamp.fromDate(start)));
      constraints.push(where('checkInTime', '<=', Timestamp.fromDate(end)));
    }
    if (constraints.length > 0) {
      constraints.forEach(c => {
        baseQ = query(baseQ, c);
      });
    }
    const snap = await getDocs(baseQ);
    const newData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setRecords(prev => [...prev, ...newData]);
    setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
    setLoadingMore(false);
  };

  // CSV Export
  const exportCSV = () => {
    if (!records.length) return;
    const headers = ['Name', 'UserEmail', 'UserID', 'CompanyName', 'Location', 'CheckInTime', 'CheckOutTime', 'CheckInAdd', 'CheckOutAdd'];
    let csvContent = headers.join(',') + '\n';
    records.forEach(rec => {
      const row = [
        rec.name || '',
        rec.userEmail || '',
        rec.userId || '',
        rec.companyName || '',
        rec.location || '',
        formatDateTime(rec.checkInTime),
        formatDateTime(rec.checkOutTime),
        rec.checkInAdd || '',
        rec.checkOutAdd || ''
      ];
      // Escape commas by quoting
      const escapedRow = row.map(field => {
        const str = String(field).replace(/"/g, '""');
        return str.includes(',') ? `"${str}"` : str;
      });
      csvContent += escapedRow.join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'checkins.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export
  const exportPDF = () => {
    if (!records.length) return;
    const docPDF = new jsPDF('landscape');
    docPDF.setFontSize(18);
    docPDF.text('Check-In/Out Report', 14, 20);

    const head = [[ 'Name', 'UserEmail', 'UserID', 'CompanyName', 'Location', 'CheckInTime', 'CheckOutTime', 'CheckInAdd', 'CheckOutAdd' ]];
    const body = records.map(rec => [
      rec.name || '',
      rec.userEmail || '',
      rec.userId || '',
      rec.companyName || '',
      rec.location || '',
      formatDateTime(rec.checkInTime),
      formatDateTime(rec.checkOutTime),
      rec.checkInAdd || '',
      rec.checkOutAdd || ''
    ]);
    docPDF.autoTable({
      head,
      body,
      startY: 30,
      theme: 'striped'
    });
    docPDF.save('checkins_report.pdf');
  };

  //
  // Render
  //
  if (isAdmin) {
    // Admin Dashboard
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Admin Dashboard</h2>

        {/* Filter Controls */}
        <div className="flex gap-2 mb-4">
          <input
            type="date"
            value={filters.date}
            onChange={e => setFilters(prev => ({ ...prev, date: e.target.value }))}
            className="border p-1"
          />
          <input
            type="text"
            placeholder="Company Name"
            value={filters.companyName}
            onChange={e => setFilters(prev => ({ ...prev, companyName: e.target.value }))}
            className="border p-1"
          />
          <input
            type="text"
            placeholder="Location"
            value={filters.location}
            onChange={e => setFilters(prev => ({ ...prev, location: e.target.value }))}
            className="border p-1"
          />
          <input
            type="text"
            placeholder="Name"
            value={filters.name}
            onChange={e => setFilters(prev => ({ ...prev, name: e.target.value }))}
            className="border p-1"
          />
          <input
            type="text"
            placeholder="User ID"
            value={filters.userId}
            onChange={e => setFilters(prev => ({ ...prev, userId: e.target.value }))}
            className="border p-1"
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={exportCSV} className="bg-blue-500 text-white px-2 py-1 rounded">
            Export CSV
          </button>
          <button onClick={exportPDF} className="bg-green-500 text-white px-2 py-1 rounded">
            Export PDF
          </button>
        </div>

        <table className="min-w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="border px-2 py-1">Name</th>
              <th className="border px-2 py-1">User Email</th>
              <th className="border px-2 py-1">User ID</th>
              <th className="border px-2 py-1">Company</th>
              <th className="border px-2 py-1">Location</th>
              <th className="border px-2 py-1">Check-In Time</th>
              <th className="border px-2 py-1">Check-Out Time</th>
              <th className="border px-2 py-1">Check-In Address</th>
              <th className="border px-2 py-1">Check-Out Address</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.id}>
                <td className="border px-2 py-1">{rec.name}</td>
                <td className="border px-2 py-1">{rec.userEmail}</td>
                <td className="border px-2 py-1">{rec.userId}</td>
                <td className="border px-2 py-1">{rec.companyName}</td>
                <td className="border px-2 py-1">{rec.location}</td>
                <td className="border px-2 py-1">{formatDateTime(rec.checkInTime)}</td>
                <td className="border px-2 py-1">{formatDateTime(rec.checkOutTime)}</td>
                <td className="border px-2 py-1">{rec.checkInAdd}</td>
                <td className="border px-2 py-1">{rec.checkOutAdd}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {lastDoc && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="mt-4 bg-gray-300 px-2 py-1 rounded"
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>
    );
  } else {
    // Normal User
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
        <div className="flex justify-center mb-6">
          <img src="/pride-logo.png" alt="Pride Hotels & Resorts" className="h-16" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-6">
          Sales Person Check In/Out
        </h2>
        {showMessage && (
          <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-center">
            {showMessage}
          </div>
        )}

        <div className="space-y-4">
          {/* Name (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              readOnly
              className="w-full p-2 border rounded-md bg-gray-50 cursor-not-allowed"
              required
            />
          </div>

          {/* Location (searchable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location *
            </label>
            <Select
              options={locationValues}
              value={locationValues.find(opt => opt.value === formData.location)}
              onChange={handleLocationChange}
              isDisabled={isCheckedIn}
              isSearchable
              placeholder="Select or search location..."
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleInputChange}
              disabled={isCheckedIn}
              className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Check In Time (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check In Time
            </label>
            <input
              type="text"
              value={formatDateTime(formData.checkInTime)}
              readOnly
              className="w-full p-2 border rounded-md bg-gray-50"
            />
          </div>

          {/* Check Out Time (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check Out Time
            </label>
            <input
              type="text"
              value={formatDateTime(formData.checkOutTime)}
              readOnly
              className="w-full p-2 border rounded-md bg-gray-50"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-center space-x-4 mt-6">
            <button
              onClick={handleCheckIn}
              disabled={isCheckedIn}
              className={`flex items-center px-4 py-2 rounded-md ${
                isCheckedIn
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <Clock className="w-4 h-4 mr-2" />
              Check In
            </button>

            <button
              onClick={handleCheckOut}
              disabled={!isCheckedIn}
              className={`flex items-center px-4 py-2 rounded-md ${
                !isCheckedIn
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              <Clock className="w-4 h-4 mr-2" />
              Check Out
            </button>
          </div>
        </div>

        {/* Normal user check-in history */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Your Check-In History</h3>
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">Check In</th>
                <th className="border px-2 py-1">Check Out</th>
                <th className="border px-2 py-1">Location</th>
                <th className="border px-2 py-1">Company</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id}>
                  <td className="border px-2 py-1">{formatDateTime(rec.checkInTime)}</td>
                  <td className="border px-2 py-1">{formatDateTime(rec.checkOutTime)}</td>
                  <td className="border px-2 py-1">{rec.location}</td>
                  <td className="border px-2 py-1">{rec.companyName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
};

export default CheckInOutForm;
