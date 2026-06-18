import React, { useState } from 'react';
import { CommunityAlert } from '../types';
import { 
  Megaphone, 
  Send, 
  Trash2, 
  AlertTriangle, 
  Check, 
  Clipboard, 
  Building2, 
  Eye, 
  BellRing,
  Volume2
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import AlertToast from './AlertToast';

interface CommunityAlertsViewProps {
  alerts: CommunityAlert[];
  onSendAlert: (alert: Omit<CommunityAlert, 'id'>) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
}

// Preset drafting templates for rapid operations deployment
const BULLETIN_TEMPLATES = [
  {
    label: 'Typhoon / Flood Hazard Warning',
    title: 'Severe Rainfall Flood Advisory (Palanan Alert)',
    message: 'Barangay Palanan Emergency response advises high alert for rising waters or flooding on lower Bautista Street and Dian Street. Prepare safety essentials and avoid low-lying zones.',
    priorityLevel: 'high' as const,
    alertType: 'Weather Warning' as const,
    targetArea: 'Dian & Bautista Streets, Low Areas'
  },
  {
    label: 'Road Closure / Construction detour',
    title: 'Road Segment Maintenance Detour',
    message: 'Medina Street in Zone 2 is temporarily closed due to sewage pipeline rehabilitation and drainage construction. Motorists are advised to utilize Dian Street or Filmore detours.',
    priorityLevel: 'medium' as const,
    alertType: 'Road Closure' as const,
    targetArea: 'Medina Street, Zone 2'
  },
  {
    label: 'Crime Advisory watch out',
    title: 'Coordinated Night Watch Patrol Advisory',
    message: 'Following reported suspicious activity, Barangay Palanan safety tanods have intensified motorized patrols around Casino Street. Residents are advised to stay vigilant in poorly lit passages.',
    priorityLevel: 'low' as const,
    alertType: 'Safety Advisory' as const,
    targetArea: 'Casino Street Passages, Zone 1'
  },
  {
    label: 'Critical Evacuation Emergency Notice',
    title: 'CRITICAL EVACUATION ORDER (Emergency Broadcaster)',
    message: 'Barangay Disaster Command issues immediate evacuation directions due to a localized structural emergency threat. Proceed calmly to Palanan Elementary School evacuation center immediately.',
    priorityLevel: 'critical' as const,
    alertType: 'Emergency Notice' as const,
    targetArea: 'Whole of Barangay Palanan'
  }
];

export default function CommunityAlertsView({
  alerts,
  onSendAlert,
  onDeleteAlert
}: CommunityAlertsViewProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priorityLevel, setPriorityLevel] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [targetArea, setTargetArea] = useState('Whole Barangay Palanan');
  const [alertType, setAlertType] = useState<'Safety Advisory' | 'Weather Warning' | 'Road Closure' | 'Emergency Notice'>('Safety Advisory');
  
  const [loading, setLoading] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  const handleApplyTemplate = (tpl: typeof BULLETIN_TEMPLATES[0]) => {
    setTitle(tpl.title);
    setMessage(tpl.message);
    setPriorityLevel(tpl.priorityLevel);
    setAlertType(tpl.alertType);
    setTargetArea(tpl.targetArea);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message || !targetArea) {
      setFormMsg({ type: 'err', text: 'All bulletin fields are mandatory.' });
      return;
    }

    setLoading(true);
    setFormMsg(null);

    try {
      await onSendAlert({
        title,
        message,
        priorityLevel,
        targetArea,
        alertType,
        dateSent: new Date().toLocaleDateString()
      });

      setFormMsg({ type: 'ok', text: 'Public Bulletin broadcast alert successfully pushed to residents.' });
      // Reset drafting input
      setTitle('');
      setMessage('');
      setTargetArea('Whole Barangay Palanan');
    } catch (err: any) {
      setFormMsg({ type: 'err', text: err.message || 'Error executing broadcast transaction.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string, itemTitle: string) => {
    setConfirmConfig({
      title: "Retract Safety Bulletin",
      message: `Discharge and pull back safety bulletin "${itemTitle}"? It will instantly disappear from resident feeds.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await onDeleteAlert(id);
          setToastConfig({ message: 'Public Bulletin successfully retracted.', type: 'success' });
        } catch (err: any) {
          setToastConfig({ message: `Retraction failed: ${err.message}`, type: 'error' });
        }
        setConfirmConfig(null);
      }
    });
  };

  const getPriorityColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-600 text-white border-red-700 font-bold';
      case 'high': return 'bg-orange-500 text-white border-orange-600 font-bold';
      case 'medium': return 'bg-amber-400 text-slate-900 border-amber-500 font-bold';
      case 'low': return 'bg-blue-100 text-blue-900 border-blue-200 font-semibold';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertTypeColor = (type: string) => {
    switch (type) {
      case 'Emergency Notice': return 'text-red-750 border-red-200 bg-red-50';
      case 'Weather Warning': return 'text-blue-750 border-blue-200 bg-blue-50';
      case 'Road Closure': return 'text-amber-750 border-amber-200 bg-amber-50';
      case 'Safety Advisory': return 'text-slate-750 border-gray-200 bg-slate-50';
      default: return 'text-gray-700 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6" id="community-alerts-screen">
      {/* View Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 p-4 rounded shadow-sm gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Safety Broadcasts & Advisories Emergency Room</h2>
          <p className="text-xs text-gray-400 mt-0.5 font-sans">Draft and publish push-notifications, security briefs, detours, and emergency announcements.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: templates drafting toolbox & interactive Composer (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Preset templates list */}
          <div className="bg-white border border-gray-200 rounded p-4 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-3 flex items-center text-xs tracking-wider uppercase">
              <Clipboard className="w-4 h-4 mr-1.5 text-[#1E3A5F]" />
              Rapid Dispatch Templates
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BULLETIN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="text-left p-2.5 rounded border border-gray-200 hover:border-slate-405 hover:bg-slate-50 text-xs transition-colors flex flex-col justify-between"
                >
                  <span className="font-bold text-slate-800 truncate block w-full">{tpl.label}</span>
                  <span className="text-[10px] text-gray-400 truncate block w-full mt-1">{tpl.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Alert composer Form */}
          <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
            <h3 className="font-bold text-[#1E3A5F] border-b border-gray-100 pb-2 mb-4 flex items-center text-xs tracking-wider uppercase">
              <Volume2 className="w-5 h-5 mr-1.5 text-emerald-500" />
              Composer Safety Bulletin Pushes
            </h3>

            {formMsg && (
              <div className={`p-3 rounded text-xs font-semibold mb-4 border ${
                formMsg.type === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-800'
              }`}>
                {formMsg.text}
              </div>
            )}

            <form onSubmit={handlePublish} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Category Classification</label>
                  <select
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 focus:outline-[#1E3A5F]"
                  >
                    <option value="Safety Advisory">Safety Advisory Notice</option>
                    <option value="Weather Warning">Weather Warning Advisory</option>
                    <option value="Road Closure">Road Closure / Detour Brief</option>
                    <option value="Emergency Notice">Emergency Evacuation Alert</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Broadcaster Level Severity</label>
                  <select
                    value={priorityLevel}
                    onChange={(e) => setPriorityLevel(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 focus:outline-[#1E3A5F]"
                  >
                    <option value="low">Low Impact (Informative)</option>
                    <option value="medium">Medium Impact (Advisory)</option>
                    <option value="high">High Impact (Alert warning)</option>
                    <option value="critical">Critical Impact (Immediate hazard response)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Geographic Boundaries</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Barangay Palanan, Zone 2 or Taft Ave Detours"
                  value={targetArea}
                  onChange={(e) => setTargetArea(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs focus:outline-[#1E3A5F] font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Headline Title</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g. Severe Flooding Warning: bautista passages closed"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-800 focus:outline-[#1E3A5F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Message Details</label>
                <textarea
                  rows={4}
                  required
                  maxLength={1200}
                  placeholder="Enter standard, clear, readable instructions for residents..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-800 focus:outline-[#1E3A5F] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#1E3A5F] hover:bg-[#152a44] text-white rounded font-bold uppercase transition-colors shadow flex items-center justify-center space-x-1 tracking-wide disabled:opacity-55"
              >
                <Send className="w-4 h-4 text-yellow-400" />
                <span>{loading ? 'Broadcasting Bulletin via secure satellite...' : 'Broadcast Bulletin Advisory'}</span>
              </button>
            </form>
          </div>

        </div>

        {/* Right column: active live notification broadcasts list (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col text-xs font-sans">
          
          <div className="p-4 border-b border-gray-100 bg-[#1E3A5F] text-white flex justify-between items-center shrink-0">
            <h3 className="font-bold flex items-center text-xs tracking-wider uppercase">
              <BellRing className="w-4.5 h-4.5 mr-1.5 text-yellow-400" />
              Live Safety Feeds Pushed
            </h3>
            <span className="bg-slate-800 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
              {alerts.length} Broadcasts Live
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[580px] p-4 space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-xs italic">
                <Megaphone className="w-12 h-12 text-slate-200 mx-auto mb-2" />
                No live safety notifications broadast. Utilize the Composer to publish detours.
              </div>
            ) : (
              alerts.map((al) => (
                <div key={al.id} className={`p-4 border rounded shadow-sm flex flex-col justify-start relative transition-all ${
                  al.priorityLevel === 'critical' ? 'border-red-400 bg-red-50/15' :
                  al.priorityLevel === 'high' ? 'border-orange-300 bg-orange-50/15' : 'border-gray-200 bg-slate-50/50'
                }`}>
                  {/* Pullback Retract Button */}
                  <button
                    onClick={() => handleDelete(al.id, al.title)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-red-600 transition-colors"
                    title="Retract / Pullback Notice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-100 pr-6">
                    <span className={`text-[9px] font-mono tracking-wider uppercase px-2 py-0.5 rounded-full border border-solid ${getPriorityColor(al.priorityLevel)}`}>
                      PRIORITY: {al.priorityLevel}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${getAlertTypeColor(al.alertType)}`}>
                      {al.alertType}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 mt-2.5 text-xs text-balance pr-4 leading-snug">{al.title}</h4>
                  <p className="text-xs text-slate-700 leading-relaxed mt-2 text-slate-600 font-sans tracking-wide block">{al.message}</p>
                  
                  {/* Warning Info footer meta block */}
                  <div className="mt-3.5 pt-2.5 border-t border-gray-150 flex justify-between items-center text-[10px] text-gray-400 font-mono">
                    <span className="flex items-center text-slate-600 font-semibold font-sans">
                      <Building2 className="w-3.5 h-3.5 mr-1 text-[#1E3A5F]" />
                      Bounds: {al.targetArea}
                    </span>
                    <span>Sent: {al.dateSent}</span>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

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
