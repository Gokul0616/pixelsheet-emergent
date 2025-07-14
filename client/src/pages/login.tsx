import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, FileSpreadsheet, Shield, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login, loginWithMfa } = useAuth();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  
  const [mfaData, setMfaData] = useState({
    mfaToken: "",
    backupCode: "",
    email: "",
  });
  
  const [showMfa, setShowMfa] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBackupCode, setShowBackupCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await login(formData.email, formData.password, formData.rememberMe);
      
      if (result.requiresMfa) {
        setMfaData(prev => ({ ...prev, email: formData.email }));
        setShowMfa(true);
        toast({
          title: "MFA Required",
          description: "Please enter your MFA token to continue.",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have been successfully logged in.",
        });
        // Small delay to ensure auth state is updated
        setTimeout(() => {
          setLocation("/dashboard");
        }, 100);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await loginWithMfa(
        mfaData.email,
        showBackupCode ? "" : mfaData.mfaToken,
        showBackupCode ? mfaData.backupCode : undefined
      );
      
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
      // Small delay to ensure auth state is updated
      setTimeout(() => {
        setLocation("/dashboard");
      }, 100);
    } catch (error) {
      setError(error instanceof Error ? error.message : "MFA verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToRegister = () => {
    setLocation("/register");
  };

  const handleBackToLogin = () => {
    setShowMfa(false);
    setMfaData({ mfaToken: "", backupCode: "", email: "" });
    setShowBackupCode(false);
    setError("");
  };

  if (showMfa) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
            <CardDescription>
              Enter your {showBackupCode ? "backup code" : "6-digit MFA token"} to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {!showBackupCode ? (
                <div className="space-y-2">
                  <Label htmlFor="mfaToken">MFA Token</Label>
                  <Input
                    id="mfaToken"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={mfaData.mfaToken}
                    onChange={(e) => setMfaData(prev => ({ ...prev, mfaToken: e.target.value }))}
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    Check your authenticator app for the current code
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="backupCode">Backup Code</Label>
                  <Input
                    id="backupCode"
                    type="text"
                    placeholder="Enter backup code"
                    value={mfaData.backupCode}
                    onChange={(e) => setMfaData(prev => ({ ...prev, backupCode: e.target.value.toUpperCase() }))}
                    className="text-center text-lg tracking-widest"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    Enter one of your backup codes
                  </p>
                </div>
              )}

              <div className="flex flex-col space-y-2">
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Verify & Sign In
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowBackupCode(!showBackupCode)}
                  className="w-full"
                >
                  {showBackupCode ? "Use MFA Token Instead" : "Use Backup Code Instead"}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToLogin}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Ultimate Pixel Sheets
          </h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {/* Demo Credentials */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-blue-600" />
              Demo Credentials
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="text-sm">
              <Badge variant="secondary" className="mr-2">Admin</Badge>
              <span className="font-mono">admin@pixelsheets.com / admin123</span>
            </div>
            <div className="text-sm">
              <Badge variant="outline" className="mr-2">User</Badge>
              <span className="font-mono">demo@pixelsheets.com / demo123</span>
            </div>
          </CardContent>
        </Card>

        {/* Login Form */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>
              Enter your credentials to access your spreadsheets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, rememberMe: checked as boolean }))
                  }
                />
                <Label 
                  htmlFor="rememberMe" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Remember me for 7 days
                </Label>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Don't have an account?{" "}
                <button
                  onClick={handleGoToRegister}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Create one
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security Info */}
        <div className="text-center text-xs text-gray-500">
          <p>🔒 Your data is protected with enterprise-grade security</p>
          <p>Multi-factor authentication available for enhanced security</p>
        </div>
      </div>
    </div>
  );
}