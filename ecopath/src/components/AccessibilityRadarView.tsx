import React, { useState } from 'react';

interface AccessibilityRadarViewProps {
  onOpenMap: () => void;
}

const profiles = {
  wheelchair: {
    label: 'Wheelchair', icon: 'accessible',
    detail: 'Prioritize paths tagged as wheelchair-accessible. Check curb ramps and surface conditions before setting out; map data may be incomplete.'
  },
  stroller: {
    label: 'Stroller', icon: 'child_care',
    detail: 'Look for connected pedestrian paths and avoid stairs where possible. Surface and crossing details depend on available map data.'
  },
  lowVision: {
    label: 'Low vision', icon: 'visibility',
    detail: 'Use the route preview to review each turn before walking. The map does not provide audio guidance, so travel with your usual mobility aids.'
  }
} as const;

export const AccessibilityRadarView: React.FC<AccessibilityRadarViewProps> = ({ onOpenMap }) => {
  const [profile, setProfile] = useState<keyof typeof profiles>('wheelchair');
  const selected = profiles[profile];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300">
      <header className="bg-white rounded-3xl p-6 shadow-sm border border-[#eaedff]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#6cf8bb]/30 flex items-center justify-center text-[#006948] border border-[#6cf8bb]/50">
            <span className="material-symbols-outlined text-[28px]">accessible</span>
          </div>
          <div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-xl sm:text-2xl font-bold text-[#131b2e]">Accessible route planning</h1>
            <p className="text-xs text-[#3d4a42] mt-1">Choose a mobility profile, then preview a route on the map.</p>
          </div>
        </div>
      </header>

      <section className="bg-white rounded-3xl p-6 shadow-sm border border-[#eaedff] flex flex-col gap-5">
        <div>
          <h2 className="font-['Plus_Jakarta_Sans'] text-base font-bold text-[#131b2e]">What should your route consider?</h2>
          <p className="text-xs text-[#3d4a42] mt-1">This helps you choose the right map view; it does not change route data automatically.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Mobility profile">
          {(Object.entries(profiles) as [keyof typeof profiles, (typeof profiles)[keyof typeof profiles]][]).map(([key, option]) => (
            <button key={key} type="button" aria-pressed={profile === key} onClick={() => setProfile(key)} className={`p-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${profile === key ? 'bg-[#006948] text-white border-[#006948]' : 'bg-[#faf8ff] text-[#3d4a42] border-[#eaedff] hover:border-[#006948]'}`}>
              <span className="material-symbols-outlined text-[18px]">{option.icon}</span>{option.label}
            </button>
          ))}
        </div>
        <div className="rounded-2xl bg-[#f5fff7] border border-[#85f8c4]/60 p-4">
          <div className="font-bold text-sm text-[#006948] flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">info</span>{selected.label} route note</div>
          <p className="text-sm text-[#3d4a42] mt-2 leading-relaxed">{selected.detail}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-[#58645e]">Accessibility tags come from OpenStreetMap and may be incomplete or out of date.</p>
          <button type="button" onClick={onOpenMap} className="shrink-0 px-5 py-3 rounded-full bg-[#006948] hover:bg-[#00855d] text-white text-sm font-bold flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">map</span>Open accessible map
          </button>
        </div>
      </section>
    </div>
  );
};
