import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FullScreenLoader from './ui/FullScreenLoader';

/**
 * Renders its children only with a session; otherwise redirects to /login
 * remembering the requested location (incl. `?chat=` / `?group=` from a
 * notification click) so Login can return there.
 */
const PrivateRoute = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <FullScreenLoader />;

    return user ? children : <Navigate to="/login" replace state={{ from: location }} />;
};

export default PrivateRoute;
