import { Picker } from 'emoji-picker-element';
import es from 'emoji-picker-element/i18n/es';
// Emoji data is a build asset served from our own origin (no CDN); Vite emits
// it as a hashed file and gives back its URL.
import emojiDataUrl from 'emoji-picker-element-data/es/cldr/data.json?url';

/**
 * Lazy chunk: loaded with a dynamic `import()` only when the "+" button is
 * pressed (see FullEmojiPicker). Importing 'emoji-picker-element' registers the
 * `<emoji-picker>` custom element as a side effect.
 */
export function createEmojiPicker(): Picker {
    const picker = new Picker({ dataSource: emojiDataUrl, locale: 'es', i18n: es });
    picker.classList.add('dark');
    return picker;
}
