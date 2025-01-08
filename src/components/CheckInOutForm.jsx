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

const CheckInOutForm = () => {
  const auth = getAuth();

  // State for form fields
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    companyName: '',
    checkInTime: '',
    checkOutTime: '',
  });

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

  // State to track whether the user is currently checked in
  const [isCheckedIn, setIsCheckedIn] = useState(false);

  // Firestore document ID to update on check-out
  const [currentDocId, setCurrentDocId] = useState(null);

  // Success message after check-out
  const [showMessage, setShowMessage] = useState('');

  // On component mount, check if user already has an active check-in
  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  // Also, whenever we have a currentUser, auto-fill the Name field
  useEffect(() => {
    if (auth.currentUser && auth.currentUser.displayName) {
      // Populate the name from auth user’s displayName
      setFormData((prev) => ({
        ...prev,
        name: auth.currentUser.displayName,
      }));
    }
  }, [auth.currentUser]);

  // Check Firestore if user is already checked in (no checkOutTime)
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

  // Handle field changes (except "name" since it's read-only)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // If you really want to block edits to name in code, you could do:
    // if (name === 'name') return;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  // Format date & time together
  const getCurrentDateTime = () => {
    return new Date().toLocaleString();
  };

  // Handle Check-In
  const handleCheckIn = async () => {
    // Make sure required fields are filled
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      // Build the check-in object
      const checkInData = {
        ...formData,
        checkInTime: getCurrentDateTime(),
        checkOutTime: '',
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
      };

      // Add to Firestore
      const docRef = await addDoc(collection(db, 'check-ins'), checkInData);

      setCurrentDocId(docRef.id);
      setFormData(checkInData);
      setIsCheckedIn(true);
    } catch (error) {
      console.error('Error during check-in:', error);
      alert('Error during check-in. Please try again.');
    }
  };

  // Handle Check-Out
  const handleCheckOut = async () => {
    if (!currentDocId) {
      alert('No active check-in found.');
      return;
    }

    try {
      const checkOutTime = getCurrentDateTime();

      // Update existing doc with checkOutTime
      await updateDoc(doc(db, 'check-ins', currentDocId), {
        checkOutTime,
      });

      // Update local state
      setFormData((prevState) => ({
        ...prevState,
        checkOutTime,
      }));

      setIsCheckedIn(false);
      setCurrentDocId(null);
      setShowMessage('Successfully Checked Out!');

      // Clear message after 3 seconds and reset form
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
      alert('Error during check-out. Please try again.');
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

      {/* Show success message on check-out */}
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
            readOnly // or disabled if you prefer
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

        {/* Check In Time */}
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

        {/* Check Out Time */}
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
