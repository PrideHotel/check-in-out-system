import { useEffect, useState } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import GoogleIcon from './ui/GoogleIcon';
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
  'auth/account-exists-with-different-credential':
    'An account already exists for this email. Sign in with your password instead.',
  'auth/operation-not-allowed':
    'Google sign-in is not enabled for this project. Enable it in Firebase → Authentication → Sign-in method.',
  'auth/unauthorized-domain':
    'This site is not authorised for Google sign-in. Add its domain in Firebase → Authentication → Settings → Authorized domains.',
};

function describeError(error, isLogin) {
  return (
    ERROR_MESSAGES[error?.code] ??
    (isLogin ? 'Could not sign you in. Please try again.' : 'Could not create the account. Please try again.')
  );
}

// The user closed the Google window or clicked twice — not worth an error banner.
const SILENT_GOOGLE_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

// Popups are unreliable in mobile browsers and in-app webviews; for these we
// retry the whole thing as a full-page redirect rather than dead-ending.
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();

  const busy = isSubmitting || isGoogleLoading;

  // When Google sign-in falls back to a redirect, the browser leaves the page
  // and comes back here. A success is picked up by the auth listener in App;
  // this only exists so a failed redirect reports something instead of
  // silently returning the user to an empty login form.
  useEffect(() => {
    let cancelled = false;

    getRedirectResult(auth).catch((err) => {
      console.error('Google redirect sign-in failed:', err);
      if (!cancelled && !SILENT_GOOGLE_CODES.has(err?.code)) {
        setError(describeError(err, true));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleGoogleSignIn = async () => {
    setError('');
    setShowResetMessage('');
    setIsGoogleLoading(true);

    const provider = new GoogleAuthProvider();
    // Always let the user pick, rather than silently reusing one Google session
    // on a shared device.
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err) {
      if (SILENT_GOOGLE_CODES.has(err?.code)) return;

      if (REDIRECT_FALLBACK_CODES.has(err?.code)) {
        try {
          // Navigates away; anything after this only runs if it failed.
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          console.error('Google redirect sign-in failed:', redirectError);
          setError(describeError(redirectError, true));
          return;
        }
      }

      console.error('Google sign-in failed:', err);
      setError(describeError(err, true));
    } finally {
      setIsGoogleLoading(false);
    }
  };

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

          {/* Google sign-in — works for both new and returning users, so it
              sits above the mode-specific email form. */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="btn-secondary w-full py-3"
          >
            {isGoogleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Opening Google…
              </>
            ) : (
              <>
                <GoogleIcon className="h-[18px] w-[18px]" />
                Continue with Google
              </>
            )}
          </button>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              or use email
            </span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

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

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
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
