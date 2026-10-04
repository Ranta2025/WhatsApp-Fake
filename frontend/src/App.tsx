import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import FullScreenLoader from './components/ui/FullScreenLoader';
import PrivateRoute from './components/PrivateRoute';
import UpdatePrompt from './pwa/UpdatePrompt';
import OfflineBanner from './pwa/OfflineBanner';

// lazy-loaded pages (improves initial bundle and follows good practices)
const Welcome = lazy(() => import('./pages/Welcome'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard')); // wrapper component that renders DashboardFeature
const ActivateAccount = lazy(() => import('./pages/ActivateAccount'));
const RecoverPassword = lazy(() => import('./pages/RecoverPassword'));
const ActivateExisting = lazy(() => import('./pages/ActivateExisting'));
const UnblockAccount = lazy(() => import('./pages/UnblockAccount'));

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
        <OfflineBanner />
    </AuthProvider>
  );
}

export default App;
