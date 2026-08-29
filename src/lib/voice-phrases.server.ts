// Every fixed phrase the phone bot (Twilio + Yemot) speaks verbatim —
// requested to be admin-editable ("שיעבוד ישירות", live, no redeploy).
// DEFAULT_PHRASES is the shipped wording (same text that used to live as
// plain exported constants in voice-menu.server.ts); voice_bot_phrases in
// Supabase holds only the rows an admin actually overrode via
// /admin/voice-bot-text — getPhraseMap() merges the two, defaults winning
// only where nothing was saved.
//
// Niqqud (vowel points) is on native-Hebrew words so the TTS engines read
// them the way they're meant to sound; loanwords (סטודיו, גוגל, בייבי…)
// are left bare on purpose. Best-effort hand vocalization, not a linguist's
// proofread — if a specific word still comes out wrong, it's easy to fix
// either here (ships to everyone) or per-installation via the admin editor.

export type PhraseKey =
  | "greeting"
  | "menu_prompt"
  | "studio_blurb"
  | "props_blurb"
  | "guide_choice_prompt"
  | "full_guide_spoken"
  | "arrival_spoken"
  | "leave_message_prompt"
  | "leave_message_thanks"
  | "didnt_hear"
  | "anything_else"
  | "no_human_transfer"
  | "temporary_error"
  | "final_error_hangup";

export const PHRASE_LABELS: Record<PhraseKey, string> = {
  greeting: "ברכת פתיחה (השורה הראשונה שהמתקשרת שומעת)",
  menu_prompt: "תפריט האפשרויות (אחרי הברכה)",
  studio_blurb: "תשובה קצרה — השכרת סטודיו",
  props_blurb: "תשובה קצרה — השכרת אביזרים",
  guide_choice_prompt: "שאלה לפני ההדרכה — הכול או שאלה ספציפית",
  full_guide_spoken: "ההדרכה המלאה לשימוש בסטודיו (הטקסט הארוך)",
  arrival_spoken: "דרכי הגעה (מוקרא במלואו)",
  leave_message_prompt: "בקשה להשאיר הודעה",
  leave_message_thanks: "תודה אחרי השארת הודעה",
  didnt_hear: "לא שמעתי / לא הבנתי",
  anything_else: "יש עוד משהו שאפשר לעזור בו",
  no_human_transfer: "אין אפשרות להעביר לנציגה עכשיו",
  temporary_error: "תקלה זמנית (עדיין ממשיך את השיחה)",
  final_error_hangup: "תקלה סופית (השיחה מסתיימת)",
};

