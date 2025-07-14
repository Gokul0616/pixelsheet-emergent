import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Loader2, FileSpreadsheet } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'editor' | 'viewer';
  fallback?: React.ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  requiredRole,
  fallback 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900">Loading...</h2>
          <p className="text-gray-600">Verifying your authentication</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    if (fallback) return <>{fallback}</>;
    
    // Use client-side routing instead of hard redirect
    setLocation('/login');
    return null;
  }

  // Check role permissions
  if (requiredRole && user) {
    const roleHierarchy = { 'viewer': 1, 'editor': 2, 'admin': 3 };
    const userLevel = roleHierarchy[user.role];
    const requiredLevel = roleHierarchy[requiredRole];

    if (userLevel < requiredLevel) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this page. 
              Required role: <span className="font-semibold">{requiredRole}</span>
            </p>
            <p className="text-sm text-gray-500">
              Your current role: <span className="font-semibold">{user.role}</span>
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}