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

// Example: Basic function to get a textual address from latitude/longitude
// using Nominatim (OpenStreetMap). You can swap it for Google Maps Geocoding, etc.
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch address');
    }
    const data = await response.json();
    // data.display_name often contains the full address
    return data.display_name || `Lat: ${lat}, Lon: ${lon}`;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    // Fallback to lat/long if something fails
    return `Lat: ${lat}, Lon: ${lon}`;
  }
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

  // We’ll store addresses in Firestore fields:
  // - checkInAdd  (Check-in Address)
  // - checkOutAdd (Check-out Address)

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

  // On mount, check if user has an active check-in
  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  // If user has a displayName in Auth, auto-fill the name
  useEffect(() => {
    if (auth.currentUser && auth.currentUser.displayName) {
      setFormData((prev) => ({
        ...prev,
        name: auth.currentUser.displayName,
      }));
    }
  }, [auth.currentUser]);

  // Check Firestore for an existing check-in doc with empty checkOutTime
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
        setFormData(activeDoc.data()); // name, location, etc.
        setIsCheckedIn(true);
      }
    } catch (error) {
      console.error('Error checking existing check-in:', error);
    }
  };

  // General input change handler (except "name" is read-only, but we’ll keep it)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  // Return the current date/time as a string
  const getCurrentDateTime = () => {
    return new Date().toLocaleString();
  };

  // Request user’s device location and return an address string
  const getDeviceAddress = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject('Geolocation not supported by this browser.');
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          // Attempt to get a textual address via reverse geocoding
          const addressString = await reverseGeocode(latitude, longitude);
          resolve(addressString);
        },
        (error) => {
          console.error('Error getting location:', error);
          reject('User denied or location unavailable.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Handle Check In
  const handleCheckIn = async () => {
    // Validate required fields
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      // Prompt for location
      const address = await getDeviceAddress();

      const checkInData = {
        ...formData,
        checkInTime: getCurrentDateTime(),
        checkOutTime: '',
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        // Store check-in address
        'checkInAdd': address,
        // Initialize check-out address as empty string for now
        'checkOutAdd': '',
      };

      const docRef = await addDoc(collection(db, 'check-ins'), checkInData);
      setCurrentDocId(docRef.id);
      setFormData(checkInData);
      setIsCheckedIn(true);
    } catch (error) {
      console.error('Error during check-in:', error);
      alert(error?.message || 'Error during check-in. Please try again.');
    }
  };

  // Handle Check Out
  const handleCheckOut = async () => {
    if (!currentDocId) {
      alert('No active check-in found');
      return;
    }
    try {
      // Prompt for location on check-out
      const address = await getDeviceAddress();
      const checkOutTime = getCurrentDateTime();

      await updateDoc(doc(db, 'check-ins', currentDocId), {
        checkOutTime,
        // Store check-out address
        'checkOutAdd': address,
      });

      setFormData((prevState) => ({
        ...prevState,
        checkOutTime,
      }));

      setIsCheckedIn(false);
      setCurrentDocId(null);
      setShowMessage('Successfully Checked Out!');

      // Clear message after 3 seconds, reset form
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
      alert(error?.message || 'Error during check-out. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <img src="/pride-logo.png" alt="Pride Hotels & Resorts" className="h-16" />
      </div>

      <h2 className="text-2xl font-bold text-center mb-6">
        Sales Person Check In/Out
      </h2>

      {/* Success message */}
      {showMessage && (
        <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-center">
          {showMessage}
        </div>
      )}

      <div className="space-y-4">
        {/* Name field (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
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
