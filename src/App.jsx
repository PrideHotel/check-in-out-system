import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import CheckInOutForm from './components/CheckInOutForm';
import Login from './components/Login';
import { useState } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-lg">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex justify-between items-center h-16">
              <div>
                {isAuthenticated && (
                  <Link to="/" className="text-gray-700 hover:text-blue-500">Check In/Out</Link>
                )}
              </div>
              <div>
                {!isAuthenticated ? (
                  <Link to="/login" className="text-gray-700 hover:text-blue-500">Login</Link>
                ) : (
                  <button onClick={() => setIsAuthenticated(false)} className="text-gray-700 hover:text-blue-500">
                    Logout
                  </button>
                )}
              </div>
            </div>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-6">
          <Routes>
            <Route 
              path="/" 
              element={isAuthenticated ? <CheckInOutForm /> : <Login setIsAuthenticated={setIsAuthenticated} />} 
            />
            <Route 
              path="/login" 
              element={<Login setIsAuthenticated={setIsAuthenticated} />} 
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;