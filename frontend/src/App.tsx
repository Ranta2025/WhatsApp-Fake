import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import FullScreenLoader from './components/ui/FullScreenLoader';
import UpdatePrompt from './pwa/UpdatePrompt';

// lazy-loaded pages (improves initial bundle and follows good practices)
const Welcome = lazy(() => import('./pages/Welcome'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard')); // wrapper component that renders DashboardFeature
const ActivateAccount = lazy(() => import('./pages/ActivateAccount'));
const RecoverPassword = lazy(() => import('./pages/RecoverPassword'));
const ActivateExisting = lazy(() => import('./pages/ActivateExisting'));
const UnblockAccount = lazy(() => import('./pages/UnblockAccount'));

const PrivateRoute = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth();
    
    if (loading) return <FullScreenLoader />;

    return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
        <BrowserRouter>
            <Suspense fallback={<FullScreenLoader />}>
                <Routes>
                    <Route path="/" element={<Welcome />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/activate" element={<ActivateAccount />} />
                    <Route path="/activate-existing" element={<ActivateExisting />} />
                    <Route path="/recover-password" element={<RecoverPassword />} />
                    <Route path="/unblock-account" element={<UnblockAccount />} />
                    <Route 
                        path="/dashboard" 
                        element={
                            <PrivateRoute>
                                <Dashboard />
                            </PrivateRoute>
                        } 
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </BrowserRouter>
        <UpdatePrompt />
    </AuthProvider>
  );
}

export default App;
