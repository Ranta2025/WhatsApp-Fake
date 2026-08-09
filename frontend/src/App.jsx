import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

// lazy-loaded pages (improves initial bundle and follows good practices)
const Welcome = lazy(() => import('./pages/Welcome'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard')); // wrapper component that renders DashboardFeature
const ActivateAccount = lazy(() => import('./pages/ActivateAccount'));
const RecoverPassword = lazy(() => import('./pages/RecoverPassword'));
const ActivateExisting = lazy(() => import('./pages/ActivateExisting'));
const UnblockAccount = lazy(() => import('./pages/UnblockAccount'));

const PrivateRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400 font-medium">Cargando...</span>
                </div>
            </div>
        );
    }

    return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
        <BrowserRouter>
            <Suspense fallback={
                <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-400 rounded-full animate-spin" />
                        <span className="text-sm text-slate-400 font-medium">Cargando...</span>
                    </div>
                </div>
            }>
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
                </Routes>
            </Suspense>
        </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
