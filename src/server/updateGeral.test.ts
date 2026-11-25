import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CollisionStateController } from '../game/collisionState.ts';
import {
  COMMON_SKIN_IDS,
  PUBLIC_CATALOG_SKINS,
  SECRET_EXCLUSIVE_SKIN_IDS,
  SkinId,
  isGiftableSkinId,
} from '../shared/constants.ts';
import { sanitizeUserProfile } from './auth.ts';
import {
  repoAdminGrantAllEligibleSkins,
  repoAdminGrantLockedSkin,
  repoAdminGrantSecretSkin,
  repoAdminListSecretSkinOwners,
  repoAdminRevokeLockedSkin,
  repoAdminRevokeSecretSkin,
  repoCanUserEquipSkin,
  repoCompleteMatchAndRecord,
  repoCreateActiveMatch,
  repoCreateUser,
  repoCreditWalletCoins,
  repoFindUserById,
  repoGetAllowedExclusiveSkinsForUser,
  repoGetCoinsLeaderboard,
  repoLogMatchDiagnostic,
  repoUpdateUserEquippedSkin,
} from './repository.ts';
import {
  repoBuySkate,
  repoConsumeMatchSkateUse,
  repoEquipSkate,
  repoGetFriendMessages,
  repoGetFriendsOverview,
  repoGetPlayerCapeConfig,
  repoGetPlayerLiveModeConfig,
  repoGetShopState,
  repoRemoveFriend,
  repoRespondFriendRequest,
  repoSearchPlayersForFriends,
  repoSendFriendMessage,
  repoSendFriendRequest,
  repoUpdatePlayerCapeConfig,
  repoUpdatePlayerLiveModeConfig,
} from './socialShopRepository.ts';
import { getDb as getLocalDb } from './store.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'ratao-db.json');
const hadExistingDb = fs.existsSync(DB_FILE);
const originalDbSnapshot = hadExistingDb ? fs.readFileSync(DB_FILE, 'utf8') : null;

