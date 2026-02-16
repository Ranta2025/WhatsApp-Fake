import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ActivateAccount from './pages/ActivateAccount';
import RecoverPassword from './pages/RecoverPassword';
import ActivateExisting from './pages/ActivateExisting';
import UnblockAccount from './pages/UnblockAccount';

const PrivateRoute = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Cargando...</div>;
    
    return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
