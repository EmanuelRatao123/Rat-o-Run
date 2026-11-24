import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_SKINS,
  BULK_GRANTABLE_ALL_SKIN_IDS,
  BULK_GRANTABLE_RESTRICTED_SKIN_IDS,
  COMMON_SKIN_IDS,
  EXCLUSIVE_SKIN_IDS,
  LOCKED_EXCLUSIVE_SKINS,
  LOCKED_EXCLUSIVE_SKIN_IDS,
  RESTRICTED_NON_BULK_SKIN_IDS,
  SkinId,
  isGiftableSkinId,
  isLockedExclusiveSkinId,
} from '../shared/constants.ts';
import { sanitizeUserProfile } from './auth.ts';
import {
  repoCreatePromoCode,
  repoRedeemPromoCode,
} from './featureRepository.ts';
import {
  repoAdminGetPlayerSkinsSummary,
  repoAdminGrantAllEligibleSkins,
  repoAdminGrantLockedSkin,
  repoAdminListExclusiveSkinOwners,
  repoAdminListSkinGrantHistory,
  repoAdminRevokeBulkGrantedSkins,
  repoAdminRevokeLockedSkin,
  repoCanUserEquipSkin,
  repoCreateUser,
  repoFindUserById,
  repoGetAllowedExclusiveSkinsForUser,
  repoGiftSkinToPlayer,
  repoSearchPlayersForAdmin,
  repoSyncExclusiveSkinPermissions,
  repoUpdateUserEquippedSkin,
} from './repository.ts';
import { getDb as getLocalDb, saveDb as saveLocalDb } from './store.ts';

const DB_FILE = path.resolve(process.cwd(), 'data', 'ratao-db.json');
const hadExistingDb = fs.existsSync(DB_FILE);
const originalDbSnapshot = hadExistingDb ? fs.readFileSync(DB_FILE, 'utf8') : null;