async function runTests() {
  try {
    const suffix = Date.now().toString(36);
    const nowIso = new Date().toISOString();

    const makeUser = (id: string, nick: string, role: 'player' | 'admin' = 'player') => ({
      id,
      nickname: nick,
      nicknameLower: nick.toLowerCase(),
      passwordHash: 'hash_test',
      recoveryHash: null,
      role,
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
      lastSeenAt: nowIso,
    });

    const admin = makeUser(`ug_admin_${suffix}`, `AdminUG_${suffix}`, 'admin');
    const u1 = makeUser(`ug_u1_${suffix}`, `AlfaUG_${suffix}`);
    const u2 = makeUser(`ug_u2_${suffix}`, `BetaUG_${suffix}`);
    const u3 = makeUser(`ug_u3_${suffix}`, `GamaUG_${suffix}`);
    await repoCreateUser(admin);
    await repoCreateUser(u1);
    await repoCreateUser(u2);
    await repoCreateUser(u3);

    // 1. Verify 13 new locked skins start locked + Plankton is completely hidden & secret
    const new13Skins: SkinId[] = [
      'enderman',
      'deadpool',
      'mario',
      'luigi',
      'gigachad',
      'quandale_dingle',
      'doge',
      'ronaldinho_gaucho',
      'vini_jr',
      'rato_cosmico',
      'bob_esponja',
      'patrick',
      'lula_molusco',
    ];
    for (const s of new13Skins) {
      assert.equal(await repoCanUserEquipSkin(u1, s), false, `${s} deve iniciar bloqueada`);
      assert.ok(PUBLIC_CATALOG_SKINS.some((c) => c.id === s));
    }

    assert.ok(
      !PUBLIC_CATALOG_SKINS.some((c) => c.id === 'plankton'),
      'Plankton nunca no catálogo público'
    );
    assert.equal(isGiftableSkinId('plankton'), false, 'Plankton nunca presenteável');
    assert.ok(SECRET_EXCLUSIVE_SKIN_IDS.includes('plankton'));

    // Grant one of the 13 locked skins ('bob_esponja') and revoke
    const gBob = await repoAdminGrantLockedSkin({
      adminNickname: admin.nickname,
      targetNickname: u1.nickname,
      skinId: 'bob_esponja',
    });
    assert.equal(gBob.status, 'ok');
    assert.equal(await repoCanUserEquipSkin(u1, 'bob_esponja'), true);
    assert.equal(await repoCanUserEquipSkin(u2, 'bob_esponja'), false);
    await repoAdminRevokeLockedSkin({
      adminNickname: admin.nickname,
      userId: u1.id,
      skinId: 'bob_esponja',
    });
    assert.equal(await repoCanUserEquipSkin(u1, 'bob_esponja'), false);

    // Bulk grant must NOT grant Plankton
    await repoAdminGrantAllEligibleSkins({
      adminUser: admin,
      targetNickname: u3.nickname,
    });
    assert.equal(await repoCanUserEquipSkin(u3, 'plankton'), false, 'Bulk grant não concede Plankton');
    const u3Allowed = await repoGetAllowedExclusiveSkinsForUser(u3);
    assert.ok(!u3Allowed.includes('plankton'));

    // Secret Plankton admin-only grant / equip / sanitize / revoke
    assert.equal(await repoCanUserEquipSkin(admin, 'plankton'), false);
    const adminProfileBefore = sanitizeUserProfile(
      admin,
      null,
      await repoGetAllowedExclusiveSkinsForUser(admin)
    );
    assert.ok(!adminProfileBefore.unlockedSkins.includes('plankton'));

    const secretGrant = await repoAdminGrantSecretSkin({
      adminUser: admin,
      targetNickname: admin.nickname,
      skinId: 'plankton',
    });
    assert.equal(secretGrant.status, 'ok');
    assert.equal(await repoCanUserEquipSkin(admin, 'plankton'), true);
    await repoUpdateUserEquippedSkin(admin.id, 'plankton');
    const adminLoaded = (await repoFindUserById(admin.id))!;
    assert.equal(adminLoaded.equippedSkin, 'plankton');
    const secretOwners = await repoAdminListSecretSkinOwners(admin, 'plankton');
    assert.ok(secretOwners.some((o) => o.userId === admin.id && o.equipped));

    const secretRevoke = await repoAdminRevokeSecretSkin({
      adminUser: admin,
      userId: admin.id,
      skinId: 'plankton',
    });
    assert.equal(secretRevoke.status, 'ok');
    const adminAfterRevoke = (await repoFindUserById(admin.id))!;
    assert.equal(adminAfterRevoke.equippedSkin, 'ratao');
    assert.equal(await repoCanUserEquipSkin(adminAfterRevoke, 'plankton'), false);

    // 2. Friends System & Strict Private Chat
    const searchU2 = await repoSearchPlayersForFriends(u1.id, u2.nickname);
    assert.ok(searchU2.some((r) => r.id === u2.id && r.relation === 'none'));

    // Self request rejected
    const selfReq = await repoSendFriendRequest({
      requesterId: u1.id,
      requesterNickname: u1.nickname,
      targetUserId: u1.id,
    });
    assert.equal(selfReq.status, 'self_request');

    // Valid friend request u1 -> u2
    const req1 = await repoSendFriendRequest({
      requesterId: u1.id,
      requesterNickname: u1.nickname,
      targetNickname: u2.nickname,
    });
    assert.equal(req1.status, 'ok');
    if (req1.status !== 'ok') throw new Error('Expected ok');

    // Duplicate blocked
    const dupReq = await repoSendFriendRequest({
      requesterId: u1.id,
      requesterNickname: u1.nickname,
      targetUserId: u2.id,
    });
    assert.equal(dupReq.status, 'already_pending');

    // Non-friend chat strictly forbidden
    const chatDenied = await repoSendFriendMessage({
      senderUserId: u1.id,
      receiverUserId: u2.id,
      content: 'Oi antes de aceitar!',
    });
    assert.equal(chatDenied.status, 'not_friends');

    // Accept request
    const accRes = await repoRespondFriendRequest({
      userId: u2.id,
      friendshipId: req1.friendshipId,
      action: 'accept',
    });
    assert.equal(accRes.status, 'ok');

    // Send messages u1 -> u2 and check unread counter
    const m1 = await repoSendFriendMessage({
      senderUserId: u1.id,
      receiverUserId: u2.id,
      content: 'Bora jogar um X1?',
    });
    assert.equal(m1.status, 'ok');
    const ovU2BeforeRead = await repoGetFriendsOverview(u2.id);
    assert.equal(ovU2BeforeRead.totalUnreadMessages, 1);
    assert.equal(ovU2BeforeRead.friends.length, 1);

    // Reading marks messages as read
    const readRes = await repoGetFriendMessages({ userId: u2.id, friendUserId: u1.id });
    assert.equal(readRes.status, 'ok');
    if (readRes.status === 'ok') {
      assert.equal(readRes.messages.length, 1);
      assert.equal(readRes.messages[0].content, 'Bora jogar um X1?');
    }
    const ovU2AfterRead = await repoGetFriendsOverview(u2.id);
    assert.equal(ovU2AfterRead.totalUnreadMessages, 0);

    // Remove friend -> blocks chat again
    const rmRes = await repoRemoveFriend({ userId: u1.id, friendshipId: req1.friendshipId });
    assert.equal(rmRes.ok, true);
    const chatAfterRm = await repoSendFriendMessage({
      senderUserId: u1.id,
      receiverUserId: u2.id,
      content: 'Tentando após remover',
    });
    assert.equal(chatAfterRm.status, 'not_friends');

    // 3. Capes & Live Mode Persistence
    const savedCape = await repoUpdatePlayerCapeConfig(u1.id, {
      equippedCapeId: 'capa_camisa_10',
      shirt10Name: 'BRUXO',
      primaryColor: '#facc15',
      secondaryColor: '#16a34a',
      textColor: '#0f172a',
      backgroundStyle: 'striped',
    });
    assert.equal(savedCape.equippedCapeId, 'capa_camisa_10');
    assert.equal(savedCape.shirt10Name, 'BRUXO');
    const reloadedCape = await repoGetPlayerCapeConfig(u1.id);
    assert.equal(reloadedCape.equippedCapeId, 'capa_camisa_10');
    assert.equal(reloadedCape.backgroundStyle, 'striped');

    const savedLive = await repoUpdatePlayerLiveModeConfig(u1.id, {
      enabled: true,
      texts: [
        {
          id: 'live_t1',
          text: 'RUMO AO TOP 1!',
          color: '#facc15',
          fontSize: 24,
          position: 'top_center',
          fontFamily: 'display',
          shadow: true,
          durationSec: 5,
          enabled: true,
        },
      ],
    });
    assert.equal(savedLive.enabled, true);
    assert.equal(savedLive.texts[0].text, 'RUMO AO TOP 1!');
    const reloadedLive = await repoGetPlayerLiveModeConfig(u1.id);
    assert.equal(reloadedLive.enabled, true);
    assert.equal(reloadedLive.texts.length, 1);

    // 4. Match Persistence (No Coin idempotency + Normal coins + Best Single Match Coins Ranking)
    const ncToken = {
      matchId: `m_nc_${suffix}`,
      userId: u1.id,
      mapId: 'brasil' as const,
      skinId: 'ratao' as SkinId,
      mode: 'no_coin' as const,
      startedAt: Date.now() - 1000,
      signature: 'sig_nc',
      completed: false,
    };
    await repoCreateActiveMatch(ncToken);
    const ncMatchRecord = {
      id: ncToken.matchId,
      userId: u1.id,
      nickname: u1.nickname,
      mapId: 'brasil' as const,
      skinId: 'ratao' as SkinId,
      mode: 'no_coin' as const,
      noCoinTimeMs: 420,
      collectedCoin: false,
      coins: 0,
      distance: 15,
      score: 120,
      durationMs: 420,
      createdAt: new Date().toISOString(),
    };
    const nc1 = await repoCompleteMatchAndRecord({
      match: ncMatchRecord,
      user: (await repoFindUserById(u1.id))!,
      endReason: 'police',
    });
    assert.equal(nc1.ok, true);
    assert.equal(nc1.idempotent ?? false, false);
    assert.equal(nc1.summary?.noCoinTimeMs, 420);

    // Duplicate finish call returns idempotent result without incrementing totalMatches twice
    const ncDup = await repoCompleteMatchAndRecord({
      match: ncMatchRecord,
      user: (await repoFindUserById(u1.id))!,
      endReason: 'police',
    });
    assert.equal(ncDup.ok, true);
    assert.equal(ncDup.idempotent, true);
    assert.equal((await repoFindUserById(u1.id))?.totalMatches, 1);

    // Log diagnostic entry check
    await repoLogMatchDiagnostic({
      userId: u1.id,
      matchId: ncToken.matchId,
      mode: 'no_coin',
      stage: 'test_ok',
      status: 'ok',
      detail: 'Idempotency verified',
    });
    assert.ok(getLocalDb().matchDiagnosticLogs.some((l) => l.matchId === ncToken.matchId));

    // Normal mode matches for Single-Match Coins Leaderboard check:
    // u1 plays 3 matches: 180, 320, 210 -> total collected 710, best single match MUST be 320
    const runNormalMatch = async (uid: string, nick: string, mid: string, coins: number) => {
      const tok = {
        matchId: mid,
        userId: uid,
        mapId: 'brasil' as const,
        skinId: 'ratao' as SkinId,
        mode: 'normal' as const,
        startedAt: Date.now() - 10000,
        signature: `sig_${mid}`,
        completed: false,
      };
      await repoCreateActiveMatch(tok);
      const latestUser = (await repoFindUserById(uid))!;
      await repoCompleteMatchAndRecord({
        match: {
          id: mid,
          userId: uid,
          nickname: nick,
          mapId: 'brasil',
          skinId: 'ratao',
          mode: 'normal',
          noCoinTimeMs: 0,
          collectedCoin: coins > 0,
          coins,
          distance: coins * 5,
          score: coins * 15,
          durationMs: 25000,
          createdAt: new Date().toISOString(),
        },
        user: latestUser,
        endReason: 'police',
      });
    };

    await runNormalMatch(u1.id, u1.nickname, `m_n1_${suffix}`, 180);
    await runNormalMatch(u1.id, u1.nickname, `m_n2_${suffix}`, 320);
    await runNormalMatch(u1.id, u1.nickname, `m_n3_${suffix}`, 210);
    // u2 plays 1 match with 400 coins -> u2 must rank ABOVE u1 (400 > 320), even though u1 has 710 total!
    await runNormalMatch(u2.id, u2.nickname, `m_n4_${suffix}`, 400);
    // Give u1 +1000 promo coins -> MUST NOT boost u1's Coins Leaderboard record!
    await repoCreditWalletCoins({
      userId: u1.id,
      amount: 1000,
      sourceType: 'promo',
      eventKey: `promo_test_${suffix}`,
    });

    // 5. Shop: Insufficient funds -> Buy Skate -> Spend Coins -> Equip -> Idempotent Consume + Collision Protection
    const failBuy = await repoBuySkate({ userId: u3.id, skateId: 'skate_classico', quantity: 1 });
    assert.equal(failBuy.status, 'insufficient_coins');

    const buyRes = await repoBuySkate({ userId: u1.id, skateId: 'skate_fogo', quantity: 2 });
    assert.equal(buyRes.status, 'ok');
    if (buyRes.status !== 'ok') throw new Error('Expected skate purchase ok');
    assert.equal(buyRes.spentCoins, 500); // 2 x 250
    assert.equal(buyRes.availableCoins, 710 + 1000 - 500);
    assert.equal(buyRes.equippedSkateId, 'skate_fogo');

    const equipFail = await repoEquipSkate(u1.id, 'skate_dourado');
    assert.equal(equipFail.ok, false);

    const shopState = await repoGetShopState(u1.id);
    assert.equal(shopState.availableCoins, 1210);
    assert.equal(shopState.inventory.find((i) => i.skateId === 'skate_fogo')?.charges, 2);

    // Consume 1 charge with idempotency check (against an owned active match)
    await repoCreateActiveMatch({
      matchId: `m_use_${suffix}`,
      userId: u1.id,
      mapId: 'brasil',
      skinId: 'ratao',
      mode: 'normal',
      startedAt: Date.now() - 5000,
      signature: `sig_use_${suffix}`,
      completed: false,
    });
    const use1 = await repoConsumeMatchSkateUse({
      userId: u1.id,
      matchId: `m_use_${suffix}`,
      skateId: 'skate_fogo',
      mode: 'normal',
      eventKey: `evt_${suffix}_1`,
    });
    assert.equal(use1.consumed, true);
    if (use1.consumed) {
      assert.equal(use1.remainingCharges, 1);
      assert.equal(use1.alreadyRecorded, false);
    }

    const use1Dup = await repoConsumeMatchSkateUse({
      userId: u1.id,
      matchId: `m_use_${suffix}`,
      skateId: 'skate_fogo',
      mode: 'normal',
      eventKey: `evt_${suffix}_1`,
    });
    assert.equal(use1Dup.consumed, true);
    if (use1Dup.consumed) {
      assert.equal(use1Dup.remainingCharges, 1);
      assert.equal(use1Dup.alreadyRecorded, true);
    }

    // Verify CollisionStateController.forceRecoverWithLock protects player after Skate absorption
    const ctrl = new CollisionStateController();
    const hit1 = ctrl.resolveObstacleCollision({
      obstacleId: 101,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(hit1.outcome, 'slowed');
    assert.equal(ctrl.getSpeedState(), 'slow');
    ctrl.forceRecoverWithLock(1.15);
    assert.equal(ctrl.getSpeedState(), 'normal');
    const absorbedLock = ctrl.resolveObstacleCollision({
      obstacleId: 102,
      hoverboardActive: false,
      jetpackActive: false,
      alreadyEnded: false,
    });
    assert.equal(absorbedLock.outcome, 'ignored');

    // 6. Verify Global Coins Ranking is STILL strict single-match max (unaffected by Shop spend & Promo coins!)
    const coinsLb = await repoGetCoinsLeaderboard({ page: 1, pageSize: 20, currentUserId: u1.id });
    const entryU1 = coinsLb.entries.find((e) => e.userId === u1.id);
    const entryU2 = coinsLb.entries.find((e) => e.userId === u2.id);
    assert.ok(entryU1 && entryU2);
    assert.equal(entryU1.bestMatchCoins, 320, 'Ranking deve usar apenas melhor partida única (320)');
    assert.equal(entryU2.bestMatchCoins, 400, 'u2 com 400 em 1 partida deve superar u1 com 320');
    assert.ok(entryU2.rank < entryU1.rank, 'u2 deve ficar acima de u1 no ranking de moedas');

    console.log('ALL_UPDATE_GERAL_TESTS_PASSED');
  } finally {
    if (hadExistingDb && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, { mode: 0o600 });
    } else if (!hadExistingDb && fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

runTests().catch((err) => {
  console.error('UPDATE_GERAL_TESTS_FAILED:', err);
  process.exit(1);
});
