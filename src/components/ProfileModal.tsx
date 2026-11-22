import { Calendar, Coins, Crown, Flag, Gamepad, Search, Timer, User, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { api } from '../services/api.ts';
import { SKINS, SkinId, UserProfile, formatStopwatch } from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface ProfileModalProps {
  currentUser: UserProfile;
  initialNickname?: string;
  onClose: () => void;
}

interface PublicProfileData {
  id: string;
  nickname: string;
  equippedSkin: SkinId;
  createdAt: string;
  bestNoCoinTimeMs: number;
  bestDistance: number;
  bestScore: number;
  totalMatches: number;
  totalCoins: number;
  favoriteSkin: SkinId;
  rank: number | null;
}

export function ProfileModal({
  currentUser,
  initialNickname,
  onClose,
}: ProfileModalProps) {
  const [searchNick, setSearchNick] = useState(initialNickname || currentUser.nickname);
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async (nick: string) => {
    const clean = nick.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPublicProfile(clean);
      setProfile(res.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Perfil não encontrado.');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile(initialNickname || currentUser.nickname);
  }, [initialNickname, currentUser.nickname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadProfile(searchNick);
  };

  const equippedDef = profile ? SKINS.find((s) => s.id === profile.equippedSkin) : null;
  const favDef = profile ? SKINS.find((s) => s.id === profile.favoriteSkin) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-rose-400" />
            PERFIL DO JOGADOR
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Player Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchNick}
              onChange={(e) => setSearchNick(e.target.value)}
              placeholder="Buscar perfil público por nickname..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-4 h-4" /> Buscar
            </button>
          </form>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Carregando perfil...</div>
          ) : error ? (
            <div className="py-8 text-center text-red-300 text-sm bg-red-950/40 border border-red-500/40 rounded-xl">
              {error}
            </div>
          ) : profile ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Avatar 3D */}
              <div className="md:col-span-5 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                <div className="h-56 relative">
                  <ScenePreview3D
                    skinId={profile.equippedSkin}
                    mapId="brasil"
                    mode="turntable"
                    quality="low"
                  />
                </div>
                <div className="p-3.5 bg-slate-900 border-t border-slate-800 text-center">
                  <div className="font-display text-xl font-bold text-white">
                    {profile.nickname}
                  </div>
                  <div className="text-xs text-amber-300 font-semibold">
                    Skin Equipada: {equippedDef?.name || profile.equippedSkin}
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400 flex items-center justify-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Desde {new Date(profile.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="md:col-span-7 grid grid-cols-2 gap-3 content-start">
                <div className="col-span-2 p-4 rounded-xl bg-amber-500/10 border border-amber-400/50 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" /> Recorde Sem Moedas
                    </div>
                    <div className="font-mono-num text-3xl font-extrabold text-white mt-0.5">
                      {formatStopwatch(profile.bestNoCoinTimeMs)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase text-slate-400">
                      Posição Global
                    </div>
                    <div className="font-mono-num text-2xl font-extrabold text-emerald-400 flex items-center justify-end gap-1">
                      <Crown className="w-5 h-5 text-amber-400" />
                      {profile.rank ? `#${profile.rank}` : '—'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5 text-sky-400" /> Distância Máxima
                  </div>
                  <div className="font-mono-num text-xl font-bold text-white mt-1">
                    {profile.bestDistance}m
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Gamepad className="w-3.5 h-3.5 text-rose-400" /> Total de Partidas
                  </div>
                  <div className="font-mono-num text-xl font-bold text-white mt-1">
                    {profile.totalMatches}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-bold uppercase flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" /> Moedas Coletadas
                  </div>
                  <div className="font-mono-num text-xl font-bold text-amber-300 mt-1">
                    {profile.totalCoins.toLocaleString('pt-BR')}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-bold uppercase">
                    Skin Favorita
                  </div>
                  <div className="font-display text-base font-bold text-emerald-300 mt-1 truncate">
                    {favDef?.name || profile.favoriteSkin}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
