// The fixed spoken-keyword menu both phone lines (Twilio + Yemot) present
// right after the greeting, before handing off to the open AI conversation
// — requested so a caller who just wants directions or the equipment guide
// doesn't have to talk to the AI at all. Shared here so the two protocol
// handlers (api.voice.respond.ts / api.yemot.ivr.ts) don't each reimplement
// the same parsing/copy and drift apart.
//
// This used to be a key-press (1-6) menu, but Yemot's DTMF ("tap") read
// mode turned out not to work reliably live ("לא הקשת כמות מספרים נכונה")
// and a numbered menu is also just more friction than it needs to be — so
// now it's plain speech, matched by keyword ("השכרת סטודיו", "דרכי הגעה"
// etc). Crucially: if nothing matches, we don't reject the input and
// re-prompt — we just treat whatever was said as the opening line of the
// normal open conversation, since it was very likely a real question to
// begin with.
//
// Every fixed phrase below carries ניקוד (niqqud/vowel points) on its
// native-Hebrew words, so the two TTS engines read it the way it's meant to
// sound instead of guessing between the several ways an unvocalized Hebrew
// word can be read. Loanwords (סטודיו, גוגל, בייבי, אוטומט, טאבלט…) are
// left bare on purpose — Hebrew niqqud rules don't really apply to them,
// and both TTS engines already read this specific set correctly unvocalized.
// This is a best-effort hand pass, not a linguist's proofread — if a
// specific word still comes out wrong on a live call, that one word is easy
// to correct once we know which it is.

export type MenuChoice = 1 | 2 | 3 | 4 | 6;

// Framed explicitly as a fallback (not the primary channel) and leads with
// the fastest self-serve option — per direct feedback: the bot only picks
// up when there's no live answer, so say that, and point first to Google
// before the AI conversation. Shared by both phone lines so the wording
// never drifts between them.
export const GREETING =
  "שָׁלוֹם, הִגַּעְתֶּם לסטודיו סוויט בייבי. לֹא הָיָה מַעֲנֶה כְּרֶגַע, הֲכִי מָהִיר בְּדֶרֶךְ כְּלָל לְחַפֵּשׂ בגוגל סטודיו סוויט בייבי וְלִמְצוֹא הַכֹּל בָּאֲתָר. אֲנִי כָּאן לַעֲזוֹר.";

export const MENU_PROMPT =
  "אֶפְשָׁר לוֹמַר בַּמֶּה לַעֲזוֹר: הַשְׂכָּרַת סטודיו, הַשְׂכָּרַת אֲבִיזָרִים, דַּרְכֵי הַגָּעָה, הַדְרָכָה לְשִׁמּוּשׁ בסטודיו, אוֹ לְהַשְׁאִיר הוֹדָעָה. אוֹ פָּשׁוּט לִשְׁאוֹל אוֹתִי כָּל שְׁאֵלָה אַחֶרֶת.";

// Order matters: checked top to bottom, first match wins. "אביזר" is
// checked before "סטודיו" since "השכרת אביזרים לסטודיו" should still land
// on props, not studio. (Kept unvocalized — these are regex sources matched
// against raw speech-to-text output, which never carries niqqud itself.)
const INTENT_KEYWORDS: Array<[RegExp, MenuChoice]> = [
  [/אביזר/, 2],
  [/הגעה|כתובת|וויז|ווייז|איפה אתם|איך מגיעים|תחנה|אוטובוס/, 3],
  [/הדרכה|תקלה|לא עובד|לא מבזיק|לא נדלק|משדר|רקע.*מותר/, 4],
  [/(תשאיר|תעביר|תרשמ|להשאיר|להעביר).*הודעה|הודעה ל(סטודיו|צוות)/, 6],
  [/סטודיו/, 1],
];

/** Best-effort keyword match against a caller's spoken sentence — null if nothing recognizable matched. */
export function detectMenuIntent(speech: string | null | undefined): MenuChoice | null {
  const s = (speech ?? "").trim();
  if (!s) return null;
  for (const [re, choice] of INTENT_KEYWORDS) {
    if (re.test(s)) return choice;
  }
  return null;
}

