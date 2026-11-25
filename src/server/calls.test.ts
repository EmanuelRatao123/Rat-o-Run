import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SkinId, COMMON_SKIN_IDS } from '../shared/constants.ts';
import {
  cleanupExpiredVoiceCalls,
  getVoiceCallIceConfig,
  repoEndVoiceCall,
  repoGetActiveVoiceCallUserIds,
  repoGetVoiceCallState,
  repoHeartbeatVoiceCall,
  repoInviteFriendToCall,
  repoPostVoiceCallSignal,
  repoRespondToVoiceCall,
} from './callRepository.ts';
import { repoCreateUser } from './repository.ts';
import {
  repoGetFriendsOverview,
  repoRespondFriendRequest,
  repoSendFriendRequest,
} from './socialShopRepository.ts';
import { getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'ratao-db.json');
const hadExistingDb = fs.existsSync(DB_FILE);
const originalDbSnapshot = hadExistingDb ? fs.readFileSync(DB_FILE, 'utf8') : null;

async function runCallTests() {
  try {
    const suffix = Date.now().toString(36);
    const nowIso = new Date().toISOString();
    const oldSeenIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const makeUser = (id: string, nick: string, lastSeenAt = nowIso) => ({
      id,
      nickname: nick,
      nicknameLower: nick.toLowerCase(),
      passwordHash: 'hash_test',
      recoveryHash: null,
      role: 'player' as const,
      mustChangePassword: false,
      equippedSkin: 'ratao' as SkinId,
      unlockedSkins: [...COMMON_SKIN_IDS] as SkinId[],
      giftedSkins: [] as SkinId[],
      bestNoCoinTimeMs: 0,
      bestDistance: 0,
      bestScore: 0,
      bestSingleMatchCoins: 0,
      totalMatches: 0,
      totalCoins: 0,
      favoriteSkin: 'ratao' as SkinId,
      skinUsage: {},
      createdAt: nowIso,
      lastSeenAt,
    });

    const uA = makeUser(`vc_a_${suffix}`, `CallA_${suffix}`);
    const uB = makeUser(`vc_b_${suffix}`, `CallB_${suffix}`);
    const uC = makeUser(`vc_c_${suffix}`, `CallC_${suffix}`);
    const uD = makeUser(`vc_d_${suffix}`, `CallD_${suffix}`);
    const uOffline = makeUser(`vc_off_${suffix}`, `CallOff_${suffix}`, oldSeenIso);

    for (const u of [uA, uB, uC, uD, uOffline]) {
      await repoCreateUser(u);
    }

    // 1) Reject calling non-friend
    const nonFriendAttempt = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uB.id,
    });
    assert.equal(nonFriendAttempt.status, 'not_friends');

    // Make A<->B, C<->D, and A<->Offline accepted friends
    const makeFriends = async (
      reqUser: { id: string; nickname: string },
      accUser: { id: string; nickname: string }
    ) => {
      const req = await repoSendFriendRequest({
        requesterId: reqUser.id,
        requesterNickname: reqUser.nickname,
        targetUserId: accUser.id,
      });
      assert.equal(req.status, 'ok');
      if (req.status !== 'ok') throw new Error('Expected friend request ok');
      const acc = await repoRespondFriendRequest({
        userId: accUser.id,
        friendshipId: req.friendshipId,
        action: 'accept',
      });
      assert.equal(acc.status, 'ok');
    };

    await makeFriends(uA, uB);
    await makeFriends(uC, uD);
    await makeFriends(uA, uOffline);

    // 2) Reject calling offline friend
    const offlineAttempt = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uOffline.id,
    });
    assert.equal(offlineAttempt.status, 'target_offline');

    // 3) Invite -> Decline flow
    const invDecline = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uB.id,
    });
    assert.equal(invDecline.status, 'ok');
    if (invDecline.status !== 'ok') throw new Error('Expected call invite ok');

    // Third-party C cannot accept/decline A<->B call
    const forbiddenResp = await repoRespondToVoiceCall({
      userId: uC.id,
      callId: invDecline.call.id,
      action: 'decline',
    });
    assert.equal(forbiddenResp.status, 'forbidden');

    const declined = await repoRespondToVoiceCall({
      userId: uB.id,
      callId: invDecline.call.id,
      action: 'decline',
    });
    assert.equal(declined.status, 'ok');
    assert.equal(declined.call?.status, 'declined');

    // 4) Unanswered invite auto-expires after timeout
    const invExpire = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uB.id,
    });
    assert.equal(invExpire.status, 'ok');
    if (invExpire.status !== 'ok') throw new Error('Expected second invite ok');

    const db = getLocalDb();
    const storedExpire = db.voiceCalls.find((c) => c.id === invExpire.call.id)!;
    storedExpire.expiresAt = new Date(Date.now() - 5000).toISOString();
    saveLocalDb();

    await cleanupExpiredVoiceCalls(Date.now());
    assert.equal(storedExpire.status, 'missed');

    // 5) Two simultaneous independent calls: (A <-> B) AND (C <-> D)
    const callABRes = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uB.id,
    });
    const callCDRes = await repoInviteFriendToCall({
      callerUserId: uC.id,
      callerNickname: uC.nickname,
      targetUserId: uD.id,
    });
    assert.equal(callABRes.status, 'ok');
    assert.equal(callCDRes.status, 'ok');
    if (callABRes.status !== 'ok' || callCDRes.status !== 'ok') {
      throw new Error('Expected both simultaneous calls to start cleanly');
    }

    // Cannot invite busy user (A is busy, B is busy)
    const busyCheck = await repoInviteFriendToCall({
      callerUserId: uA.id,
      callerNickname: uA.nickname,
      targetUserId: uB.id,
    });
    assert.equal(busyCheck.status, 'caller_busy');

    // Verify incomingInvite seen by B and D cleanly
    const stateBPre = await repoGetVoiceCallState({ userId: uB.id });
    const stateDPre = await repoGetVoiceCallState({ userId: uD.id });
    assert.equal(stateBPre.incomingInvite?.id, callABRes.call.id);
    assert.equal(stateDPre.incomingInvite?.id, callCDRes.call.id);

    // Accept both calls
    const accAB = await repoRespondToVoiceCall({
      userId: uB.id,
      callId: callABRes.call.id,
      action: 'accept',
    });
    const accCD = await repoRespondToVoiceCall({
      userId: uD.id,
      callId: callCDRes.call.id,
      action: 'accept',
    });
    assert.equal(accAB.status, 'ok');
    assert.equal(accCD.status, 'ok');
    assert.equal(accAB.call?.status, 'accepted');
    assert.equal(accCD.call?.status, 'accepted');

    // Verify inCall status exposed on Friends overview and call state
    const activeSet = await repoGetActiveVoiceCallUserIds([uA.id, uB.id, uC.id, uD.id, uOffline.id]);
    assert.equal(activeSet.has(uA.id), true);
    assert.equal(activeSet.has(uB.id), true);
    assert.equal(activeSet.has(uC.id), true);
    assert.equal(activeSet.has(uD.id), true);
    assert.equal(activeSet.has(uOffline.id), false);

    const overviewA = await repoGetFriendsOverview(uA.id);
    const friendB = overviewA.friends.find((f) => f.userId === uB.id);
    assert.equal(friendB?.inCall, true);

    // Exchange WebRTC signaling in parallel for A<->B and C<->D with zero interference
    const offerAB = await repoPostVoiceCallSignal({
      userId: uA.id,
      callId: callABRes.call.id,
      type: 'offer',
      payload: { type: 'offer', sdp: 'v=0-offer-ab' },
    });
    const offerCD = await repoPostVoiceCallSignal({
      userId: uC.id,
      callId: callCDRes.call.id,
      type: 'offer',
      payload: { type: 'offer', sdp: 'v=0-offer-cd' },
    });
    assert.equal(offerAB.status, 'ok');
    assert.equal(offerCD.status, 'ok');

    // Unauthorized C trying to post signal to A<->B call must be forbidden!
    const hijackSignal = await repoPostVoiceCallSignal({
      userId: uC.id,
      callId: callABRes.call.id,
      type: 'ice',
      payload: { candidate: { candidate: 'spoof' } },
    });
    assert.equal(hijackSignal.status, 'forbidden');

    const pollB = await repoGetVoiceCallState({ userId: uB.id, callId: callABRes.call.id });
    const pollD = await repoGetVoiceCallState({ userId: uD.id, callId: callCDRes.call.id });
    assert.equal(pollB.signals.length, 1);
    assert.equal(pollB.signals[0].payload.sdp, 'v=0-offer-ab');
    assert.equal(pollD.signals.length, 1);
    assert.equal(pollD.signals[0].payload.sdp, 'v=0-offer-cd');

    // Send answer & ICE from B -> A and verify incremental sinceSeq cursor
    const ansAB = await repoPostVoiceCallSignal({
      userId: uB.id,
      callId: callABRes.call.id,
      type: 'answer',
      payload: { type: 'answer', sdp: 'v=0-answer-ab' },
    });
    const iceAB = await repoPostVoiceCallSignal({
      userId: uB.id,
      callId: callABRes.call.id,
      type: 'ice',
      payload: { candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9999 typ host' } },
    });
    assert.equal(ansAB.status, 'ok');
    assert.equal(iceAB.status, 'ok');

    const pollA1 = await repoGetVoiceCallState({ userId: uA.id, callId: callABRes.call.id });
    assert.equal(pollA1.signals.length, 2);
    const maxSeqA = pollA1.signals[pollA1.signals.length - 1].seq;
    const pollA2 = await repoGetVoiceCallState({
      userId: uA.id,
      callId: callABRes.call.id,
      sinceSeq: maxSeqA,
    });
    assert.equal(pollA2.signals.length, 0);

    // Heartbeat updates
    const hb = await repoHeartbeatVoiceCall({ userId: uA.id, callId: callABRes.call.id });
    assert.equal(hb.status, 'ok');

    // Ending A<->B call does NOT disturb ongoing C<->D call
    const forbiddenEnd = await repoEndVoiceCall({ userId: uC.id, callId: callABRes.call.id });
    assert.equal(forbiddenEnd.status, 'forbidden');

    const endAB = await repoEndVoiceCall({
      userId: uA.id,
      callId: callABRes.call.id,
      reason: 'hangup',
    });
    assert.equal(endAB.status, 'ok');
    assert.equal(endAB.call?.status, 'ended');

    const postEndStateB = await repoGetVoiceCallState({ userId: uB.id });
    assert.equal(postEndStateB.activeCall, null);
    assert.equal(postEndStateB.recentTerminalCall?.id, callABRes.call.id);

    const stillActiveCD = await repoGetVoiceCallState({ userId: uD.id });
    assert.equal(stillActiveCD.activeCall?.id, callCDRes.call.id);
    assert.equal(stillActiveCD.activeCall?.status, 'accepted');

    // Cleanly end C<->D too
    const endCD = await repoEndVoiceCall({
      userId: uD.id,
      callId: callCDRes.call.id,
      reason: 'hangup',
    });
    assert.equal(endCD.status, 'ok');

    // 6) Verify ICE STUN/TURN config resolution
    const defaultIce = getVoiceCallIceConfig();
    assert.equal(defaultIce.hasTurn, false);
    assert.ok(defaultIce.iceServers.length >= 1);

    process.env.TURN_URLS = 'turn:turn.example.com:3478,turns:turn.example.com:5349';
    process.env.TURN_USERNAME = 'test_user';
    process.env.TURN_CREDENTIAL = 'test_secret';
    try {
      const turnIce = getVoiceCallIceConfig();
      assert.equal(turnIce.hasTurn, true);
      assert.equal(turnIce.iceServers.length, 2);
      assert.equal(turnIce.iceServers[1].username, 'test_user');
      assert.equal(turnIce.iceServers[1].credential, 'test_secret');
    } finally {
      delete process.env.TURN_URLS;
      delete process.env.TURN_USERNAME;
      delete process.env.TURN_CREDENTIAL;
    }

    console.log('ALL_VOICE_CALL_TESTS_PASSED');
  } finally {
    if (hadExistingDb && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, { mode: 0o600 });
    } else if (!hadExistingDb && fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

runCallTests().catch((err) => {
  console.error('VOICE_CALL_TESTS_FAILED:', err);
  process.exit(1);
});
