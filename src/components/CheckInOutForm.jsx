import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
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
// Example format: "2023-08-23 14:35:12"
function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');   // 24-hour
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const CheckInOutForm = () => {
  const auth = getAuth();

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    companyName: '',
    checkInTime: '',
    checkOutTime: '',
  });

  // Additional fields: checkInAdd, checkOutAdd will be stored in Firestore
  // to track the actual addresses.

  const locations = [
    'Ambaji',
    'Bechraji',
    'Bharuch',
    'Bhopal',
    'Canopus',
    'Deoghar',
    'Dwarka',
    'Haldwani',
    'Haridwar',
    'Rajkot',
  ];

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [showMessage, setShowMessage] = useState('');

  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  useEffect(() => {
    if (auth.currentUser && auth.currentUser.displayName) {
      setFormData((prev) => ({
        ...prev,
        name: auth.currentUser.displayName,
      }));
    }
  }, [auth.currentUser]);

  // Check if there's an active check-in (doc with empty checkOutTime)
  const checkExistingCheckIn = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'check-ins'),
        where('userId', '==', auth.currentUser.uid),
        where('checkOutTime', '==', '')
      );
      const querySnapshot = await getDocs(q);
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

  // Handle input changes (location, companyName, etc.)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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

  // Handle Check-In
  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }
    try {
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
    } catch (error) {
      console.error('Error during check-in:', error);
      alert(error?.message || 'Error during check-in. Location access needed.');
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

      setFormData((prev) => ({
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

        {/* Location dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location *
          </label>
          <select
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            disabled={isCheckedIn}
            className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select Location</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
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
    </div>
  );
};

export default CheckInOutForm;
