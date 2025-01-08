import React, { useState } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

const Login = ({ setIsAuthenticated }) => {
  const [displayName, setDisplayName] = useState(''); // Name field for Sign Up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [showResetMessage, setShowResetMessage] = useState('');
  const navigate = useNavigate();
  const auth = getAuth();

  // Handle Login or Sign Up
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowResetMessage('');

    try {
      if (isLogin) {
        // ---- LOGIN ----
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // ---- SIGN UP ----
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        // Immediately update user profile to include displayName
        await updateProfile(userCredential.user, {
          displayName,
        });
      }
      setIsAuthenticated(true);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(
        isLogin
          ? 'Invalid email or password.'
          : 'Error creating account. Please try again.'
      );
    }
  };

  // Handle Password Reset
  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email to reset password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setShowResetMessage(
        'Password reset email sent! Check your inbox or spam folder.'
      );
    } catch (err) {
      console.error(err);
      setError('Error sending password reset email. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-6">
        {isLogin ? 'Login' : 'Sign Up'}
      </h2>

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {showResetMessage && (
        <div className="mb-4 p-2 bg-green-100 text-green-700 rounded">
          {showResetMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Only show Name field if user is signing up */}
        {!isLogin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              required={!isLogin}
              placeholder="Your Name"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            required
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            required
            placeholder="********"
          />
        </div>

        {/* Forgot Password button only on Login screen */}
        {isLogin && (
          <button
            type="button"
            onClick={handleResetPassword}
            className="text-sm text-blue-500 hover:text-blue-700 underline"
          >
            Forgot Password?
          </button>
        )}

        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 mt-4 rounded-md hover:bg-blue-600"
        >
          {isLogin ? 'Login' : 'Sign Up'}
        </button>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setShowResetMessage('');
            }}
            className="text-blue-500 hover:text-blue-700"
          >
            {isLogin
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Login'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
