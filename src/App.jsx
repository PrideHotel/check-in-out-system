import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import './firebase.js';
import CheckInOutForm from './components/CheckInOutForm';
import Login from './components/Login';
import History from './components/History';
import Header from './components/Header';
import { ToastProvider } from './components/ui/Toast';
import { useToast } from './components/ui/toast-context';

function SplashScreen() {
  return (
    <div className="app-backdrop grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/pride-logo.png"
          alt="Pride Hotels &amp; Resorts"
          className="h-14 w-auto animate-fade-in"
        />
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your workspace…
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const auth = getAuth();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Keep the session across reloads instead of dropping back to the login screen.
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, [auth]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('You have been signed out.');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Could not sign you out. Please try again.');
    }
  };

  if (authLoading) return <SplashScreen />;

  const requireAuth = (element) => (user ? element : <Navigate to="/login" replace />);

  return (
    <div className="app-backdrop flex min-h-screen flex-col bg-slate-100">
      <Header user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={requireAuth(<CheckInOutForm user={user} />)} />
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />
          <Route path="/history" element={requireAuth(<History user={user} />)} />
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 py-5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 text-center text-xs text-slate-500 sm:flex-row sm:justify-between sm:text-left">
          <p>
            &copy; {new Date().getFullYear()} Pride Hotels &amp; Resorts. All rights reserved.
          </p>
          <p>Sales Check In/Out Portal</p>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