export const DEFAULT_PHRASES: Record<PhraseKey, string> = {
  greeting:
    "שָׁלוֹם, הִגַּעְתֶּם לסטודיו סוויט בייבי. לֹא הָיָה מַעֲנֶה כְּרֶגַע, הֲכִי מָהִיר בְּדֶרֶךְ כְּלָל לְחַפֵּשׂ בגוגל סטודיו סוויט בייבי וְלִמְצוֹא הַכֹּל בָּאֲתָר. אֲנִי כָּאן לַעֲזוֹר.",
  menu_prompt:
    "אֶפְשָׁר לוֹמַר בַּמֶּה לַעֲזוֹר: הַשְׂכָּרַת סטודיו, הַשְׂכָּרַת אֲבִיזָרִים, דַּרְכֵי הַגָּעָה, הַדְרָכָה לְשִׁמּוּשׁ בסטודיו, אוֹ לְהַשְׁאִיר הוֹדָעָה. אוֹ פָּשׁוּט לִשְׁאוֹל אוֹתִי כָּל שְׁאֵלָה אַחֶרֶת.",
  studio_blurb:
    "הַשְׂכָּרַת סטודיו: שָׁעָה רִאשׁוֹנָה 120 שֶׁקֶל, כָּל שָׁעָה נוֹסֶפֶת 90 שֶׁקֶל. שִׁרְיוּן דּוֹרֵשׁ מִקְדָּמָה שֶׁל 90 שֶׁקֶל. אֶפְשָׁר גַּם חֲבִילַת ניו-בורן בֹּקֶר, 3 שָׁעוֹת ב-240 שֶׁקֶל.",
  props_blurb:
    "הַשְׂכָּרַת אֲבִיזָרִים: יֵשׁ קָטָלוֹג שֶׁל יוֹתֵר מ-400 אֲבִיזָרִים בָּאֲתָר, מִינִימוּם הַזְמָנָה 50 שֶׁקֶל, לְפִי 24 שָׁעוֹת הַשְׂכָּרָה.",
  guide_choice_prompt:
    "רוֹצִים שֶׁאֲסַפֵּר אֶת כָּל הַהַדְרָכָה לְשִׁמּוּשׁ בסטודיו, אוֹ שֶׁיֵּשׁ שְׁאֵלָה סְפֶּצִיפִית אוֹ תַּקָּלָה?",
  full_guide_spoken:
    "אָז כָּכָה, הַהַדְרָכָה הַמְּלֵאָה לְשִׁמּוּשׁ בסטודיו. " +
    "קֹדֶם, הַמְּשַׁדֵּר: יֵשׁ קוּפְסָה עִם הַמְּשַׁדֵּר מֵאֲחוֹרֵי הַדֶּלֶת בַּכְּנִיסָה. מְחַבְּרִים אֶת הַמְּשַׁדֵּר לַמַּצְלֵמָה עַד הַסּוֹף מַמָּשׁ. מַפְעִילִים אוֹתוֹ: יֵשׁ שְׁנֵי לַחְצָנִים בַּצַּד, מְזִיזִים אוֹתָם יָמִינָה וּלְמַעְלָה. לֹא נִדְלָק? מְנַסִּים שׁוּב. עֲדַיִן לֹא? מַחְלִיפִים סוֹלְלָה, הַסּוֹלְלוֹת נִמְצָאוֹת בְּקֻפְסַת הַצִּיּוּד שֶׁמֵּעַל עֶמְדַּת הָרֶקַע הַוָּרֹד. " +
    "וְאָז, הַפְלָאשׁ: מַפְעִילִים בִּלְחִיצָה אֲרֻכָּה עַל הַכַּפְתּוֹר עִם סִימָן הַבָּרָק, וּמִיָּד מְסוֹבְבִים אֶת הַגַּלְגֶּלֶת. בּוֹדְקִים שֶׁהַמָּסָךְ דָּלוּק. עוֹשִׂים צִלּוּם בְּדִיקָה קָצָר, הַפְלָאשׁ אָמוּר לְהַבְזִיק. בּוֹדְקִים אֶת הַתְּמוּנָה: לֹא שְׂרוּפָה מִדַּי וְלֹא חֲשׁוּכָה מִדַּי. לְתִקּוּן עֹצְמָה, מְסוֹבְבִים אֶת הַגַּלְגֶּלֶת שׁוּב, מִסְפָּר נָמוּךְ יוֹתֵר בַּגַּלְגֶּלֶת אוֹמֵר אוֹר חָזָק יוֹתֵר. " +
    "וְאָז, הַמַּצְלֵמָה: לְמִי שֶׁאֵין לוֹ נִסָּיוֹן בְּצִלּוּם מִקְצוֹעִי, מוּמְלָץ לְכַוֵּן אֶת הַמַּצְלֵמָה עַל אוטומט, וְחוֹבָה לְצַלֵּם דֶּרֶךְ הָעַיִנִית וְלֹא דֶּרֶךְ הַמָּסָךְ, כִּי בְּרֹב הַמַּצְלֵמוֹת בְּמַצָּב הַזֶּה הַמָּסָךְ לֹא יַעֲבֹד בִּכְלָל. " +
    "וְאָז, אִם הַפְלָאשׁ לֹא הִבְזִיק, לִבְדֹּק בַּסֵּדֶר הַזֶּה: שֶׁהַמְּשַׁדֵּר מְחֻבָּר עַד הַסּוֹף לַמַּצְלֵמָה, שֶׁהַמְּשַׁדֵּר מֻפְעָל כְּמוֹ שֶׁצָּרִיךְ, וְשֶׁהַפְלָאשׁ עַצְמוֹ דָּלוּק וּמְחֻבָּר. " +
    "וְאָז, רִקְעֵי צֶבַע, חוּם בָּהִיר, צָהֹב, אוֹ כָּחֹל, אֶפְשָׁר לִדְרֹךְ עֲלֵיהֶם בִּזְהִירוּת, אֲבָל רַק הַמְּצֻלָּמִים. יְלָדִים עִם נַעֲלַיִם בְּסֵדֶר, אֲבָל הוֹרִים וְצַלָּמִים בְּלִי נַעֲלַיִם עַל הָרֶקַע בְּבַקָּשָׁה. " +
    "וְאָז, רִקְעֵי נְיָר, לָבָן אוֹ יָרֹק בַּמְבּוּק, אָסוּר לִדְרֹךְ עֲלֵיהֶם בִּכְלָל, בְּשׁוּם מַצָּב! עַל הָרִצְפָּה לִפְנֵיהֶם חוֹבָה לְהַנִּיחַ פְּלָטַת פורמייקה לְבָנָה מַבְרִיקָה, אוֹ קַרְשֵׁי עֵץ לְבָנִים אוֹ חוּמִים, כִּי זֶה מֵגֵן עַל הַנְּיָר וְנוֹתֵן בְּרָק. הַנְּיָר יוֹרֵד מֵהַקִּיר רַק עַד תְּחִלַּת הַקְּרָשִׁים, אוֹ שֶׁמְּרִימִים אֶת הַקְּרָשִׁים הַצִּדָּה, אַחֶרֶת הַנְּיָר נִקְרָע. אֶפְשָׁר לְהַשְׁאִיר אֶת הַנְּיָר מְגֻלְגָּל בַּתַּחְתִּית עִם רִצְפַּת הָעֵץ, וְלִפְתֹּחַ וְלִסְגֹּר בַּעֲדִינוּת. " +
    "וְאָז, עוֹד פִּנּוֹת רֶקַע בסטודיו: קִיר עֵץ עִם רולי רְקָעִים, שָׁם מְאֻחְסָנִים גְּלִילֵי הַנְּיָר בְּכָחֹל, יָרֹק, וְלָבָן. קִיר עֵץ עִם כִּסֵּא צָהֹב, פִּנָּה כַּפְרִית וַחֲמִימָה, מַתְאִימָה לְגִיל שָׁנָה. וִילוֹן וְסַפָּה בָּהִירָה, אוֹ וִילוֹן לְבַד בְּלִי הַסַּפָּה, פִּנָּה נְקִיָּה וְרַכָּה. לְהַשְׁרָאָה בִּתְמוּנוֹת אֲמִתִּיּוֹת מֵהָרְקָעִים, יֵשׁ טאבלט בסטודיו, בְּדַף הַשְׂכָּרַת אֲבִיזָרִים לְמַטָּה. " +
    "וְאָז, רִצְפוֹת עֵץ, צַד לָבָן וְצַד אֱגוֹז חוּם, אֶפְשָׁר לַהֲפֹךְ אֶת הַקְּרָשִׁים וּלְקַבֵּל מַרְאֶה חָדָשׁ. אַזְהָרָה חֲשׁוּבָה: יֵשׁ בַּרְזֶל בְּכָל קֶרֶשׁ, לַהֲפֹךְ בִּזְהִירוּת רַבָּה! לְנַקּוֹת הֵיטֵב לִפְנֵי הַצִּלּוּמִים, עִם מַטְלִית אוֹ מַגְבוֹנִים. " +
    "וְאָז, שְׁאֵלָה אוֹ תַּקָּלָה שֶׁלֹּא מְכֻסָּה כָּאן, כְּדַאי לְהַצִּיעַ לְהִתְקַשֵּׁר: 054-8529277.",
  arrival_spoken:
    "דַּרְכֵי הַגָּעָה: בָּרֶכֶב, לִרְשֹׁם בְּוֵויז תַּלְמוּד יְרוּשַׁלְמִי עֶשְׂרִים וְאַרְבַּע, בֵּית שֶׁמֶשׁ. הסטודיו נִמְצָא בַּחֶדֶר הַכָּחֹל בַּחֲנָיָה. בְּאוטובוס, קַוִּים שְׁתַּיִם, אַרְבַּע, אוֹ שֵׁשׁ, לָרֶדֶת בְּתַחֲנַת פומבדיתא אוֹ שְׂדֵרוֹת הָאָמוֹרָאִים. מִשָּׁם לָגֶשֶׁת לַמַּעֲבָר עִם מַדְרֵגוֹת בֵּין הַבִּנְיָנִים בִּשְׂדֵרוֹת הָאָמוֹרָאִים חֲמִשִּׁים וְשֶׁבַע עַד חֲמִשִּׁים וָתֵשַׁע. בְּסוֹף הַמַּעֲבָר, בַּצַּד יָמִין, זֶה בִּנְיָן עֶשְׂרִים וְאַרְבַּע. הסטודיו בַּחֶדֶר הַכָּחֹל בַּחֲנָיָה.",
  leave_message_prompt:
    "בֶּטַח, אֶפְשָׁר לְהַגִּיד אֶת הַהוֹדָעָה עַכְשָׁיו, וַאֲנִי אֶשְׁלַח אוֹתָהּ מִיָּד לְצֶוֶת הסטודיו כּוֹלֵל הַמִּסְפָּר שֶׁמִּמֶּנּוּ הִתְקַשַּׁרְתֶּם.",
  leave_message_thanks:
    "תּוֹדָה, הַהוֹדָעָה נִשְׁלְחָה לסטודיו וְיַחְזְרוּ אֲלֵיכֶם בְּהֶקְדֵּם. יֵשׁ עוֹד מַשֶּׁהוּ שֶׁאֶפְשָׁר לַעֲזוֹר בּוֹ?",
  didnt_hear: "לֹא הֵבַנְתִּי, אֶפְשָׁר לַחֲזֹר עַל זֶה?",
  anything_else: "יֵשׁ עוֹד מַשֶּׁהוּ שֶׁאֶפְשָׁר לַעֲזוֹר בּוֹ?",
  no_human_transfer:
    "כְּרֶגַע אִי אֶפְשָׁר לְהַעֲבִיר אוֹתְךָ לִנְצִיגָה יְשִׁירוֹת. בֶּטַח, אֶפְשָׁר לְהַגִּיד אֶת הַהוֹדָעָה עַכְשָׁיו, וַאֲנִי אֶשְׁלַח אוֹתָהּ מִיָּד לְצֶוֶת הסטודיו כּוֹלֵל הַמִּסְפָּר שֶׁמִּמֶּנּוּ הִתְקַשַּׁרְתֶּם.",
  temporary_error:
    "מִצְטַעֵר, נִתְקַלְנוּ בְּתַקָּלָה זְמַנִּית. בֶּטַח, אֶפְשָׁר לְהַגִּיד אֶת הַהוֹדָעָה עַכְשָׁיו, וַאֲנִי אֶשְׁלַח אוֹתָהּ מִיָּד לְצֶוֶת הסטודיו כּוֹלֵל הַמִּסְפָּר שֶׁמִּמֶּנּוּ הִתְקַשַּׁרְתֶּם.",
  final_error_hangup: "מִצְטַעֵר, נִתְקַלְנוּ בְּתַקָּלָה. נְצִיגַת הסטודיו תַּחֲזֹר אֵלֶיךָ טֶלֶפוֹנִית. תּוֹדָה וּלְהִתְרָאוֹת!",
};

