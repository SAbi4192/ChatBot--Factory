import { describe, it, expect } from 'vitest';
import { isValidTranslation, collapseEmojiSpam, cleanLocalResponse } from '../../backend/llmService.js';

describe('Translation validation', () => {
  it('accepts Devanagari output for Hindi', () => {
    expect(isValidTranslation('मुझे अपने दांतों में कितनी बार फ्लॉस करना चाहिए?', 'hi')).toBe(true);
  });

  it('accepts Tamil script for Tamil', () => {
    expect(isValidTranslation('பல் சொத்தை ஏற்படக் காரணம் என்ன?', 'ta')).toBe(true);
  });

  it('accepts Telugu / Malayalam / Kannada scripts', () => {
    expect(isValidTranslation('పంటి రంధ్రాలకు కారణం ఏమిటి?', 'te')).toBe(true);
    expect(isValidTranslation('പല്ലിൽ അറ ഉണ്ടാകാനുള്ള കാരണം എന്താണ്?', 'ml')).toBe(true);
    expect(isValidTranslation('ಹಲ್ಲಿನ ಕುಳಿಗಳಿಗೆ ಕಾರಣವೇನು?', 'kn')).toBe(true);
  });

  it('accepts Japanese script for Japanese', () => {
    expect(isValidTranslation('虫歯の原因は何ですか？', 'ja')).toBe(true);
  });

  it('rejects emoji-only output', () => {
    expect(isValidTranslation('🌟', 'ta')).toBe(false);
  });

  it('rejects untranslated English for Tamil', () => {
    expect(isValidTranslation('What causes cavities?', 'ta')).toBe(false);
  });

  it('rejects punctuation-only output', () => {
    expect(isValidTranslation('!!! --- ???', 'hi')).toBe(false);
  });

  it('accepts Latin output for English', () => {
    expect(isValidTranslation('Hello there!', 'en')).toBe(true);
  });
});

describe('Emoji spam cleanup', () => {
  it('collapses a run of identical emojis to one', () => {
    expect(collapseEmojiSpam('Great!!! 🌟🌟🌟🌟🌟🌟')).toBe('Great!!! 🌟');
  });

  it('caps the total emoji count at 8', () => {
    const out = collapseEmojiSpam('a 🌟 b 🌟 c 🌟 d 🌟 e 🌟 f 🌟 g 🌟 h 🌟 i 🌟 j');
    const emojiCount = [...out].filter((ch) => /\p{Extended_Pictographic}/u.test(ch)).length;
    expect(emojiCount).toBe(8);
  });

  it('leaves clean text untouched', () => {
    expect(collapseEmojiSpam('How often should I floss?')).toBe('How often should I floss?');
  });
});

describe('Local response cleaning', () => {
  it('cuts multi-turn rambles at the bot name echo', () => {
    const out = cleanLocalResponse('Heal: Hello there!\nHeal: I can help with teeth.\nHeal: Ask me anything.', 'Heal');
    expect(out).toBe('Hello there!');
  });

  it('cuts at User: turns', () => {
    const out = cleanLocalResponse('Sure thing!\nUser: How about milk?\nAssistant: Milk is fine.', 'Heal');
    expect(out).toBe('Sure thing!');
  });

  it('strips the leading bot-name echo', () => {
    expect(cleanLocalResponse('Heal: Nice to meet you!', 'Heal')).toBe('Nice to meet you!');
  });
});
