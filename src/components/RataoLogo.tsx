export function RataoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        width={compact ? 40 : 58}
        height={compact ? 40 : 58}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_4px_12px_rgba(244,63,94,0.45)]"
      >
        {/* Voxel Rat Ears */}
        <rect x="8" y="8" width="16" height="16" rx="3" fill="#64748b" />
        <rect x="12" y="12" width="8" height="8" rx="1.5" fill="#f472b6" />
        <rect x="40" y="8" width="16" height="16" rx="3" fill="#64748b" />
        <rect x="44" y="12" width="8" height="8" rx="1.5" fill="#f472b6" />
        {/* Voxel Head */}
        <rect x="14" y="18" width="36" height="34" rx="5" fill="#94a3b8" />
        <rect x="14" y="42" width="36" height="10" rx="3" fill="#e11d48" />
        {/* Eyes */}
        <rect x="21" y="27" width="7" height="7" rx="1.5" fill="#0f172a" />
        <rect x="36" y="27" width="7" height="7" rx="1.5" fill="#0f172a" />
        <rect x="23" y="29" width="3" height="3" fill="#facc15" />
        <rect x="38" y="29" width="3" height="3" fill="#facc15" />
        {/* Pink Nose */}
        <rect x="28" y="36" width="8" height="6" rx="2" fill="#f43f5e" />
        {/* Speed Bolt */}
        <path d="M35 4L28 15H34L30 24L41 12H35L35 4Z" fill="#facc15" />
      </svg>
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-display font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] ${
              compact ? 'text-xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            RATÃO
          </span>
          <span
            className={`font-display font-bold tracking-tight text-amber-400 drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] ${
              compact ? 'text-xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            RUN
          </span>
          <span
            className={`px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono-num font-extrabold ${
              compact ? 'text-[10px]' : 'text-xs sm:text-sm'
            }`}
          >
            3D
          </span>
        </div>
        {!compact && (
          <span className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-sky-200/90 mt-1">
            Voxel Endless Runner · Desafio Sem Moedas
          </span>
        )}
      </div>
    </div>
  );
}
