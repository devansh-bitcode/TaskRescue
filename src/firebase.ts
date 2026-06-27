import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Add required Google Workspace scopes for calendar syncing and profile information
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');

// Force account selection so user can log in with a different Google account if they wish
provider.setCustomParameters({
  prompt: 'select_account'
});

// Cache the access token in memory as instructed in system skills
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuthListener = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Since Firebase token listener doesn't automatically give Google OAuth access token on reload,
        // we can fetch it or prompt re-auth if needed, or if cachedAccessToken is empty, we handle it as failure
        // so the user can easily re-authenticate. But if we stored user info in state, we can use it.
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Error during Google authentication:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutUser = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

export const getCachedAccessToken = () => cachedAccessToken;
