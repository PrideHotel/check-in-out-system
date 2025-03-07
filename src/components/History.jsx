import React, { useState, useEffect } from 'react';
import { db } from '../firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Link } from 'react-router-dom';

const History = () => {
  const auth = getAuth();
  const [records, setRecords] = useState([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setError('');
      if (!auth.currentUser) return;
      
      try {
        const q = query(
          collection(db, 'check-ins'),
          where('userId', '==', auth.currentUser.uid)
        );
        
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setRecords(data);
      } catch (error) {
        console.error('Error fetching records:', error);
        setError('Failed to load data - check permissions or try again later.');
      }
    };

    fetchData();
  }, [auth.currentUser]);

  const filteredRecords = records.filter(record => {
    const matchesCompany = record.companyName.toLowerCase().includes(companyFilter.toLowerCase());
    const recordDate = record.checkInTime.split(' ')[0];
    const matchesDate = dateFilter ? recordDate === dateFilter.split('-').reverse().join('-') : true;
    
    return matchesCompany && matchesDate;
  });

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Check-In History</h2>
        <Link to="/" className="text-blue-500 hover:text-blue-700">
          &larr; Back to Check In/Out
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Filter by Company Name
          </label>
          <input
            type="text"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="Search company..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Filter by Check-In Date
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full p-2 border rounded-md"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-In</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-Out</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRecords.map(record => (
              <tr key={record.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.companyName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.location}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.checkInTime}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {record.checkOutTime || 'Not checked out'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {record.checkInAdd.split(',').slice(0, 3).join(', ')}
                </td>
              </tr>
            ))}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default History;