async function runTests() {
  try {
    // 1. Catalog structure assertions
    const expectedIds = [
      'homem_aranha',
      'jegue',
      'capitao_america',
      'pele',
      'maradona',
      'messi',
      'neymar_atual',
      'hacker',
      'bandido',
      'ghost_face',
      'shrek',
      'herobrine',
      'freddy_fazbear',
      'sonic',
      'tung_tung_sahur',
      'cristiano_ronaldo',
    ];
    assert.equal(LOCKED_EXCLUSIVE_SKINS.length, 16, 'Deve haver exatamente 16 skins exclusivas bloqueadas');
    for (const id of expectedIds) {
      assert.ok(LOCKED_EXCLUSIVE_SKIN_IDS.includes(id as SkinId & (typeof LOCKED_EXCLUSIVE_SKIN_IDS)[number]));
      assert.ok(!(COMMON_SKIN_IDS as string[]).includes(id), `${id} não pode ser comum`);
      assert.ok(!(EXCLUSIVE_SKIN_IDS as string[]).includes(id), `${id} não pode ser Top1/2/3/Rei`);
      assert.ok(isLockedExclusiveSkinId(id));
      assert.ok(isGiftableSkinId(id));
    }

    // 2. New player starts with all 10 skins locked and Ratão equipped
    const suffix = Date.now().toString(36);
    const nowIso = new Date().toISOString();
    const p1 = {
      id: `test_u1_${suffix}`,
      nickname: `JogadorTeste1_${suffix}`,
      nicknameLower: `jogadorteste1_${suffix}`,
      passwordHash: 'hash_1',
      recoveryHash: null,
      role: 'player' as const,
      mustChangePassword: false,
      equippedSkin: 'ratao' as SkinId,
      unlockedSkins: [...COMMON_SKIN_IDS] as SkinId[],
      giftedSkins: [] as SkinId[],
      bestNoCoinTimeMs: 0,
      bestDistance: 0,
      bestScore: 0,
      totalMatches: 0,
      totalCoins: 0,
      favoriteSkin: 'ratao' as SkinId,
      skinUsage: {},
      createdAt: nowIso,
      lastSeenAt: nowIso,
    };
    const p2 = {
      ...p1,
      id: `test_u2_${suffix}`,
      nickname: `JogadorTeste2_${suffix}`,
      nicknameLower: `jogadorteste2_${suffix}`,
      passwordHash: 'hash_2',
      unlockedSkins: [...COMMON_SKIN_IDS],
      giftedSkins: [] as SkinId[],
      skinUsage: {},
    };
    await repoCreateUser(p1);
    await repoCreateUser(p2);

    assert.equal(p1.equippedSkin, 'ratao');
    for (const id of LOCKED_EXCLUSIVE_SKIN_IDS) {
      assert.ok(!p1.unlockedSkins.includes(id), `Conta nova não deve ter ${id}`);
      assert.equal(await repoCanUserEquipSkin(p1, id), false, `Sem permissão para ${id}`);
    }

    // 3. Leaderboard Top 1 rank sync must NEVER unlock any of the 10 locked skins
    const localDb = getLocalDb();
    localDb.users[p1.id].bestNoCoinTimeMs = 999_999_999;
    localDb.users[p1.id].bestDistance = 999_999;
    // Simulate tampered unlockedSkins entry without exclusive_skin_permissions record
    localDb.users[p1.id].unlockedSkins.push('homem_aranha');
    saveLocalDb();

    await repoSyncExclusiveSkinPermissions();
    const p1AllowedAfterRank = await repoGetAllowedExclusiveSkinsForUser(p1);
    assert.ok(p1AllowedAfterRank.includes('lenda_suprema'), 'Top 1 deve receber apenas Lenda Suprema');
    for (const id of LOCKED_EXCLUSIVE_SKIN_IDS) {
      assert.ok(!p1AllowedAfterRank.includes(id), `Ranking nunca deve liberar ${id}`);
      assert.equal(await repoCanUserEquipSkin(p1, id), false, `Manipulação sem permissão falha para ${id}`);
    }
    const sanitizedTampered = sanitizeUserProfile(localDb.users[p1.id], 1, p1AllowedAfterRank);
    assert.ok(!sanitizedTampered.unlockedSkins.includes('homem_aranha'));

    // 4. Cannot grant or revoke Top1/2/3 or Ratão Rei via locked-skin admin API
    const invalidGrantKing = await repoAdminGrantLockedSkin({
      adminNickname: 'AdminTest',
      targetNickname: p1.nickname,
      skinId: 'ratao_rei',
    });
    assert.equal(invalidGrantKing.status, 'invalid_skin');

    const invalidGrantTop1 = await repoAdminGrantLockedSkin({
      adminNickname: 'AdminTest',
      targetNickname: p1.nickname,
      skinId: 'lenda_suprema',
    });
    assert.equal(invalidGrantTop1.status, 'invalid_skin');

    // 5. Admin grants 'homem_aranha' exclusively to p1 (p2 stays locked)
    const granted = await repoAdminGrantLockedSkin({
      adminNickname: 'AdminTest',
      targetNickname: p1.nickname,
      skinId: 'homem_aranha',
    });
    assert.equal(granted.status, 'ok');
    assert.equal(await repoCanUserEquipSkin(p1, 'homem_aranha'), true);
    assert.equal(await repoCanUserEquipSkin(p2, 'homem_aranha'), false);

    // Equip 'homem_aranha' for p1
    await repoUpdateUserEquippedSkin(p1.id, 'homem_aranha');
    const p1Reloaded = await repoFindUserById(p1.id);
    assert.equal(p1Reloaded?.equippedSkin, 'homem_aranha');

    // Admin owners query & player search
    const ownersSpider = await repoAdminListExclusiveSkinOwners('homem_aranha');
    assert.ok(ownersSpider.some((o) => o.userId === p1.id && o.equipped === true));
    assert.ok(!ownersSpider.some((o) => o.userId === p2.id));

    const searchRes = await repoSearchPlayersForAdmin(p1.nickname);
    assert.ok(searchRes[0]?.activeExclusivePermissions?.includes('homem_aranha'));

    // 6. Admin revokes 'homem_aranha' -> clears equippedSkin back to 'ratao' & blocks re-equip
    const revoked = await repoAdminRevokeLockedSkin({
      adminNickname: 'AdminTest',
      userId: p1.id,
      skinId: 'homem_aranha',
    });
    assert.equal(revoked.status, 'ok');
    if (revoked.status === 'ok') {
      assert.equal(revoked.resetEquipped, true);
    }
    const p1AfterRevoke = await repoFindUserById(p1.id);
    assert.equal(p1AfterRevoke?.equippedSkin, 'ratao');
    assert.equal(await repoCanUserEquipSkin(p1AfterRevoke!, 'homem_aranha'), false);
    const ownersAfterRevoke = await repoAdminListExclusiveSkinOwners('homem_aranha');
    assert.ok(!ownersAfterRevoke.some((o) => o.userId === p1.id));

    // 7. Promo code creation & redemption for one of the 10 new locked skins ('ghost_face')
    const promoRes = await repoCreatePromoCode({
      adminNickname: 'AdminTest',
      code: `GHOST_${suffix.toUpperCase()}`,
      description: 'Desbloqueia Ghost Face',
      rewardType: 'skin',
      rewardSkinId: 'ghost_face',
      rewardAmount: 0,
      rewardMetadata: {},
      maxUses: 5,
      isInfinite: false,
      active: true,
      expiresAt: null,
    });
    assert.equal(promoRes.status, 'ok');

    const redeemRes = await repoRedeemPromoCode({
      user: p2,
      rawCode: `GHOST_${suffix.toUpperCase()}`,
    });
    assert.equal(redeemRes.status, 'ok');
    assert.equal(await repoCanUserEquipSkin(p2, 'ghost_face'), true);
    assert.equal(await repoCanUserEquipSkin(p1, 'ghost_face'), false);

    const ghostOwners = await repoAdminListExclusiveSkinOwners('ghost_face');
    assert.ok(ghostOwners.some((o) => o.userId === p2.id && o.reason === 'promo_code'));

    // 8. Verify all 6 famous new skins individually (locked by default, admin grant/equip/persist/revoke + promo code)
    const sixFamousSkins: SkinId[] = [
      'shrek',
      'herobrine',
      'freddy_fazbear',
      'sonic',
      'tung_tung_sahur',
      'cristiano_ronaldo',
    ];
    for (const skinId of sixFamousSkins) {
      assert.equal(await repoCanUserEquipSkin(p1, skinId), false, `${skinId} deve começar bloqueada`);
      const grantSix = await repoAdminGrantLockedSkin({
        adminNickname: 'AdminTest',
        targetNickname: p1.nickname,
        skinId,
      });
      assert.equal(grantSix.status, 'ok');
      assert.equal(await repoCanUserEquipSkin(p1, skinId), true);
      await repoUpdateUserEquippedSkin(p1.id, skinId);
      const reloaded = await repoFindUserById(p1.id);
      assert.equal(reloaded?.equippedSkin, skinId);
      const allowedReloaded = await repoGetAllowedExclusiveSkinsForUser(reloaded!);
      assert.ok(allowedReloaded.includes(skinId));

      const revokeSix = await repoAdminRevokeLockedSkin({
        adminNickname: 'AdminTest',
        userId: p1.id,
        skinId,
      });
      assert.equal(revokeSix.status, 'ok');
      assert.equal(await repoCanUserEquipSkin(p1, skinId), false);
    }

    // Promo code redemption for cristiano_ronaldo
    const cr7Promo = await repoCreatePromoCode({
      adminNickname: 'AdminTest',
      code: `CR7_${suffix.toUpperCase()}`,
      description: 'Desbloqueia Cristiano Ronaldo',
      rewardType: 'skin',
      rewardSkinId: 'cristiano_ronaldo',
      rewardAmount: 0,
      rewardMetadata: {},
      maxUses: 3,
      isInfinite: false,
      active: true,
      expiresAt: null,
    });
    assert.equal(cr7Promo.status, 'ok');
    const cr7Redeem = await repoRedeemPromoCode({
      user: p2,
      rawCode: `CR7_${suffix.toUpperCase()}`,
    });
    assert.equal(cr7Redeem.status, 'ok');
    assert.equal(await repoCanUserEquipSkin(p2, 'cristiano_ronaldo'), true);
    await repoUpdateUserEquippedSkin(p2.id, 'cristiano_ronaldo');
    const p2Persisted = await repoFindUserById(p2.id);
    assert.equal(p2Persisted?.equippedSkin, 'cristiano_ronaldo');

    // 9. GERENCIAR SKINS: CONCEDER TODAS AS SKINS + REMOÇÃO SELETIVA + HISTÓRICO (com conta comum)
    const adminActor = {
      ...p1,
      id: `test_admin_${suffix}`,
      nickname: `AdminBulk_${suffix}`,
      nicknameLower: `adminbulk_${suffix}`,
      role: 'admin' as const,
    };
    const ordinaryPlayer = {
      ...p1,
      id: `test_ordinary_${suffix}`,
      nickname: `ComumTeste_${suffix}`,
      nicknameLower: `comumteste_${suffix}`,
      role: 'player' as const,
      bestNoCoinTimeMs: 0,
      bestDistance: 0,
      bestScore: 0,
      unlockedSkins: [...COMMON_SKIN_IDS] as SkinId[],
      giftedSkins: [] as SkinId[],
      equippedSkin: 'ratao' as SkinId,
      skinUsage: {},
    };
    await repoCreateUser(adminActor);
    await repoCreateUser(ordinaryPlayer);

    // Non-admin CANNOT invoke bulk grant or bulk revoke
    const deniedBulk = await repoAdminGrantAllEligibleSkins({
      adminUser: ordinaryPlayer,
      targetNickname: p2.nickname,
    });
    assert.equal(deniedBulk.status, 'forbidden');

    // Give ordinaryPlayer 1 legitimate promo-code skin ('cristiano_ronaldo') & 1 individual gift ('homem_aranha') BEFORE bulk grant
    const cr7ForOrdinary = await repoRedeemPromoCode({
      user: ordinaryPlayer,
      rawCode: `CR7_${suffix.toUpperCase()}`,
    });
    assert.equal(cr7ForOrdinary.status, 'ok');

    const giftSpider = await repoGiftSkinToPlayer({
      adminNickname: adminActor.nickname,
      targetNickname: ordinaryPlayer.nickname,
      skinId: 'homem_aranha',
    });
    assert.equal(giftSpider.status, 'ok');

    // Check summary before bulk grant
    const summaryBefore = await repoAdminGetPlayerSkinsSummary(ordinaryPlayer.nickname);
    assert.ok(summaryBefore);
    assert.equal(summaryBefore.totalUnlockedCount, COMMON_SKIN_IDS.length + 2);
    assert.equal(summaryBefore.legitimateSpecialCount, 2);
    assert.equal(summaryBefore.bulkGrantedCount, 0);

    // Execute CONCEDER TODAS AS SKINS for ordinary account
    const bulkRes = await repoAdminGrantAllEligibleSkins({
      adminUser: adminActor,
      targetNickname: ordinaryPlayer.nickname,
    });
    assert.equal(bulkRes.status, 'ok');
    if (bulkRes.status === 'ok') {
      assert.equal(bulkRes.alreadyHadAll, false);
      assert.equal(bulkRes.grantedSkins.length, BULK_GRANTABLE_RESTRICTED_SKIN_IDS.length - 2);
      assert.equal(bulkRes.summary.totalUnlockedCount, BULK_GRANTABLE_ALL_SKIN_IDS.length);
      assert.equal(bulkRes.summary.totalCatalogSkins, ALL_SKINS.length);
      assert.equal(bulkRes.summary.legitimateSpecialCount, 2);
      assert.equal(bulkRes.summary.bulkGrantedCount, BULK_GRANTABLE_RESTRICTED_SKIN_IDS.length - 2);
      assert.equal(bulkRes.summary.protectedExclusiveOwned.length, 0);
      assert.ok(bulkRes.historyEntry);
    }

    // Verify ordinary player can equip common + Meu Ratão + famous/special, and CANNOT equip Ratão Rei or Top 1/2/3
    const ordinaryReloaded = (await repoFindUserById(ordinaryPlayer.id))!;
    assert.equal(ordinaryReloaded.role, 'player', 'Conta comum não pode virar admin');
    assert.equal(ordinaryReloaded.bestNoCoinTimeMs, 0, 'Ranking não pode ser alterado');

    for (const allowedId of BULK_GRANTABLE_ALL_SKIN_IDS) {
      assert.equal(
        await repoCanUserEquipSkin(ordinaryReloaded, allowedId),
        true,
        `Conta comum deve poder equipar ${allowedId}`
      );
    }
    for (const forbiddenId of RESTRICTED_NON_BULK_SKIN_IDS) {
      assert.equal(
        await repoCanUserEquipSkin(ordinaryReloaded, forbiddenId),
        false,
        `Conta comum NÃO pode receber ${forbiddenId}`
      );
      assert.ok(
        !ordinaryReloaded.unlockedSkins.includes(forbiddenId),
        `${forbiddenId} não pode estar em unlockedSkins`
      );
    }

    // Idempotency check: running CONCEDER TODAS again must not duplicate permissions
    const bulkAgain = await repoAdminGrantAllEligibleSkins({
      adminUser: adminActor,
      targetNickname: ordinaryPlayer.nickname,
    });
    assert.equal(bulkAgain.status, 'ok');
    if (bulkAgain.status === 'ok') {
      assert.equal(bulkAgain.alreadyHadAll, true);
      assert.equal(bulkAgain.grantedSkins.length, 0);
    }
    const localAfterBulk = getLocalDb();
    const activePermRows = localAfterBulk.exclusiveSkinPermissions.filter(
      (p) => p.userId === ordinaryPlayer.id && p.active
    );
    const uniquePermSkins = new Set(activePermRows.map((p) => p.skinId));
    assert.equal(activePermRows.length, uniquePermSkins.size, 'Sem linhas duplicadas no banco');

    // Equip a bulk-granted skin ('shrek'), then test selective revocation
    await repoUpdateUserEquippedSkin(ordinaryPlayer.id, 'shrek');
    const revokeBulkRes = await repoAdminRevokeBulkGrantedSkins({
      adminUser: adminActor,
      targetNickname: ordinaryPlayer.nickname,
    });
    assert.equal(revokeBulkRes.status, 'ok');
    if (revokeBulkRes.status === 'ok') {
      assert.equal(revokeBulkRes.resetEquipped, true, 'Skin equipada em massa volta para Ratão');
      assert.equal(revokeBulkRes.revokedSkins.length, BULK_GRANTABLE_RESTRICTED_SKIN_IDS.length - 2);
      assert.equal(revokeBulkRes.summary.legitimateSpecialCount, 2);
      assert.equal(revokeBulkRes.summary.bulkGrantedCount, 0);
      assert.equal(revokeBulkRes.summary.totalUnlockedCount, COMMON_SKIN_IDS.length + 2);
    }

    const ordinaryAfterRevoke = (await repoFindUserById(ordinaryPlayer.id))!;
    assert.equal(ordinaryAfterRevoke.equippedSkin, 'ratao');
    assert.equal(await repoCanUserEquipSkin(ordinaryAfterRevoke, 'shrek'), false);
    assert.equal(await repoCanUserEquipSkin(ordinaryAfterRevoke, 'meu_ratao'), false);
    // Legitimate promo & gift skins MUST survive bulk revocation!
    assert.equal(await repoCanUserEquipSkin(ordinaryAfterRevoke, 'cristiano_ronaldo'), true);
    assert.equal(await repoCanUserEquipSkin(ordinaryAfterRevoke, 'homem_aranha'), true);

    // Grant history recorded both operations
    const grantHist = await repoAdminListSkinGrantHistory(ordinaryPlayer.nickname);
    assert.equal(grantHist.length, 2);
    assert.equal(grantHist[0].action, 'revoke_bulk');
    assert.equal(grantHist[1].action, 'grant_all');
    assert.equal(grantHist[1].adminNickname, adminActor.nickname);

    console.log('ALL_LOCKED_SKINS_TESTS_PASSED');
  } finally {
    // Restore original local DB file cleanly so test data doesn't pollute workspace
    if (hadExistingDb && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, { mode: 0o600 });
    } else if (!hadExistingDb && fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

runTests().catch((err) => {
  console.error('LOCKED_SKINS_TESTS_FAILED:', err);
  process.exit(1);
});
