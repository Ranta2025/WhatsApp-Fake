import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard: white-based utilities only work on a dark background. Use the semantic
// tokens (`fg`, `fg-muted`, `on-accent`, `overlay*`, `border-subtle`, `scrim`) so
// every theme stays legible. Opt a single line out with a trailing `// theme-ok`
// (or `{/* theme-ok */}`) when the white sits on media or an accent surface.
const SRC_DIR = __dirname;

const WHITE_UTILITY =
  /(?:^|[\s"'`:])(?:[a-z-]+:)*!?(?:bg|text|border|ring|divide|from|to|via|outline|placeholder|fill|stroke)-white(?:\/[\w.[\]]+)?(?=[\s"'`])/;

// Files still pending migration. Shrinks to empty in UT5.
const ALLOWLIST: readonly string[] = [
  'components/AudioPlayer.tsx',
  'components/AuthLayout.tsx',
  'components/BugReportModal.tsx',
  'components/CallHistory.tsx',
  'components/CallRoom.tsx',
  'components/IncomingCall.tsx',
  'components/MediaContent.tsx',
  'components/MediaUploadMenu.tsx',
  'components/ui/Avatar.tsx',
  'features/dashboard/components/AddContactModal.tsx',
  'features/dashboard/components/ChatSearchBar.tsx',
  'features/dashboard/components/ContactDetails.tsx',
  'features/dashboard/components/CreateGroupModal.tsx',
  'features/dashboard/components/DisappearingControls.tsx',
  'features/dashboard/components/ForwardMessageModal.tsx',
  'features/dashboard/components/GroupMessageInfoModal.tsx',
  'features/dashboard/components/GroupSettingsSection.tsx',
  'features/dashboard/components/MessageSearchResults.tsx',
  'features/dashboard/components/MessageTicks.tsx',
  'features/dashboard/components/MuteMenu.tsx',
  'features/dashboard/components/NotificationBanner.tsx',
  'features/dashboard/components/PendingMessages.tsx',
  'features/dashboard/components/ProfileModal.tsx',
  'features/dashboard/components/PushSettings.tsx',
  'features/dashboard/components/ToastContainer.tsx',
  'features/dashboard/components/reactions/FullEmojiPicker.tsx',
  'features/dashboard/components/reactions/ReactionChips.tsx',
  'features/dashboard/components/reactions/ReactionPicker.tsx',
  'features/dashboard/components/reactions/ReactionTrigger.tsx',
  'features/dashboard/components/reactions/ReactionsModal.tsx',
  'features/status/components/StatusComposer.tsx',
  'features/status/components/StatusList.tsx',
  'features/status/components/StatusViewer.tsx',
  'features/stickers/StickerCreator.tsx',
  'pages/ActivateAccount.tsx',
  'pages/ActivateExisting.tsx',
  'pages/Login.tsx',
  'pages/RecoverPassword.tsx',
  'pages/Register.tsx',
  'pages/UnblockAccount.tsx',
  'pages/Welcome.tsx',
  'pwa/OfflineBanner.tsx',
  'pwa/UpdatePrompt.tsx',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') && !full.endsWith('.test.tsx') ? [full] : [];
  });
}

function offendingLines(file: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !line.includes('theme-ok') && WHITE_UTILITY.test(line))
    .map(({ line, n }) => `${n}: ${line.trim().slice(0, 120)}`);
}

describe('theme overlays', () => {
  const files = walk(SRC_DIR).map((f) => relative(SRC_DIR, f).split(sep).join('/'));

  it('allowlist only names files that exist and still need migration', () => {
    for (const entry of ALLOWLIST) {
      expect(files, `${entry} is on the allowlist but missing`).toContain(entry);
      expect(
        offendingLines(join(SRC_DIR, entry)).length,
        `${entry} is clean: remove it from the allowlist`,
      ).toBeGreaterThan(0);
    }
  });

  it('no white-based utilities outside the allowlist', () => {
    const violations = files
      .filter((f) => !ALLOWLIST.includes(f))
      .flatMap((f) => offendingLines(join(SRC_DIR, f)).map((l) => `${f}:${l}`));
    expect(violations).toEqual([]);
  });
});