export const STUDIO_BLURB =
  "הַשְׂכָּרַת סטודיו: שָׁעָה רִאשׁוֹנָה 120 שֶׁקֶל, כָּל שָׁעָה נוֹסֶפֶת 90 שֶׁקֶל. שִׁרְיוּן דּוֹרֵשׁ מִקְדָּמָה שֶׁל 90 שֶׁקֶל. אֶפְשָׁר גַּם חֲבִילַת ניו-בורן בֹּקֶר, 3 שָׁעוֹת ב-240 שֶׁקֶל.";

export const PROPS_BLURB =
  "הַשְׂכָּרַת אֲבִיזָרִים: יֵשׁ קָטָלוֹג שֶׁל יוֹתֵר מ-400 אֲבִיזָרִים בָּאֲתָר, מִינִימוּם הַזְמָנָה 50 שֶׁקֶל, לְפִי 24 שָׁעוֹת הַשְׂכָּרָה.";

export const GUIDE_CHOICE_PROMPT =
  "רוֹצִים שֶׁאֲסַפֵּר אֶת כָּל הַהַדְרָכָה לְשִׁמּוּשׁ בסטודיו, אוֹ שֶׁיֵּשׁ שְׁאֵלָה סְפֶּצִיפִית אוֹ תַּקָּלָה?";

const GUIDE_EVERYTHING_WORDS = ["הכל", "הכול", "הכולל", "הדרכה מלאה", "ספרי הכל", "ספר הכל", "תספר", "תספרי"];

export function wantsFullGuide(speech: string | null | undefined): boolean {
  const s = (speech ?? "").trim();
  if (!s) return false;
  return GUIDE_EVERYTHING_WORDS.some((w) => s.includes(w));
}

/**
 * The full equipment guide, hand-written as flowing vocalized speech
 * (rather than derived from STUDIO_GUIDE_HE's numbered written form in
 * ai.functions.ts, which stays unvocalized since it's also read as plain
 * text by the AI and shown in written form elsewhere).
 */
