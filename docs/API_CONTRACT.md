# API JSON Contract

The JSON wire format (REST request/response bodies and WebSocket payloads) is
**lowerCamelCase**. This document is the single reference for the naming rules
and the complete history of the casing cutover that closed it (feature
`api-casing`).

Enforcement: `backend/casing/inventory_test.go` reflects over every registered
wire-contract struct and fails on any JSON key that is not lowerCamelCase. Its
allowlist is now empty, so the contract is self-guarding.

## Naming rules

- **lowerCamelCase**: the key starts with a lowercase letter and contains only
  letters and digits.
- **Acronym `ID`** stays uppercase after the first word: `messageID`, `groupID`,
  `replyToMessageID`, `joinedMessageID`, `statusID`. A lone identifier is `id`.
  `statusId` is invalid (`Id` → `ID`).
- **`Url`**, not `URL`: `mediaUrl`, `avatarUrl`, `wallpaperUrl`,
  `contactAvatarUrl`.
- **`snake_case` is split on `_`**: `avatar_url` → `avatarUrl`, `last_seen` →
  `lastSeen`, `contact_name` → `contactName`, `old_username` → `oldUsername`.
- **Single-word keys are unchanged**: `error`, `message`, `ticket`, `success`,
  `url`, `size`, `filename`, `id`, `name`, `status`, `time`, `type`, etc.

## Out of scope (not part of this contract)

The cutover renamed JSON **keys** only. The following keep their existing form
and were deliberately untouched:

- URL paths and query parameters (for example `/api/v1/status`, `?after=`,
  `?ticket=`).
- HTTP header names, including `X-Has-More`, `X-Has-More-Older`,
  `X-Has-More-Newer`.
- Database columns and `gorm:"column:..."` tags (which stay `snake_case`).
- Cookies.
- Third-party payload formats: the GitHub issue body sent by the bug-report
  service (`models.GitHubIssue`: `title`/`body`/`labels`) and ZegoCloud tokens.
- Error and info envelopes that are a single word: `{"error": ...}` and
  `{"message": ...}`.

## Old → new key table

Every JSON key renamed by this feature, derived from the branch diff
(`git diff main...HEAD` for struct `json:"..."` tags, plus the hand-built
WebSocket payloads that reflection cannot see). "Kind" is `casing` for pure
case/acronym fixes, `semantic` for a deliberate rename beyond casing, and the
hand-built/AC7 annotations mark keys that do not live in a reflected struct tag.

| Old key | New key | Kind |
|---------|---------|------|
| `AllViewed` | `allViewed` | casing |
| `avatar_url` | `avatarUrl` | casing |
| `AvatarUrl` | `avatarUrl` | casing |
| `BackgroundColor` | `backgroundColor` | casing |
| `Caption` | `caption` | casing |
| `ClientID` | `clientID` | casing |
| `contact_name` | `contactName` | casing |
| `ContactAvatarUrl` | `contactAvatarUrl` | casing |
| `ContactName` | `contactName` | casing |
| `Contacts` | `contacts` | casing |
| `ContactTelephon` | `contactTelephon` | casing |
| `ContactUsername` | `contactUsername` | casing |
| `Count` | `count` | casing |
| `CreatedAt` | `createdAt` | casing |
| `CreatorTelephon` | `creatorTelephon` | casing |
| `Description` | `description` | casing |
| `DisappearSeconds` | `disappearSeconds` | casing |
| `Edited` | `edited` | casing |
| `Emoji` | `emoji` | casing |
| `ExpiresAt` | `expiresAt` | casing |
| `Gmail` | `email` | semantic |
| `GroupID` | `groupID` | casing |
| `ID` | `id` | casing |
| `IsContact` | `isContact` | casing |
| `JoinedMessageID` | `joinedMessageID` | casing |
| `Kind` | `kind` | casing |
| `last_seen` | `lastSeen` | casing |
| `LastDeliveredMessageID` | `lastDeliveredMessageID` | casing |
| `LastReadMessageID` | `lastReadMessageID` | casing |
| `LastUpdated` | `lastUpdated` | casing |
| `MediaType` | `mediaType` | casing |
| `MediaUrl` | `mediaUrl` | casing |
| `MemberCount` | `memberCount` | casing |
| `Members` | `members` | casing |
| `Message` | `message` | casing |
| `MessageID` | `messageID` | casing |
| `Messages` | `messages` | casing |
| `Mine` | `mine` | casing |
| `Muted` | `muted` | casing |
| `MutedUntil` | `mutedUntil` | casing |
| `Name` | `name` | casing |
| `new_username` | `newUsername` | casing (WS hand-built) |
| `Number` | `telephon` | semantic |
| `number` | `telephon` | semantic |
| `numero` | `telephon` | semantic |
| `old_username` | `oldUsername` | casing (WS hand-built) |
| `OnlyAdminsCanAddMembers` | `onlyAdminsCanAddMembers` | casing |
| `OnlyAdminsCanEditInfo` | `onlyAdminsCanEditInfo` | casing |
| `OnlyAdminsCanSend` | `onlyAdminsCanSend` | casing |
| `Reactions` | `reactions` | casing |
| `Receptor` | `receptor` | casing |
| `ReplyToMessage` | `replyToMessage` | casing |
| `ReplyToMessageID` | `replyToMessageID` | casing |
| `ReplyToTelephon` | `replyToTelephon` | casing |
| `Role` | `role` | casing |
| `screen_size` | `screenSize` | casing (AC7 request body) |
| `SenderTelephon` | `senderTelephon` | casing |
| `SenderUsername` | `senderUsername` | casing |
| `Status` | `status` | casing |
| `Statuses` | `statuses` | casing |
| `statusId` | `statusID` | casing (WS hand-built) |
| `SystemEvent` | `systemEvent` | casing |
| `SystemTargets` | `systemTargets` | casing |
| `Telephon` | `telephon` | casing |
| `Text` | `text` | casing |
| `Time` | `time` | casing |
| `Type` | `type` | casing |
| `user_email` | `userEmail` | casing (AC7 request body) |
| `Username` | `username` | casing |
| `UserRole` | `userRole` | casing |
| `ViewCount` | `viewCount` | casing |
| `Viewed` | `viewed` | casing |
| `ViewedAt` | `viewedAt` | casing |
| `wallpaper_url` | `wallpaperUrl` | casing |

### Semantic renames (not casing)

These change the name, not just its case, and are therefore the riskiest part of
the contract for any external consumer:

- `Gmail` → `email` (user identity; the request body already used `email`).
- `Number` / `number` / `numero` → `telephon` (contact phone number; the
  request bodies and the `ContactChat` response now share `telephon`).

### Endpoints verified as already camelCase (AC7, no change)

- **calls**: `schemas.CallLogResponse` (`callerTelephon`, `startedAt`,
  `isOutgoing`, …).
- **media upload**: `{url, mediaType, mimeType, size, filename}`.
- **search**: `SearchResult` / `SearchPage` / `GlobalSearch*` (`messageID`,
  `hasMore`, `avatarUrl`, …).
- **mute**: `MuteResponse` (`muted`, `mutedUntil`).
- **push**: `PushConfigResponse` (`enabled`, `publicKey`, `preview`) and
  `PushSubscriptionInput` (`endpoint`, `keys`).
- **ws-ticket**: `{ticket}`.
- **errors**: `{error}`.
