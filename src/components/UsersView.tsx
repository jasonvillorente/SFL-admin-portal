import React, { useState } from 'react';
import { UserAccount, getResidentName, formatPhoneNumber } from '../types';
import { 
  Users, 
  Search, 
  UserX, 
  UserCheck, 
  Key, 
  ShieldCheck, 
  Globe,
  Calendar,
  Sparkles,
  ClipboardList,
  Phone,
  Mail,
  Smartphone,
  Trash2,
  AlertTriangle,
  UserMinus
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';

interface UsersProps {
  users: UserAccount[];
  onToggleUserStatus: (uid: string, currentStatus: boolean) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onDeleteUser: (uid: string) => Promise<void>;
  onPurgeTestUsers?: (uids: string[]) => Promise<void>;
}

export default function UsersView({
  users,
  onToggleUserStatus,
  onResetPassword,
  onDeleteUser,
  onPurgeTestUsers
}: UsersProps) {
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'resident' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'verified' | 'test' | 'recent'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Custom modal and toast states
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
  } | null>(null);

  const [toastConfig, setToastConfig] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Identify test or anonymous users
  const isTestOrAnonymousUser = (u: UserAccount) => {
    const name = (getResidentName(u, '') || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const rawPhone = u.phoneNumber || u.phone || '';
    return name.includes('test') || name.includes('ouihuihi') || name.includes('demo') || 
           name.includes('anonymous') || email.includes('test') || email.includes('example.com') ||
           (!rawPhone && !email && name.startsWith('resident'));
  };
  
  const handleToggleDeactivate = (user: UserAccount) => {
    const displayName = getResidentName(user);
    const actionWord = user.active ? 'Deactivate' : 'Reactivate';
    const contactInfo = user.phoneNumber ? formatPhoneNumber(user.phoneNumber) : (user.email || 'Mobile Resident');
    const confirmMsg = `Are you sure you want to ${actionWord} the user profile "${displayName}" (${contactInfo})? Disabled accounts cannot log in or submit incident reports.`;
    
    setConfirmConfig({
      title: `${actionWord} User Profile`,
      message: confirmMsg,
      isDestructive: user.active,
      onConfirm: async () => {
        try {
          await onToggleUserStatus(user.uid, user.active);
          setToastConfig({ message: `User profile "${displayName}" successfully ${user.active ? 'DEACTIVATED' : 'REACTIVATED'}.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to change status: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handleDeleteUserAccount = (user: UserAccount) => {
    const displayName = getResidentName(user);
    const contactInfo = user.phoneNumber ? formatPhoneNumber(user.phoneNumber) : (user.email || user.uid.slice(0, 8));
    
    setConfirmConfig({
      title: "Delete Resident Account",
      message: `Are you sure you want to permanently delete resident account "${displayName}" (${contactInfo})? This will remove their user record from the database and revoke their login access.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await onDeleteUser(user.uid);
          setToastConfig({ message: `Resident account "${displayName}" has been permanently deleted.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to delete user account: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handlePurgeAllTestUsers = () => {
    const testUsers = users.filter(u => u.role !== 'admin' && isTestOrAnonymousUser(u));
    const targetUids = testUsers.map(u => u.uid);
    const count = targetUids.length;

    if (count === 0) {
      setToastConfig({ message: "No test or anonymous resident accounts found to purge.", type: 'info' });
      return;
    }

    setConfirmConfig({
      title: "Purge All Test Resident Accounts",
      message: `Are you sure you want to delete all ${count} detected test and anonymous resident accounts? This will permanently remove their records from the database.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          if (onPurgeTestUsers) {
            await onPurgeTestUsers(targetUids);
          } else {
            for (const uid of targetUids) {
              await onDeleteUser(uid);
            }
          }
          setToastConfig({ message: `Successfully purged ${count} test resident accounts.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Failed to purge test users: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const handleReset = (emailOrPhone: string) => {
    if (!emailOrPhone || !emailOrPhone.includes('@')) {
      setToastConfig({ message: `Password reset via email is only applicable for email-authenticated accounts. Phone users authenticate via SMS OTP.`, type: 'info' });
      return;
    }

    setConfirmConfig({
      title: "Administrative Password Reset",
      message: `Initiate Firebase administrator password-reset email for ${emailOrPhone}? An automated recovery link will be dispatched.`,
      onConfirm: async () => {
        try {
          await onResetPassword(emailOrPhone);
          setToastConfig({ message: `Administrative password reset email successfully dispatched to ${emailOrPhone}.`, type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Command execution failed: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  // Helper to generate user avatar initials with deterministic visual backgrounds
  const getAvatarFallback = (user: UserAccount) => {
    const resolvedName = getResidentName(user, 'Resident');
    const cleanName = resolvedName.replace(/^Resident\s*\(/i, '').replace(/\)$/, '').trim();
    if (!cleanName) return { initials: 'R', bg: 'bg-slate-100 text-slate-700' };
    
    const parts = cleanName.split(/\s+/);
    let initials = parts[0]?.[0] || '';
    if (parts.length > 1 && parts[parts.length - 1]?.[0]) {
      initials += parts[parts.length - 1][0];
    }
    initials = initials.toUpperCase().slice(0, 2);

    // Pick dynamic background based on name length or character code sum
    const codeSum = Array.from(cleanName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const backgroundSchemes = [
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-emerald-100 text-emerald-700 border-emerald-200',
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-amber-100 text-amber-700 border-amber-200',
      'bg-teal-100 text-teal-700 border-teal-200',
      'bg-rose-100 text-rose-700 border-rose-200',
      'bg-violet-100 text-violet-700 border-violet-200'
    ];
    const bg = backgroundSchemes[codeSum % backgroundSchemes.length];
    return { initials, bg };
  };

  // Filter and Search processor
  const filteredUsers = users.filter((u) => {
    // 1. Role Filter
    const matchesRole = activeRoleFilter === 'all' || u?.role === activeRoleFilter;
    
    // 2. Status Filter
    let matchesStatus = true;
    if (statusFilter === 'active') matchesStatus = u?.active === true;
    else if (statusFilter === 'suspended') matchesStatus = u?.active === false;
    else if (statusFilter === 'verified') {
      const hasPhone = Boolean(u?.phoneNumber || u?.phone);
      const hasEmail = Boolean(u?.email && u.email.includes('@'));
      matchesStatus = hasPhone || hasEmail;
    } else if (statusFilter === 'test') {
      matchesStatus = isTestOrAnonymousUser(u);
    } else if (statusFilter === 'recent') {
      const registrationTime = u?.createdAt ? new Date(u.createdAt).getTime() : NaN;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      matchesStatus = isNaN(registrationTime) ? true : (registrationTime > thirtyDaysAgo);
    }

    // 3. Search query
    const cleanSearch = (searchQuery || '').toLowerCase().trim();
    const resolvedName = getResidentName(u, '').toLowerCase();
    const name = (u?.name || '').toLowerCase();
    const displayName = (u?.displayName || '').toLowerCase();
    const email = (u?.email || '').toLowerCase();
    const phone = (u?.phoneNumber || u?.phone || '').toLowerCase();
    const uid = (u?.uid || '').toLowerCase();

    const matchesSearch = !cleanSearch || 
                          resolvedName.includes(cleanSearch) ||
                          name.includes(cleanSearch) || 
                          displayName.includes(cleanSearch) ||
                          email.includes(cleanSearch) ||
                          phone.includes(cleanSearch) ||
                          uid.includes(cleanSearch);
    
    return matchesRole && matchesStatus && matchesSearch;
  });

  // Sort: If "recent" filter is on, always pull newest registrations up top
  if (statusFilter === 'recent') {
    filteredUsers.sort((a, b) => (new Date(b?.createdAt || 0).getTime() || 0) - (new Date(a?.createdAt || 0).getTime() || 0));
  }

  const testUserCount = users.filter(u => u.role !== 'admin' && isTestOrAnonymousUser(u)).length;

  return (
    <div className="space-y-6" id="users-management-view">
      
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">Registered User Administration</h2>
          <p className="text-xs text-gray-400 mt-0.5 font-sans">Audit and manage resident mobile accounts, delete spam/test profiles, or toggle active login permissions.</p>
        </div>

        {/* Purge Test Users Button */}
        {testUserCount > 0 && (
          <button
            type="button"
            onClick={handlePurgeAllTestUsers}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-md text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
            title="Purge detected test or anonymous user accounts"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>🧹 Purge {testUserCount} Test Users</span>
          </button>
        )}
      </div>

      {/* Grid: Stats trackers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">ALL COORDINATED PROFILES</span>
            <span className="text-xl font-bold text-slate-900 block mt-1">{users.length} accounts</span>
          </div>
          <div className="p-2.5 rounded bg-slate-50 text-slate-800 border">
            <Users className="w-5 h-5 shrink-0" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">BARANGAY RESIDENTS</span>
            <span className="text-xl font-bold text-slate-900 block mt-1">{users.filter(x => x.role === 'resident').length} profiles</span>
            {users.filter(x => x.role === 'resident').length === 0 && (
              <span className="text-[9px] text-amber-600 font-semibold block mt-1">
                ⚠️ Mobile database not linked
              </span>
            )}
          </div>
          <div className="p-2.5 rounded bg-blue-50 text-blue-700 border border-blue-150">
            <Globe className="w-5 h-5 shrink-0" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-4 shadow-sm text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">PORTAL ADMINISTRATORS</span>
            <span className="text-xl font-bold text-slate-900 block mt-1">{users.filter(x => x.role === 'admin').length} officers</span>
          </div>
          <div className="p-2.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-150">
            <ShieldCheck className="w-5 h-5 shrink-0" />
          </div>
        </div>
      </div>

      {/* Main user list table */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden" id="users-registry-pane">
        
        {/* Filtering & Search control panel */}
        <div className="p-4 border-b border-gray-150 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 text-xs font-sans">
          
          {/* Leftside search field */}
          <div className="relative max-w-xs w-full">
            <input
              type="text"
              placeholder="Search by name, phone, email, UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded pl-8 pr-3 py-1.5 focus:outline-[#1E3A5F] text-xs text-slate-800 font-semibold"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Role & status filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 border border-gray-200 p-0.5 bg-white rounded">
              <span className="text-[9px] font-extrabold text-slate-400 px-2 tracking-wider">ROLE:</span>
              {['all', 'resident', 'admin'].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRoleFilter(role as any)}
                  className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-colors select-none cursor-pointer ${
                    activeRoleFilter === role 
                      ? 'bg-[#1E3A5F] text-white' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {role}s
                </button>
              ))}
            </div>

            {/* Status & Category filters */}
            <div className="flex flex-wrap items-center space-x-1 border border-gray-200 p-0.5 bg-white rounded">
              <span className="text-[9px] font-extrabold text-slate-400 px-2 tracking-wider">FILTER:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'verified', label: 'Verified' },
                { id: 'test', label: 'Test / Anon' },
                { id: 'active', label: 'Active' },
                { id: 'suspended', label: 'Suspended' },
                { id: 'recent', label: 'Recent' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id as any)}
                  className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase transition-colors select-none cursor-pointer ${
                    statusFilter === opt.id 
                      ? 'bg-[#1E3A5F] text-white' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs italic font-sans flex flex-col items-center justify-center">
            <ClipboardList className="w-12 h-12 text-slate-200 mb-2" />
            <span>No registered users match requested search query or filters.</span>
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full min-w-[880px] text-left border-collapse font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-slate-500 text-[10px] uppercase tracking-widest font-bold font-display">
                  <th className="py-3 px-4 min-w-[220px]">Coordinated User Profile</th>
                  <th className="py-3 px-4 min-w-[100px]">Assigned Role</th>
                  <th className="py-3 px-4 min-w-[120px]">Account UID</th>
                  <th className="py-3 px-4 min-w-[110px]">Registration Date</th>
                  <th className="py-3 px-4 min-w-[110px]">Last Login</th>
                  <th className="py-3 px-4 min-w-[100px]">Profile Status</th>
                  <th className="py-3 px-4 min-w-[180px] text-right">Actions & Management</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-700">
                {filteredUsers.map((user) => {
                  const resolvedName = getResidentName(user);
                  const { initials, bg } = getAvatarFallback(user);
                  const rawPhone = user.phoneNumber || user.phone || user.contactNumber || user.mobile;
                  const formattedPhone = formatPhoneNumber(rawPhone);
                  const isTest = isTestOrAnonymousUser(user);
                  
                  return (
                    <tr key={user.uid} className="hover:bg-slate-50">
                      {/* Name with initials avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs shadow-inner shrink-0 leading-none ${bg}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-slate-900 truncate max-w-[180px]" title={resolvedName}>
                                {resolvedName}
                              </span>
                              {isTest && (
                                <span className="bg-amber-100 text-amber-800 text-[8px] px-1 py-0.2 rounded font-bold uppercase">
                                  Test
                                </span>
                              )}
                            </div>
                            
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {formattedPhone && (
                                <span className="inline-flex items-center space-x-1 font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded font-medium">
                                  <Phone className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                  <span>{formattedPhone}</span>
                                </span>
                              )}
                              {user.email && (
                                <span className="text-[10px] text-gray-400 font-medium truncate tracking-wide font-mono block">
                                  {user.email}
                                </span>
                              )}
                              {!user.email && !formattedPhone && (
                                <span className="text-[10px] text-gray-400 font-mono italic">
                                  Mobile Resident
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4 font-sans whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border shadow-xs ${
                          user.role === 'admin' 
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200 font-bold' 
                            : 'bg-emerald-50 text-emerald-800 border-emerald-150'
                        }`}>
                          {user.role}
                        </span>
                      </td>

                      {/* Display UID */}
                      <td className="py-3.5 px-4 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                        <span className="bg-slate-50 border px-1.5 py-0.5 rounded font-bold" title={user.uid}>
                          {user.uid.slice(0, 10)}...
                        </span>
                      </td>

                      {/* Display Date Created */}
                      <td className="py-3.5 px-4 text-slate-600 font-semibold font-mono text-[10px] whitespace-nowrap">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-300" />
                          <span>{user.createdAt ? user.createdAt : 'N/A'}</span>
                        </div>
                      </td>

                      {/* Display Last Active Login */}
                      <td className="py-3.5 px-4 text-slate-500 font-semibold font-mono text-[10px] whitespace-nowrap">
                        {user.lastLogin ? user.lastLogin : 'No data recorded'}
                      </td>

                      {/* Profile status badge */}
                      <td className="py-3.5 px-4 font-sans font-semibold whitespace-nowrap">
                        <span className={`inline-flex items-center space-x-1 font-bold ${
                          user.active ? 'text-emerald-600' : 'text-rose-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                          <span className="uppercase text-[9px] tracking-wide">{user.active ? 'Active Profile' : 'Suspended'}</span>
                        </span>
                      </td>

                      {/* Credentials & Delete Action handlers */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5 text-xs">
                          {user.email ? (
                            <button
                              type="button"
                              onClick={() => handleReset(user.email || '')}
                              className="p-1 px-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded transition-colors flex items-center space-x-1 cursor-pointer font-bold select-none text-[10px]"
                              title="Dispatch password restoration credentials email"
                            >
                              <Key className="w-3 h-3 text-slate-500" />
                              <span>RESET</span>
                            </button>
                          ) : (
                            <span className="p-1 px-1 text-[9px] text-gray-400 font-mono italic">SMS</span>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => handleToggleDeactivate(user)}
                            className={`p-1 px-2 border rounded transition-colors flex items-center space-x-1 cursor-pointer font-bold select-none text-[10px] uppercase ${
                              user.active
                                ? 'border-rose-200 hover:bg-rose-50 text-rose-600'
                                : 'border-emerald-200 hover:bg-emerald-50 text-emerald-600'
                            }`}
                            title={user.active ? "Deactivate resident account" : "Reactivate resident account"}
                          >
                            {user.active ? (
                              <>
                                <UserX className="w-3 h-3 text-rose-500" />
                                <span>Deactivate</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3 h-3 text-emerald-500" />
                                <span>Reactivate</span>
                              </>
                            )}
                          </button>

                          {/* Delete Resident Account Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUserAccount(user)}
                            className="p-1 px-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded transition-colors flex items-center space-x-1 cursor-pointer font-bold select-none text-[10px]"
                            title="Delete Resident Account permanently from database"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmConfig !== null}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
      />

      <AlertToast
        isOpen={toastConfig !== null}
        message={toastConfig?.message || ""}
        type={toastConfig?.type}
        onClose={() => setToastConfig(null)}
      />

    </div>
  );
}