export const FULL_GUIDE_SPOKEN =
  "אָז כָּכָה, הַהַדְרָכָה הַמְּלֵאָה לְשִׁמּוּשׁ בסטודיו. " +
  "קֹדֶם, הַמְּשַׁדֵּר: יֵשׁ קוּפְסָה עִם הַמְּשַׁדֵּר מֵאֲחוֹרֵי הַדֶּלֶת בַּכְּנִיסָה. מְחַבְּרִים אֶת הַמְּשַׁדֵּר לַמַּצְלֵמָה עַד הַסּוֹף מַמָּשׁ. מַפְעִילִים אוֹתוֹ: יֵשׁ שְׁנֵי לַחְצָנִים בַּצַּד, מְזִיזִים אוֹתָם יָמִינָה וּלְמַעְלָה. לֹא נִדְלָק? מְנַסִּים שׁוּב. עֲדַיִן לֹא? מַחְלִיפִים סוֹלְלָה, הַסּוֹלְלוֹת נִמְצָאוֹת בְּקֻפְסַת הַצִּיּוּד שֶׁמֵּעַל עֶמְדַּת הָרֶקַע הַוָּרֹד. " +
  "וְאָז, הַפְלָאשׁ: מַפְעִילִים בִּלְחִיצָה אֲרֻכָּה עַל הַכַּפְתּוֹר עִם סִימָן הַבָּרָק, וּמִיָּד מְסוֹבְבִים אֶת הַגַּלְגֶּלֶת. בּוֹדְקִים שֶׁהַמָּסָךְ דָּלוּק. עוֹשִׂים צִלּוּם בְּדִיקָה קָצָר, הַפְלָאשׁ אָמוּר לְהַבְזִיק. בּוֹדְקִים אֶת הַתְּמוּנָה: לֹא שְׂרוּפָה מִדַּי וְלֹא חֲשׁוּכָה מִדַּי. לְתִקּוּן עֹצְמָה, מְסוֹבְבִים אֶת הַגַּלְגֶּלֶת שׁוּב, מִסְפָּר נָמוּךְ יוֹתֵר בַּגַּלְגֶּלֶת אוֹמֵר אוֹר חָזָק יוֹתֵר. " +
  "וְאָז, הַמַּצְלֵמָה: לְמִי שֶׁאֵין לוֹ נִסָּיוֹן בְּצִלּוּם מִקְצוֹעִי, מוּמְלָץ לְכַוֵּן אֶת הַמַּצְלֵמָה עַל אוטומט, וְחוֹבָה לְצַלֵּם דֶּרֶךְ הָעַיִנִית וְלֹא דֶּרֶךְ הַמָּסָךְ, כִּי בְּרֹב הַמַּצְלֵמוֹת בְּמַצָּב הַזֶּה הַמָּסָךְ לֹא יַעֲבֹד בִּכְלָל. " +
  "וְאָז, אִם הַפְלָאשׁ לֹא הִבְזִיק, לִבְדֹּק בַּסֵּדֶר הַזֶּה: שֶׁהַמְּשַׁדֵּר מְחֻבָּר עַד הַסּוֹף לַמַּצְלֵמָה, שֶׁהַמְּשַׁדֵּר מֻפְעָל כְּמוֹ שֶׁצָּרִיךְ, וְשֶׁהַפְלָאשׁ עַצְמוֹ דָּלוּק וּמְחֻבָּר. " +
  "וְאָז, רִקְעֵי צֶבַע, חוּם בָּהִיר, צָהֹב, אוֹ כָּחֹל, אֶפְשָׁר לִדְרֹךְ עֲלֵיהֶם בִּזְהִירוּת, אֲבָל רַק הַמְּצֻלָּמִים. יְלָדִים עִם נַעֲלַיִם בְּסֵדֶר, אֲבָל הוֹרִים וְצַלָּמִים בְּלִי נַעֲלַיִם עַל הָרֶקַע בְּבַקָּשָׁה. " +
  "וְאָז, רִקְעֵי נְיָר, לָבָן אוֹ יָרֹק בַּמְבּוּק, אָסוּר לִדְרֹךְ עֲלֵיהֶם בִּכְלָל, בְּשׁוּם מַצָּב! עַל הָרִצְפָּה לִפְנֵיהֶם חוֹבָה לְהַנִּיחַ פְּלָטַת פורמייקה לְבָנָה מַבְרִיקָה, אוֹ קַרְשֵׁי עֵץ לְבָנִים אוֹ חוּמִים, כִּי זֶה מֵגֵן עַל הַנְּיָר וְנוֹתֵן בְּרָק. הַנְּיָר יוֹרֵד מֵהַקִּיר רַק עַד תְּחִלַּת הַקְּרָשִׁים, אוֹ שֶׁמְּרִימִים אֶת הַקְּרָשִׁים הַצִּדָּה, אַחֶרֶת הַנְּיָר נִקְרָע. אֶפְשָׁר לְהַשְׁאִיר אֶת הַנְּיָר מְגֻלְגָּל בַּתַּחְתִּית עִם רִצְפַּת הָעֵץ, וְלִפְתֹּחַ וְלִסְגֹּר בַּעֲדִינוּת. " +
  "וְאָז, עוֹד פִּנּוֹת רֶקַע בסטודיו: קִיר עֵץ עִם רולי רְקָעִים, שָׁם מְאֻחְסָנִים גְּלִילֵי הַנְּיָר בְּכָחֹל, יָרֹק, וְלָבָן. קִיר עֵץ עִם כִּסֵּא צָהֹב, פִּנָּה כַּפְרִית וַחֲמִימָה, מַתְאִימָה לְגִיל שָׁנָה. וִילוֹן וְסַפָּה בָּהִירָה, אוֹ וִילוֹן לְבַד בְּלִי הַסַּפָּה, פִּנָּה נְקִיָּה וְרַכָּה. לְהַשְׁרָאָה בִּתְמוּנוֹת אֲמִתִּיּוֹת מֵהָרְקָעִים, יֵשׁ טאבלט בסטודיו, בְּדַף הַשְׂכָּרַת אֲבִיזָרִים לְמַטָּה. " +
  "וְאָז, רִצְפוֹת עֵץ, צַד לָבָן וְצַד אֱגוֹז חוּם, אֶפְשָׁר לַהֲפֹךְ אֶת הַקְּרָשִׁים וּלְקַבֵּל מַרְאֶה חָדָשׁ. אַזְהָרָה חֲשׁוּבָה: יֵשׁ בַּרְזֶל בְּכָל קֶרֶשׁ, לַהֲפֹךְ בִּזְהִירוּת רַבָּה! לְנַקּוֹת הֵיטֵב לִפְנֵי הַצִּלּוּמִים, עִם מַטְלִית אוֹ מַגְבוֹנִים. " +
  "וְאָז, שְׁאֵלָה אוֹ תַּקָּלָה שֶׁלֹּא מְכֻסָּה כָּאן, כְּדַאי לְהַצִּיעַ לְהִתְקַשֵּׁר: 054-8529277.";

