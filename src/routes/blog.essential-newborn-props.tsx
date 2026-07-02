import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Sparkles, Camera, Feather, Layers, Heart, CheckCircle2 } from "lucide-react";
import ogImage from "@/assets/blog-newborn-props-og.jpg";

const CANONICAL = "https://sweetbabyphotographystudio.lovable.app/blog/essential-newborn-props";
const TITLE = "מדריך: אביזרים חיוניים לצילומי ניוברן למתחילים | Sweetbaby";
const DESCRIPTION =
  "מדריך מלא לאביזרים החיוניים בצילומי ניוברן — סלסלות, מצעים, כובעים ושמיכות. דגש על בטיחות, רבגוניות והציוד ההכרחי לסטודיו ראשון.";

export const Route = createFileRoute("/blog/essential-newborn-props")({
  component: EssentialNewbornPropsGuide,
  head: () => ({
  head: () => {
    const OG_IMAGE = `https://sweetbabyphotographystudio.lovable.app${ogImage}`;
    return {
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "keywords", content: "אביזרי ניוברן, ניוברן פרופס, צילומי ניוברן, אביזרי צילום, סלסלות ניוברן, newborn photography props" },
      { name: "author", content: "Sweetbaby Studio" },
      { property: "og:site_name", content: "Sweetbaby" },
      { property: "og:locale", content: "he_IL" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:secure_url", content: OG_IMAGE },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "640" },
      { property: "og:image:alt", content: "אביזרי צילומי ניוברן — סלסלה, כובע סרוג ומצעים בסטודיו Sweetbaby" },
      { property: "article:section", content: "Newborn Photography" },
      { property: "article:author", content: "Sweetbaby" },
      { property: "article:tag", content: "צילומי ניוברן" },
      { property: "article:tag", content: "אביזרי צילום" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@sweetbaby" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "אביזרי צילומי ניוברן — סלסלה, כובע סרוג ומצעים בסטודיו Sweetbaby" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "אביזרים חיוניים לצילומי ניוברן למתחילים",
          description: DESCRIPTION,
          inLanguage: "he",
          mainEntityOfPage: CANONICAL,
          author: { "@type": "Organization", name: "Sweetbaby" },
          publisher: { "@type": "Organization", name: "Sweetbaby" },
          keywords: "newborn photography props, אביזרי ניוברן",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Sweetbaby", item: "https://sweetbabyphotographystudio.lovable.app/" },
            { "@type": "ListItem", position: 2, name: "Blog", item: "https://sweetbabyphotographystudio.lovable.app/blog" },
            { "@type": "ListItem", position: 3, name: "אביזרים חיוניים לצילומי ניוברן", item: CANONICAL },
          ],
        }),
      },
    ],
  }),
});

const essentials = [
  {
    icon: Layers,
    title: "סלסלות ותיבות (Baskets & Bowls)",
    body: "הבסיס לכל סט ניוברן. בחרו 2–3 סלסלות בגדלים שונים עם דפנות יציבות. תמיד השתמשו במשקולת נגד גלישה ובספוטר צמוד לתינוק.",
    tag: "עד 4 שבועות",
  },
  {
    icon: Feather,
    title: "מילויים ומצעים (Fillers & Layers)",
    body: "פרווה סינתטית, שמיכות סרוגות ופלטות כותנה יוצרות מרקם ורכות. עדיפו חומרים היפואלרגניים שאפשר לכבס.",
    tag: "רבגוני",
  },
  {
    icon: Sparkles,
    title: "כובעים וסרטים (Bonnets & Wraps)",
    body: "כובע פשוט או wrap ניטרלי משדרג כל תמונה. התחילו עם 3 גוונים: קרם, אבקתי ואפור-חום. הימנעו מגומיות הדוקות.",
    tag: "בסיס חובה",
  },
  {
    icon: Heart,
    title: "רקעים ובקדרופים (Backdrops)",
    body: "בד רקע חלק בגוון ניטרלי (בז'/פודרה) יאפשר לתינוק להיות במרכז. הימנעו מקפלים חדים והשתמשו בקליפים חזקים.",
    tag: "אחיד",
  },
  {
    icon: Camera,
    title: "עריסה או מיטה מיניאטורית (Bed / Prop Furniture)",
    body: "פריט signature לתמונה אחת יוצאת דופן. יש להצמיד לרצפה, לרפד עם שמיכות מלמטה ולא להשאיר את התינוק ללא ליווי.",
    tag: "פריט הרו",
  },
  {
    icon: ShieldCheck,
    title: "משקולות, ספוטר ופד חימום",
    body: "אלה לא אביזרים ל'תמונה' אלא כלים הכרחיים לבטיחות: מונעים החלקה, שומרים על חום גוף וצילום רגוע. אין להתפשר.",
    tag: "בטיחות",
  },
];

