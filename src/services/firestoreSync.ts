import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { COMMON_SKIN_IDS, MapId, SkinId } from '../shared/constants.ts';

export async function syncFirebaseUserProfile(nickname: string, equippedSkin: SkinId): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        nickname: nickname.slice(0, 24),
        equippedSkin,
        unlockedSkins: COMMON_SKIN_IDS,
        bestNoCoinTimeMs: 0,
        bestDistance: 0,
        bestScore: 0,
        totalMatches: 0,
        totalCoins: 0,
        favoriteSkin: equippedSkin,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'users', user.uid, 'private', 'info'), {
        uid: user.uid,
        email: user.email || '',
        role: 'player',
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        equippedSkin,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncMatchToFirestore(params: {
  matchId: string;
  nickname: string;
  skinId: SkinId;
  mapId: MapId;
  noCoinTimeMs: number;
  coins: number;
  distance: number;
  score: number;
  durationMs: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const matchPath = `matches/${params.matchId}`;
  try {
    await setDoc(doc(db, 'matches', params.matchId), {
      uid: user.uid,
      nickname: params.nickname.slice(0, 24),
      skinId: params.skinId,
      mapId: params.mapId,
      noCoinTimeMs: Math.round(params.noCoinTimeMs),
      coins: Math.round(params.coins),
      distance: Math.round(params.distance),
      score: Math.round(params.score),
      durationMs: Math.round(params.durationMs),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, matchPath);
  }

  const lbPath = `leaderboard/${user.uid}`;
  try {
    const lbRef = doc(db, 'leaderboard', user.uid);
    const lbSnap = await getDoc(lbRef);
    const prevBest = lbSnap.exists() ? Number(lbSnap.data().noCoinTimeMs || 0) : -1;
    if (params.noCoinTimeMs >= prevBest) {
      await setDoc(lbRef, {
        uid: user.uid,
        nickname: params.nickname.slice(0, 24),
        skinId: params.skinId,
        mapId: params.mapId,
        noCoinTimeMs: Math.round(params.noCoinTimeMs),
        distance: Math.round(params.distance),
        achievedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, lbPath);
  }

  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      await updateDoc(userRef, {
        bestNoCoinTimeMs: Math.max(Number(data.bestNoCoinTimeMs || 0), Math.round(params.noCoinTimeMs)),
        bestDistance: Math.max(Number(data.bestDistance || 0), Math.round(params.distance)),
        bestScore: Math.max(Number(data.bestScore || 0), Math.round(params.score)),
        totalMatches: Number(data.totalMatches || 0) + 1,
        totalCoins: Number(data.totalCoins || 0) + Math.round(params.coins),
        equippedSkin: params.skinId,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export async function fetchFirestoreLeaderboard(maxRows = 100) {
  const path = 'leaderboard';
  try {
    const q = query(
      collection(db, 'leaderboard'),
      orderBy('noCoinTimeMs', 'desc'),
      limit(maxRows)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d, idx) => ({
      rank: idx + 1,
      ...(d.data() as Record<string, unknown>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchActiveFirestoreMessages() {
  const path = 'globalMessages';
  try {
    const q = query(
      collection(db, 'globalMessages'),
      where('active', '==', true),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