/**
 * Full arrival directions, hand-written as flowing vocalized speech instead
 * of derived from ARRIVAL_TEXT_HE — which stays plain since it's also used
 * in written emails (see arrival.ts).
 */
export const ARRIVAL_SPOKEN =
  "דַּרְכֵי הַגָּעָה: בָּרֶכֶב, לִרְשֹׁם בְּוֵויז תַּלְמוּד יְרוּשַׁלְמִי עֶשְׂרִים וְאַרְבַּע, בֵּית שֶׁמֶשׁ. הסטודיו נִמְצָא בַּחֶדֶר הַכָּחֹל בַּחֲנָיָה. בְּאוטובוס, קַוִּים שְׁתַּיִם, אַרְבַּע, אוֹ שֵׁשׁ, לָרֶדֶת בְּתַחֲנַת פומבדיתא אוֹ שְׂדֵרוֹת הָאָמוֹרָאִים. מִשָּׁם לָגֶשֶׁת לַמַּעֲבָר עִם מַדְרֵגוֹת בֵּין הַבִּנְיָנִים בִּשְׂדֵרוֹת הָאָמוֹרָאִים חֲמִשִּׁים וְשֶׁבַע עַד חֲמִשִּׁים וָתֵשַׁע. בְּסוֹף הַמַּעֲבָר, בַּצַּד יָמִין, זֶה בִּנְיָן עֶשְׂרִים וְאַרְבַּע. הסטודיו בַּחֶדֶר הַכָּחֹל בַּחֲנָיָה.";

// ---- "Leave a message" — reachable by keyword from the menu, and also
// used as the fallback whenever the bot would otherwise just promise "the
// studio will call you back" — see voice-message.server.ts. ----
export const LEAVE_MESSAGE_PROMPT =
  "בֶּטַח, אֶפְשָׁר לְהַגִּיד אֶת הַהוֹדָעָה עַכְשָׁיו, וַאֲנִי אֶשְׁלַח אוֹתָהּ מִיָּד לְצֶוֶת הסטודיו כּוֹלֵל הַמִּסְפָּר שֶׁמִּמֶּנּוּ הִתְקַשַּׁרְתֶּם.";
export const LEAVE_MESSAGE_THANKS =
  "תּוֹדָה, הַהוֹדָעָה נִשְׁלְחָה לסטודיו וְיַחְזְרוּ אֲלֵיכֶם בְּהֶקְדֵּם. יֵשׁ עוֹד מַשֶּׁהוּ שֶׁאֶפְשָׁר לַעֲזוֹר בּוֹ?";

// ---- Shared across both route handlers, so the exact wording never drifts ----
export const DIDNT_HEAR = "לֹא הֵבַנְתִּי, אֶפְשָׁר לַחֲזֹר עַל זֶה?";
export const ANYTHING_ELSE = "יֵשׁ עוֹד מַשֶּׁהוּ שֶׁאֶפְשָׁר לַעֲזוֹר בּוֹ?";
/** Whenever a human transfer isn't possible right now — offer a real message instead of just promising a callback with no record of the call. */
export const NO_HUMAN_TRANSFER = `כְּרֶגַע אִי אֶפְשָׁר לְהַעֲבִיר אוֹתְךָ לִנְצִיגָה יְשִׁירוֹת. ${LEAVE_MESSAGE_PROMPT}`;
export const TEMPORARY_ERROR = `מִצְטַעֵר, נִתְקַלְנוּ בְּתַקָּלָה זְמַנִּית. ${LEAVE_MESSAGE_PROMPT}`;
export const FINAL_ERROR_HANGUP = "מִצְטַעֵר, נִתְקַלְנוּ בְּתַקָּלָה. נְצִיגַת הסטודיו תַּחֲזֹר אֵלֶיךָ טֶלֶפוֹנִית. תּוֹדָה וּלְהִתְרָאוֹת!";
