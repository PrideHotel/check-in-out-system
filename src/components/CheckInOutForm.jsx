import React, { useState, useEffect, useRef } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  runTransaction
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// 1. Reverse Geocoding Helper (using Nominatim)
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

// 2. Consistent Date/Time Formatter (24-hour format)
// Example format: "23-08-2023 14:35:12"
function getFormattedDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

const CheckInOutForm = () => {
  const auth = getAuth();
  const dropdownRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    companyName: '',
    checkInTime: '',
    checkOutTime: '',
  });

  // Searchable dropdown state
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // UI loading state for processing
  const [isProcessing, setIsProcessing] = useState(false);

  const locations = [
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

  // Filter locations based on search query
  const filteredLocations = locations.filter(location =>
    location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [showMessage, setShowMessage] = useState('');

  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  useEffect(() => {
    if (auth.currentUser?.displayName) {
      setFormData(prev => ({ ...prev, name: auth.currentUser.displayName }));
    }
  }, [auth.currentUser]);

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDropdown]);

  const checkExistingCheckIn = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'check-ins'),
        where('userId', '==', auth.currentUser.uid),
        where('checkOutTime', '==', '')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setCurrentDocId(docSnap.id);
        setFormData(docSnap.data());
        setIsCheckedIn(true);
      }
    } catch (error) {
      console.error('Error checking check-in:', error);
    }
  };

  const handleLocationSelect = (location) => {
    setFormData(prev => ({ ...prev, location }));
    setSearchQuery(location);
    setShowDropdown(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'location') {
      setSearchQuery(value);
      setShowDropdown(true);
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // 3. Get user device location with higher accuracy
  const getDeviceAddress = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject('Geolocation not supported by this browser.');
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          // Try to get textual address
          const addressString = await reverseGeocode(latitude, longitude);
          resolve(addressString);
        },
        (error) => {
          console.error('Error getting location:', error);
          reject('User denied or location unavailable.');
        },
        {
          enableHighAccuracy: true,  // request most accurate
          timeout: 20000,            // 20s
          maximumAge: 0,             // no cached position
        }
      );
    });
  };

  // Handle Check-In with transaction and loading state
  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        // Check for existing active check-in
        const q = query(
          collection(db, 'check-ins'),
          where('userId', '==', auth.currentUser.uid),
          where('checkOutTime', '==', '')
        );
        
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          throw new Error('You have an active check-in. Please check out first.');
        }

        // Proceed with new check-in
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
    } catch (error) {
      console.error('Check-in error:', error);
      alert(error.message || 'Cannot check-in. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Check-Out
  const handleCheckOut = async () => {
    if (!currentDocId) {
      alert('No active check-in found');
      return;
    }
    try {
      const address = await getDeviceAddress();
      const checkOutTime = getFormattedDateTime();

      await updateDoc(doc(db, 'check-ins', currentDocId), {
        checkOutTime,
        checkOutAdd: address,
      });

      setFormData(prev => ({
        ...prev,
        checkOutTime,
      }));

      setIsCheckedIn(false);
      setCurrentDocId(null);
      setShowMessage('Successfully Checked Out!');

      // Reset after 3s
      setTimeout(() => {
        setShowMessage('');
        setFormData({
          name: auth.currentUser?.displayName || '',
          location: '',
          companyName: '',
          checkInTime: '',
          checkOutTime: '',
        });
      }, 3000);
    } catch (error) {
      console.error('Error during check-out:', error);
      alert(error?.message || 'Error during check-out. Location access needed.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-center mb-6">
        <img src="/pride-logo.png" alt="Pride Hotels" className="h-16" />
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

        {/* Location dropdown with click-outside handling */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location *
          </label>
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              name="location"
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={() => setShowDropdown(true)}
              disabled={isCheckedIn}
              className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Search location..."
              required
            />
            {showDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredLocations.map(loc => (
                  <div
                    key={loc}
                    onClick={() => handleLocationSelect(loc)}
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                  >
                    {loc}
                  </div>
                ))}
              </div>
            )}
          </div>
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
            value={formData.checkInTime}
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
            value={formData.checkOutTime}
            readOnly
            className="w-full p-2 border rounded-md bg-gray-50"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-center space-x-4 mt-6">
          <button
            onClick={handleCheckIn}
            disabled={isCheckedIn || isProcessing}
            className={`flex items-center px-4 py-2 rounded-md ${
              isCheckedIn || isProcessing
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </span>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Check In
              </>
            )}
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
    </div>
  );
};

export default CheckInOutForm;
