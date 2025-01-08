import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { db } from '../firebase.js';
import { collection, addDoc, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const CheckInOutForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    companyName: '',
    checkInTime: '',
    checkOutTime: ''
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
    'Rajkot'
  ];

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [showMessage, setShowMessage] = useState('');
  const auth = getAuth();

  useEffect(() => {
    checkExistingCheckIn();
  }, []);

  const checkExistingCheckIn = async () => {
    if (!auth.currentUser) return;
    
    try {
      const q = query(
        collection(db, "check-ins"),
        where("userId", "==", auth.currentUser.uid),
        where("checkOutTime", "==", "")
      );
      
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        setCurrentDocId(doc.id);
        setFormData(doc.data());
        setIsCheckedIn(true);
      }
    } catch (error) {
      console.error("Error checking existing check-in:", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const getCurrentDateTime = () => {
    return new Date().toLocaleString();
  };

  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName || !formData.location) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      const checkInData = {
        ...formData,
        checkInTime: getCurrentDateTime(),
        checkOutTime: '',
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email
      };

      const docRef = await addDoc(collection(db, "check-ins"), checkInData);
      setCurrentDocId(docRef.id);
      setFormData(checkInData);
      setIsCheckedIn(true);
    } catch (error) {
      console.error("Error during check-in:", error);
      alert('Error during check-in. Please try again.');
    }
  };

  const handleCheckOut = async () => {
    if (!currentDocId) {
      alert('No active check-in found');
      return;
    }

    try {
      const checkOutTime = getCurrentDateTime();
      
      await updateDoc(doc(db, "check-ins", currentDocId), {
        checkOutTime: checkOutTime
      });

      setFormData(prevState => ({
        ...prevState,
        checkOutTime: checkOutTime
      }));
      
      setIsCheckedIn(false);
      setCurrentDocId(null);
      setShowMessage('Successfully Checked Out!');
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setShowMessage('');
        // Reset form
        setFormData({
          name: '',
          location: '',
          companyName: '',
          checkInTime: '',
          checkOutTime: ''
        });
      }, 3000);
    } catch (error) {
      console.error("Error during check-out:", error);
      alert('Error during check-out. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-center mb-6">
        <img 
          src="/pride-logo.png" 
          alt="Pride Hotels & Resorts" 
          className="h-16"
        />
      </div>
      
      <h2 className="text-2xl font-bold text-center mb-6">Sales Person Check In/Out</h2>
      
      {showMessage && (
        <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-center">
          {showMessage}
        </div>
      )}
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            disabled={isCheckedIn}
            className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

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
            {locations.map(location => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </div>

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
