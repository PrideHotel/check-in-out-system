import { useState } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';

// Firebase error codes -> messages a salesperson can actually act on.
const ERROR_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Please choose a password of at least 6 characters.',
};

function describeError(error, isLogin) {
  return (
    ERROR_MESSAGES[error?.code] ??
    (isLogin ? 'Could not sign you in. Please try again.' : 'Could not create the account. Please try again.')
  );
}

const Login = () => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [showResetMessage, setShowResetMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();

  const switchMode = (nextIsLogin) => {
    if (nextIsLogin === isLogin) return;
    setIsLogin(nextIsLogin);
    setError('');
    setShowResetMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowResetMessage('');
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
      }
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(describeError(err, isLogin));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Enter your email address first, then tap “Forgot password?”.');
      return;
    }
    setError('');
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setShowResetMessage('Password reset email sent. Check your inbox or spam folder.');
    } catch (err) {
      console.error(err);
      setError(ERROR_MESSAGES[err?.code] ?? 'Could not send the reset email. Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md animate-fade-in-up">
      <div className="card overflow-hidden">
        {/* Branded header */}
        <div className="bg-brand-gradient px-6 py-7 text-center">
          <span className="mx-auto mb-4 inline-flex rounded-xl bg-white px-4 py-2.5 shadow-lg">
            <img
              src="/pride-logo.png"
              alt="Pride Hotels &amp; Resorts"
              className="h-10 w-auto"
              width="164"
              height="96"
            />
          </span>
          <h1 className="text-xl font-bold text-white">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-white/80">
            {isLogin
              ? 'Sign in to record your field visits.'
              : 'Join the sales check-in portal in a few seconds.'}
          </p>
        </div>

        <div className="card-pad">
          {/* Login / Sign up switch */}
          <div
            className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {[
              { label: 'Login', value: true },
              { label: 'Sign Up', value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={isLogin === value}
                onClick={() => switchMode(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isLogin === value
                    ? 'bg-white text-brand-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="alert-error mb-4 animate-fade-in" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {showResetMessage && (
            <div className="alert-success mb-4 animate-fade-in" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{showResetMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="animate-fade-in">
                <label htmlFor="displayName" className="label">
                  Full name
                </label>
                <div className="relative">
                  <User className="field-icon" aria-hidden="true" />
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input input-icon"
                    required={!isLogin}
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <div className="relative">
                <Mail className="field-icon" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input input-icon"
                  required
                  placeholder="you@pridehotel.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="label">
                  Password
                </label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isSendingReset}
                    className="mb-1.5 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 transition hover:text-brand-900 disabled:opacity-60"
                  >
                    {isSendingReset ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <KeyRound className="h-3 w-3" aria-hidden="true" />
                    )}
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="field-icon" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input input-icon pr-11"
                  required
                  minLength={6}
                  placeholder={isLogin ? 'Enter your password' : 'At least 6 characters'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {isLogin ? 'Signing in…' : 'Creating account…'}
                </>
              ) : (
                <>
                  {isLogin ? (
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isLogin ? 'Login' : 'Create account'}
                </>
              )}
            </button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            Your visit data stays private to your account.
          </p>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-slate-500">
        {isLogin ? "Don't have an account?" : 'Already registered?'}{' '}
        <button
          type="button"
          onClick={() => switchMode(!isLogin)}
          className="rounded font-semibold text-brand-800 underline-offset-4 transition hover:text-brand-900 hover:underline"
        >
          {isLogin ? 'Sign up' : 'Login'}
        </button>
      </p>
    </div>
  );
};

export default Login;