const safetyRules = [
  "תמיד עם ספוטר צמוד — יד על התינוק בכל צילום, גם אם 'רק לרגע'.",
  "בדקו יציבות של כל אביזר על משטח שטוח לפני הנחת התינוק.",
  "טמפרטורת סטודיו 24–26°C, לא יותר. השתמשו בפד חימום עדין תחת המצעים.",
  "אל תניחו את התינוק על משטח מוגבה ללא רשת ביטחון או מזרן מתחת.",
  "הרכיבו קומפוזיציה תחילה עם בובה, ורק אז החליפו לתינוק אמיתי.",
];

function EssentialNewbornPropsGuide() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
      <Header />

      <article className="container-page py-14 flex-1 max-w-4xl mx-auto">
        <nav className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4 flex items-center gap-2" aria-label="breadcrumb">
          <Link to="/" className="hover:text-primary">Sweetbaby</Link>
          <span>·</span>
          <span>מדריך</span>
        </nav>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-6xl leading-tight text-primary mb-4">
            אביזרים חיוניים לצילומי <span className="italic text-[#b98a7a]">ניוברן</span> — המדריך למתחילים
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            כל מה שצריך כדי להקים סט ניוברן ראשון — עם דגש על בטיחות, רבגוניות וההשקעה שבאמת משתלמת. מדריך פרקטי לצלמות שמתחילות, מבוסס על הניסיון שלנו עם מאות סשנים בסטודיו.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase text-forest/70">
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">קריאה 6 דק'</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">רמת מתחילים</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">מעודכן 2026</span>
          </div>
        </header>

        <section className="rounded-3xl bg-white border border-black/5 p-6 md:p-8 mb-10 shadow-sm">
          <h2 className="font-display text-2xl md:text-3xl text-primary mb-3">איך לבחור את הפריט הראשון שלכן</h2>
          <p className="text-muted-foreground leading-relaxed">
            הטעות הכי נפוצה של צלמות מתחילות היא לקנות עשרות אביזרים בגוונים דומים. עדיף להתחיל עם 6–8 פריטי בסיס בטונים ניטרליים — קרם, אפור-חום, פודרה עמומה — שאפשר לשלב זה עם זה ולבנות מהם 15 סטים שונים. רבגוניות מנצחת כמות. בכל בחירה שאלו את עצמכן שתי שאלות:
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-blush-deep shrink-0 mt-0.5" /> האם הפריט בטוח? יציב, ללא חלקים קטנים, מחומר שנושם.</li>
            <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-blush-deep shrink-0 mt-0.5" /> האם אשתמש בו לפחות ב-5 סשנים שונים? אם לא — השכירו במקום לקנות.</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-6">שבעת האביזרים ההכרחיים</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {essentials.map((e) => (
              <div key={e.title} className="rounded-3xl bg-white border border-black/5 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-full bg-[#f3c9bd]/40 flex items-center justify-center">
                    <e.icon className="h-5 w-5 text-[#b98a7a]" />
                  </div>
                  <span className="text-[10px] tracking-[0.25em] uppercase text-forest/70 bg-[#efe6df] px-2.5 py-1 rounded-full">
                    {e.tag}
                  </span>
                </div>
                <h3 className="font-display text-xl text-primary mb-2">{e.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{e.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-primary text-primary-foreground p-6 md:p-10 mb-12">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-5 w-5 text-blush" />
            <h2 className="font-display text-2xl md:text-3xl">חמישה כללי בטיחות שאין להתפשר עליהם</h2>
          </div>
          <ol className="mt-4 space-y-3 text-sm text-primary-foreground/85">
            {safetyRules.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-blush/25 text-blush shrink-0 flex items-center justify-center text-xs font-medium">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-3xl text-primary mb-4">להשכיר או לקנות?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            בשלב הראשון של הקריירה, השכרה חוסכת אלפי שקלים. אביזרי ניוברן איכותיים עולים 200–800 ש"ח לפריט, ובחודשי החורף רוב הצלמות עורכות 3–5 סשנים בחודש בלבד. השכרה מאפשרת להביא בכל סשן סט טרי ונקי, ולהתנסות עם סגנונות שונים לפני שאתן מתחייבות לקולקציה קבועה.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            בסטודיו שלנו בבית שמש ניתן להשכיר אביזרי ניוברן ליום/סשן, כולל עריסות מעוצבות, סלסלות עתיקות, שמיכות סרוגות בעבודת יד ומצעי פרווה — הכל מנוקה ומאובחן בין סשן לסשן.
          </p>
        </section>

        <section className="rounded-3xl bg-white border border-black/5 p-8 md:p-10 text-center shadow-sm">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-3">מוכנות לסשן הבא?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            עיינו בקטלוג של יותר מ-200 אביזרי ניוברן מעוצבים — כולם מוכנים להשכרה, נקיים ובטוחים לתינוק. בחירת מלאי אונליין ואיסוף גמיש.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/catalog">
              <Button className="rounded-full h-12 px-8 bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-base font-medium">
                לקטלוג האביזרים
              </Button>
            </Link>
            <Link to="/booking">
              <Button variant="outline" className="rounded-full h-12 px-8 border-primary/20 text-base">
                שריון סטודיו
              </Button>
            </Link>
          </div>
        </section>
      </article>

      <Footer />
    </div>
  );
}
