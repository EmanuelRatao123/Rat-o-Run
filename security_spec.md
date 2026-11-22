# Security Specification - RATÃO RUN 3D

## 1. Data Invariants
1. A user profile under `/users/{userId}` can only be created or updated by `request.auth.uid == userId` (or an admin) with `email_verified == true`.
2. Private PII (`/users/{userId}/private/info`) is strictly isolated to owner or admin; players cannot set `role: 'admin'`.
3. A leaderboard entry `/leaderboard/{userId}` can only be written by the owner `userId`, must match `uid == request.auth.uid`, and `noCoinTimeMs` cannot exceed 3,600,000 ms (1 hour) or decrease below 0.
4. A match record `/matches/{matchId}` must belong to `request.auth.uid` and `noCoinTimeMs <= durationMs`.
5. Global messages, polls, gifts, admin logs, and game settings can ONLY be created, updated, or deleted by verified admins (`isAdmin()`).
6. Votes under `/polls/{pollId}/votes/{voteId}` must have `voteId == request.auth.uid`, `exists(/databases/$(database)/documents/polls/$(pollId))`, and the poll must be `active == true`; once cast, votes are immutable (no update/delete by players).

## 2. The "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. **Identity Spoofing on Match**: `{ uid: "other_user", nickname: "Hacker", skinId: "ratao", mapId: "brasil", noCoinTimeMs: 10000, coins: 0, distance: 100, score: 500, durationMs: 10000 }` written by `attacker_uid`.
2. **Self-Assigned Admin Role**: `{ uid: "attacker_uid", email: "a@b.com", role: "admin" }` written to `/users/attacker_uid/private/info`.
3. **Shadow Ghost Field on User**: `{ uid: "attacker_uid", nickname: "Attacker", equippedSkin: "ratao", bestNoCoinTimeMs: 0, totalMatches: 0, isAdmin: true }` written to `/users/attacker_uid`.
4. **Unverified Email Spoofing**: Admin email claim with `request.auth.token.email_verified == false`.
5. **PII Read by Non-Owner**: Reading `/users/victim_uid/private/info` as `attacker_uid`.
6. **Non-Admin Broadcast Message**: Creating `/globalMessages/msg1` as a regular player.
7. **Non-Admin Poll Creation**: Creating `/polls/poll1` as a regular player.
8. **Duplicate / Spoofed Vote**: Creating `/polls/poll1/votes/other_uid` as `attacker_uid`.
9. **Vote After Poll Closed**: Creating `/polls/closed_poll/votes/attacker_uid` when poll `active == false`.
10. **Non-Admin Skin Gift**: Creating `/gifts/gift1` as a regular player.
11. **Oversized Poison ID**: Writing to `/matches/${"A".repeat(300)}` (blocked by `isValidId`).
12. **Impossible No-Coin Time**: Writing `/leaderboard/attacker_uid` with `noCoinTimeMs: 999999999` or `noCoinTimeMs > durationMs`.
