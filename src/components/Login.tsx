import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Lock, User, Building } from 'lucide-react';

interface LoginProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  errorMsg: string | null;
  loading: boolean;
}

export default function Login({ onLogin, onGoogleLogin, errorMsg, loading }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex overflow-hidden font-sans" id="admin-login-layout">
      {/* LEFT SIDE: Government GIS Map Preview Mock Illustration */}
      <div className="hidden lg:flex lg:w-2/3 bg-[#132844] relative text-white flex-col justify-between p-12 overflow-hidden border-r border-[#1E3A5F]">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1E3A5F_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
        
        {/* Decorative Radar circular coordinates lines */}
        <div className="absolute -top-32 -left-32 w-96 h-96 border border-slate-700 rounded-full opacity-20 pointer-events-none" />
        <div className="absolute -top-16 -left-16 w-96 h-96 border border-slate-700 rounded-full opacity-10 pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 border-t border-r border-slate-600 rounded-tr-full opacity-10 pointer-events-none" />

        <div className="relative z-10 flex items-center space-x-3">
          <div className="p-2.5 bg-white text-[#1E3A5F] rounded border border-slate-200 shadow-sm">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-widest text-[#B0BCCB] font-mono">REPUBLIC OF THE PHILIPPINES</h2>
            <h1 className="text-lg font-bold font-display text-white">Barangay Palanan Operations Management</h1>
          </div>
        </div>

        {/* Big GIS Graphic Preview Box */}
        <div className="relative z-10 my-auto max-w-xl">
          <span className="text-xs text-[#B0BCCB] font-bold font-mono tracking-wider block mb-2">INTELLIGENT MUNICIPAL TELEMETRY</span>
          <h2 className="text-3xl font-bold font-display text-white tracking-tight leading-tight">
            SafeRoute Lite Admin Portal
          </h2>
          <p className="mt-4 text-slate-300 text-sm leading-relaxed">
            Authorized portal for Barangay officers, emergency response teams, and municipal engineers. 
            Monitors real-time community hazards, manages local danger zone geofences, and broadcasts urgent safety advisories strictly within the boundaries of Barangay Palanan, Makati.
          </p>

          {/* Interactive stats preview mockup */}
          <div className="mt-8 grid grid-cols-3 gap-4 border border-slate-700 bg-slate-900/60 backdrop-blur-sm p-4 rounded text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">COORDINATES</span>
              <strong className="text-slate-100 text-[11px] block mt-1">14.5585° N, 121.0020° E</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">DISTRICT SEC.</span>
              <strong className="text-slate-100 text-[11px] block mt-1">Makati District I</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">ONLINE STATUS</span>
              <strong className="text-emerald-400 text-[11px] block mt-1">● GRID CONNECTED</strong>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-400 flex justify-between">
          <span>Barangay Safety Division © 2026</span>
          <span className="text-slate-350 font-semibold">Government Secure Server Ingress</span>
        </div>
      </div>

      {/* RIGHT SIDE: Dedicated Credentials Form */}
      <div className="w-full lg:w-1/3 flex items-center justify-center p-6 sm:p-12 bg-white" id="login-form-pane">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <span className="text-[#1E3A5F] text-xs font-bold font-mono tracking-widest block uppercase">Administrator Access</span>
            <h3 className="text-2xl font-bold font-display text-[#1E3A5F] mt-1">Portal Authentication</h3>
            <p className="text-slate-500 text-xs mt-1.5">Provide credentials assigned by the Barangay IT center to begin audit.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider mb-1.5">
                Operator Username / Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="operator@makati.gov.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] pl-9"
                />
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold uppercase text-slate-700 tracking-wider">
                  Operator Password
                </label>
                <button
                  type="button"
                  onClick={() => alert("Please contact the Barangay Palanan Head of Communications or System Administrator to initiate account reset.")}
                  className="text-xs text-[#1E3A5F] hover:text-slate-900 hover:underline transition-colors focus:outline-none"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1E3A5F] focus:ring-1 focus:ring-[#1E3A5F] pl-9 pr-10"
                />
                <Lock className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-xs text-red-700 mt-2">
                <p className="font-semibold">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#1E3A5F] hover:bg-[#152943] text-white rounded font-medium text-xs tracking-wider uppercase transition-colors shadow-md flex items-center justify-center mt-6 disabled:opacity-55"
            >
              {loading ? 'Authenticating Security context...' : 'Secure Operator Sign In'}
            </button>
          </form>

          {/* Fallback Google Sign-In helper as required by set_up_firebase and best-practice debugging */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="relative flex justify-center text-xs uppercase mb-3">
              <span className="bg-white px-2 text-slate-400 text-[10px] font-semibold tracking-wider">Alternative Developer Bypass</span>
            </div>
            
            <button
              onClick={onGoogleLogin}
              disabled={loading}
              className="w-full py-2 px-4 border border-gray-300 bg-white hover:bg-gray-50 text-slate-700 rounded transition-colors text-xs font-semibold shadow-sm flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Verify with Developer Google Ingress</span>
            </button>
          </div>

          {/* Secure Administrative Access Notice */}
          <div className="mt-8 p-3.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 flex items-start space-x-2.5">
            <Shield className="w-5 h-5 text-[#1E3A5F] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 block text-[11px]">Secure Administrator Access Notice</span>
              This system logs, timestamps, and audits every hazard registration and database touch. Unauthorized ingress attempts will automatically register with Makati City Civil Security.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