// Which "menu" stage behavior the live call uses — stored in the SAME
// voice_bot_phrases table as a non-PhraseKey row (key=MENU_MODE_KEY), so no
// schema migration is needed for a second admin-editable setting.
//   "ai"    (new default, per explicit request 2026-08-29): the keyword-
//           menu/canned-blurb routing is skipped entirely — every stage-1
//           utterance goes straight to the open AI conversation, which
//           already has the same facts (pricing, hours, policies) in SYSTEM
//           and the arrival/equipment guide via on-demand tools, so nothing
//           is actually lost — just no more separate free/instant canned-
//           phrase path for those specific intents.
//   "fixed" (the previous, original behavior — a safety net to revert to):
//           arrival/guidance/leave-message/studio-blurb/props-blurb keep
//           their own free, zero-AI-cost canned-phrase fast path, and only
//           an unmatched utterance falls through to the AI.
// Admin-switchable live at /admin/voice-bot-text, no redeploy — see
// admin-voice-phrases.functions.ts's getVoiceMenuMode/setVoiceMenuMode.
export type VoiceMenuMode = "ai" | "fixed";
export const MENU_MODE_KEY = "menu_mode";

/**
 * Resolves every phrase (DB overrides merged over DEFAULT_PHRASES) AND the
 * current menu mode in one query — used by the two stage-machine phone
 * webhook routes (Yemot + Twilio's /respond), which need both every turn.
 * Safe even if the table doesn't exist yet or the query fails (falls back
 * to defaults + "ai" so a DB hiccup here never breaks the call the way an
 * uncaught exception would).
 */
export async function getVoiceBotConfig(): Promise<{ phrases: Record<PhraseKey, string>; menuMode: VoiceMenuMode }> {
  const phrases = { ...DEFAULT_PHRASES };
  let menuMode: VoiceMenuMode = "ai";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("voice_bot_phrases").select("key, value");
    if (error) throw error;
    for (const row of data ?? []) {
      const key = (row as { key: string }).key;
      if (key === MENU_MODE_KEY) {
        if (row.value === "fixed") menuMode = "fixed";
      } else if (key in phrases) {
        (phrases as Record<string, string>)[key] = (row as { value: string }).value;
      }
    }
  } catch (e) {
    console.error("[SWEETBABY] voice_bot config read failed, using defaults", e);
  }
  return { phrases, menuMode };
}

/** Just the phrases, for the one caller (the Twilio incoming-call greeting) that doesn't need the menu mode. */
export async function getPhraseMap(): Promise<Record<PhraseKey, string>> {
  return (await getVoiceBotConfig()).phrases;
}
