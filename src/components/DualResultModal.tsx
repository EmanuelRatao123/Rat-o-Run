import { Award, Coins, Crown, Flag, Home, Scale, Skull, Timer, Trophy } from 'lucide-react';
import {
  MAPS,
  MultiplayerParticipant,
  MultiplayerRoom,
  UserProfile,
  formatStopwatch,
  getSkinDefinition,
} from '../shared/constants.ts';
import { ScenePreview3D } from './ScenePreview3D.tsx';

interface DualResultModalProps {
  room: MultiplayerRoom;
  participants: MultiplayerParticipant[];
  currentUser: UserProfile;
  onExitToMenu: () => void;
}

function translateFinishReason(
  mode: MultiplayerRoom['mode'],
  reason: string | null,
  isDraw: boolean,
  didIWin: boolean
): string {
  switch (reason) {
    case 'first_coin_collected':
      return didIWin
        ? 'Adversário coletou a 1ª moeda e perdeu!'
        : 'Você coletou uma moeda antes do adversário!';
    case 'opponent_crashed':
      return didIWin
        ? 'Adversário colidiu e foi capturado pela polícia!'
        : 'Você colidiu e foi capturado pela polícia!';
    case 'both_crashed':
      return 'Os dois jogadores caíram ao mesmo tempo.';
    case 'time_limit_draw':
      return 'Limite de 180s sem moedas atingido — Empate técnico!';
    case 'opponent_disconnected':
      return didIWin
        ? 'Adversário desconectou ou abandonou a partida (W.O.).'
        : 'Conexão perdida / saída da partida (W.O.).';
    case 'coop_both_finished':
      if (isDraw) return 'Empate na corrida em dupla!';
      return mode === 'coop'
        ? 'Corrida cooperativa concluída — comparação de sobrevivência!'
        : 'Partida finalizada.';
    default:
      return 'Partida encerrada.';
  }
}

export function DualResultModal({
  room,
  participants,
  currentUser,
  onExitToMenu,
}: DualResultModalProps) {
  const sorted = [...participants].sort((a, b) => {
    if (a.userId === room.hostUserId) return -1;
    if (b.userId === room.hostUserId) return 1;
    return 0;
  });

  const p1 = sorted[0];
  const p2 = sorted[1];

  const isX1 = room.mode === 'x1';
  const winnerId = room.winnerUserId;
  const isDraw = room.status === 'finished' && !winnerId;
  const didIWin = Boolean(!isDraw && winnerId === currentUser.id);
  const didILose = Boolean(!isDraw && winnerId && winnerId !== currentUser.id);

  const mapDef = MAPS.find((m) => m.id === room.mapId) || MAPS[0];

  // For Co-op, also highlight who survived longer
  const p1Time = p1?.durationMs || 0;
  const p2Time = p2?.durationMs || 0;
  const coopLongestSurvivor =
    p1 && p2
      ? p1Time === p2Time
        ? 'Empate em tempo'
        : p1Time > p2Time
          ? p1.nickname
          : p2.nickname
      : '—';

  const headline = isX1
    ? isDraw
      ? 'EMPATE NO X1!'
      : didIWin
        ? 'VITÓRIA NO X1!'
        : didILose
          ? 'DERROTA NO X1'
          : 'RESULTADO X1'
    : 'RESULTADO JOGAR COM AMIGO';

  const reasonLabel = translateFinishReason(room.mode, room.resultReason, isDraw, didIWin);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border-2 border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl my-auto">
        {/* Result Banner */}
        <div className="text-center mb-5">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-extrabold uppercase tracking-wider mb-2 ${
              isDraw
                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                : didIWin
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : isX1
                    ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                    : 'bg-amber-500/20 border-amber-400 text-amber-300'
            }`}
          >
            {isDraw ? (
              <Scale className="w-3.5 h-3.5" />
            ) : didIWin ? (
              <Crown className="w-3.5 h-3.5" />
            ) : isX1 ? (
              <Skull className="w-3.5 h-3.5" />
            ) : (
              <Trophy className="w-3.5 h-3.5" />
            )}
            {isX1 ? 'MODO X1 · 1ª MOEDA PERDE' : 'MODO JOGAR COM AMIGO'} · {mapDef.name}
          </span>

          <h2 className="font-display text-2xl sm:text-4xl font-bold text-white">{headline}</h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">{reasonLabel}</p>
        </div>

        {/* Two Characters Side-by-Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {[p1, p2].map((player, idx) => {
            if (!player) return null;
            const skinDef = getSkinDefinition(player.skinId);
            const isWinner = !isDraw && winnerId === player.userId;
            const isLoserX1 = isX1 && !isDraw && winnerId && winnerId !== player.userId;
            const isMe = player.userId === currentUser.id;
            const longestCoop =
              !isX1 && ((idx === 0 && p1Time > p2Time) || (idx === 1 && p2Time > p1Time));

            return (
              <div
                key={player.userId}
                className={`rounded-2xl border-2 overflow-hidden flex flex-col ${
                  isWinner || longestCoop
                    ? 'bg-slate-950 border-amber-400 shadow-lg shadow-amber-500/10'
                    : isLoserX1
                      ? 'bg-slate-950 border-rose-500/50'
                      : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="h-44 relative bg-slate-950">
                  <ScenePreview3D
                    skinId={player.skinId}
                    mapId={room.mapId}
                    mode="turntable"
                    quality="low"
                    animState={
                      player.skinId === 'cristiano_ronaldo' || isWinner || longestCoop
                        ? 'victory'
                        : 'idle'
                    }
                    customConfig={player.customConfig}
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
                    <span className="px-2 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[10px] font-bold text-slate-200">
                      {player.role === 'host' ? 'ANFITRIÃO' : 'CONVIDADO'}
                    </span>
                    {isMe && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-[10px] font-extrabold text-emerald-300">
                        VOCÊ
                      </span>
                    )}
                  </div>
                  {(isWinner || longestCoop) && (
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-extrabold flex items-center gap-1 shadow">
                      <Crown className="w-3.5 h-3.5" />
                      {isX1 ? 'VENCEDOR' : 'MAIS TEMPO'}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-lg font-bold text-white">
                        {player.nickname}
                      </div>
                      <div className="text-[11px] text-amber-300 font-semibold">
                        Skin: {skinDef.name}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        player.alive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {player.alive ? 'SOBREVIVEU' : 'CAIU'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                        <Timer className="w-3 h-3 text-sky-400" /> Tempo
                      </div>
                      <div className="font-mono-num text-sm font-bold text-white mt-0.5">
                        {formatStopwatch(player.durationMs)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                        <Flag className="w-3 h-3 text-emerald-400" /> Distância
                      </div>
                      <div className="font-mono-num text-sm font-bold text-white mt-0.5">
                        {player.distance}m
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                        <Coins className="w-3 h-3 text-amber-400" /> Moedas
                      </div>
                      <div className="font-mono-num text-sm font-bold text-amber-300 mt-0.5">
                        {player.coins}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary footer */}
        {!isX1 && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-semibold">
              <Award className="w-4 h-4 text-amber-400" /> Maior sobrevivente na pista:
            </span>
            <span className="font-display font-bold text-amber-300 text-sm">
              {coopLongestSurvivor}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onExitToMenu}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4" /> VOLTAR AO MENU PRINCIPAL
        </button>
      </div>
    </div>
  );
}
