import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { db } from '../firebase.js';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';

const CheckInOutForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    checkInTime: '',
    checkOutTime: ''
  });

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleCheckIn = async () => {
    if (!formData.name || !formData.companyName) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      const now = new Date().toLocaleTimeString();
      const checkInData = {
        name: formData.name,
        companyName: formData.companyName,
        checkInTime: now,
        date: new Date().toLocaleDateString()
      };

      const docRef = await addDoc(collection(db, "check-ins"), checkInData);
      setCurrentDocId(docRef.id);
      
      setFormData(prevState => ({
        ...prevState,
        checkInTime: now
      }));
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
      const now = new Date().toLocaleTimeString();
      
      await updateDoc(doc(db, "check-ins", currentDocId), {
        checkOutTime: now
      });

      setFormData(prevState => ({
        ...prevState,
        checkOutTime: now
      }));
      setIsCheckedIn(false);
      setCurrentDocId(null);
      
      // Reset form after successful check-out
      setTimeout(() => {
        setFormData({
          name: '',
          companyName: '',
          checkInTime: '',
          checkOutTime: ''
        });
      }, 2000);
    } catch (error) {
      console.error("Error during check-out:", error);
      alert('Error during check-out. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-6">Sales Person Check In/Out</h2>
      
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