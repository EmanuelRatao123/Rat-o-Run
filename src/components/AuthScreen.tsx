import { signInWithPopup } from 'firebase/auth';
import { KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import React, { useState } from 'react';
import { auth, googleProvider } from '../lib/firebase.ts';
import { api, setMemorySessionToken } from '../services/api.ts';
import { syncFirebaseUserProfile } from '../services/firestoreSync.ts';
import { UserProfile } from '../shared/constants.ts';
import { RataoLogo } from './RataoLogo.tsx';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile) => void;
}

type AuthMode = 'login' | 'register' | 'recover';

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await api.login({ nickname, password });
        setMemorySessionToken(res.sessionToken);
        onAuthenticated(res.user);
      } else if (mode === 'register') {
        const res = await api.register({
          nickname,
          password,
          confirmPassword,
          recoveryCode: recoveryCode.trim() || undefined,
        });
        setMemorySessionToken(res.sessionToken);
        onAuthenticated(res.user);
      } else {
        const res = await api.recoverAccount({
          nickname,
          recoveryCode,
          newPassword: password,
          confirmPassword,
        });
        setSuccessMsg(res.message);
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const res = await api.loginWithGoogleToken(idToken, cred.user.displayName || undefined);
      setMemorySessionToken(res.sessionToken);
      await syncFirebaseUserProfile(res.user.nickname, res.user.equippedSkin).catch(() => {});
      onAuthenticated(res.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir o login com Google.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Live 3D Voxel Showcase Backdrop */}
      <div className="absolute inset-0">
        <ScenePreview3D skinId="ratao" mapId="brasil" mode="showcase" quality="medium" />
      </div>

      {/* Gradient Scrim keeping character visible on right */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/20 pointer-events-none" />

      <div className="relative z-10 h-full flex items-center justify-start px-5 sm:px-12 lg:px-20 py-6 overflow-y-auto">
        <div className="w-full max-w-md bg-slate-900/95 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <RataoLogo />
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition ${
                mode === 'login'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition ${
                mode === 'register'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Criar Conta
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('recover');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition ${
                mode === 'recover'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Recuperar
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-950/90 border border-red-500/60 text-red-200 text-sm font-medium">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-sm font-medium">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                {mode === 'register' ? 'Nickname Único' : 'Usuário / Nickname'}
              </label>
              <input
                type="text"
                required
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: RataoVeloz99"
                maxLength={20}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>

            {mode === 'recover' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Código de Recuperação
                </label>
                <input
                  type="text"
                  required
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="Frase ou código definido no cadastro"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                {mode === 'recover' ? 'Nova Senha' : 'Senha'}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-sm"
              />
            </div>

            {(mode === 'register' || mode === 'recover') && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Confirmar Senha
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-sm"
                />
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Código de Recuperação (opcional, mín. 4 chars)
                </label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="Para recuperar sua conta se esquecer a senha"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 text-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-base tracking-wide shadow-lg shadow-rose-900/40 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              {mode === 'login' && (
                <>
                  <LogIn className="w-4 h-4" /> ENTRAR NO JOGO
                </>
              )}
              {mode === 'register' && (
                <>
                  <UserPlus className="w-4 h-4" /> CRIAR CONTA GRÁTIS
                </>
              )}
              {mode === 'recover' && (
                <>
                  <KeyRound className="w-4 h-4" /> REDEFINIR SENHA
                </>
              )}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] font-bold uppercase text-slate-500">ou</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition disabled:opacity-50 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            Entrar com Google (Nuvem Firebase)
          </button>

          <p className="mt-4 text-[11px] text-slate-400 text-center">
            10 skins gratuitas desbloqueadas · 4 mapas 3D · Ranking Global Sem Pegar Moedas
          </p>
        </div>
      </div>
    </div>
  );
}
