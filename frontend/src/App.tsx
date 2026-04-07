import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import UserPage from './pages/UserPage';

interface AuthContextType {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function App() {
  const [auth, setAuth] = useState<AuthContextType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload;
      const groups = (claims?.['cognito:groups'] as string[] | undefined) || [];
      setAuth({
        userId: user.userId,
        email: (claims?.email as string) || '',
        name: (claims?.name as string) || (claims?.email as string) || '',
        isAdmin: groups.includes('Admins'),
        logout: async () => {
          await signOut();
          setAuth(null);
        },
      });
    } catch {
      setAuth(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!auth) {
    return <LoginPage onLogin={checkAuth} />;
  }

  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={auth.isAdmin ? '/admin' : '/user'} replace />}
          />
          <Route
            path="/admin/*"
            element={auth.isAdmin ? <AdminPage /> : <Navigate to="/user" replace />}
          />
          <Route path="/user/*" element={<UserPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
