import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Cake, Clock, Smile, Sparkles, CheckCircle2, Shirt } from "lucide-react";
import ogImage from "@/assets/home-hero-5.jpg.asset.json";

const CANONICAL = "https://sweetbabyphoto.shop/blog/smash-cake-toddler-prep";
const TITLE = "איך להכין פעוט לצילומי סמאש קייק/שנה בלי סטרס | Sweetbaby";
const DESCRIPTION =
  "מדריך מעשי להכנת פעוט בן שנה לצילומי סמאש קייק — תזמון סביב שעות השינה, מה להביא, ואיך להגיב כשהוא לא משתף פעולה.";

export const Route = createFileRoute("/blog/smash-cake-toddler-prep")({
  component: SmashCakeTodlerPrep,
  head: () => {
    const OG_IMAGE = `https://sweetbabyphoto.shop${ogImage.url}`;
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { name: "keywords", content: "צילומי סמאש קייק, צילומי שנה, סמאש קייק בית שמש, צילום יום שנה לתינוק" },
        { name: "author", content: "Sweetbaby Studio" },
        { property: "og:site_name", content: "Sweetbaby" },
        { property: "og:locale", content: "he_IL" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "article" },
        { property: "og:url", content: CANONICAL },
        { property: "og:image", content: OG_IMAGE },
        { property: "og:image:secure_url", content: OG_IMAGE },
        { property: "article:section", content: "Smash Cake Photography" },
        { property: "article:author", content: "Sweetbaby" },
        { property: "article:tag", content: "סמאש קייק" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: TITLE },
        { name: "twitter:description", content: DESCRIPTION },
        { name: "twitter:image", content: OG_IMAGE },
      ],
      links: [{ rel: "canonical", href: CANONICAL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "איך להכין פעוט לצילומי סמאש קייק בלי סטרס",
            description: DESCRIPTION,
            inLanguage: "he",
            mainEntityOfPage: CANONICAL,
            author: { "@type": "Organization", name: "Sweetbaby" },
            publisher: { "@type": "Organization", name: "Sweetbaby" },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Sweetbaby", item: "https://sweetbabyphoto.shop/" },
              { "@type": "ListItem", position: 2, name: "Blog", item: "https://sweetbabyphoto.shop/blog" },
              { "@type": "ListItem", position: 3, name: "סמאש קייק", item: CANONICAL },
            ],
          }),
        },
      ],
    };
  },
});

const timing = [
  {
    icon: Clock,
    title: "תזמון לפי שעון הפעוט, לא לפי היומן שלכם",
    body: "בני שנה בדרך כלל במיטבם כ-1.5-2 שעות אחרי שהתעוררו מנמנום, ולא רעבים או עייפים. תזמנו את הצילום סביב השעה הזו, לא סביב מה שנוח לוח הזמנים המשפחתי.",
  },
  {
    icon: Smile,
    title: "הגיעו קצת לפני, לא ברגע האחרון",
    body: "להגיע ללחוצים ובמרוץ נגד הזמן עובר לפעוט. 10-15 דקות של היכרות עם החלל והעוגה לפני שמתחילים לצלם עושות הבדל גדול בשיתוף הפעולה.",
  },
  {
    icon: Cake,
    title: "העוגה היא הכלי, לא המטרה",
    body: "לא כל פעוט 'תוקף' את העוגה מהשנייה הראשונה — חלקם בוחנים, מרחרחים, ולוקחים זמן. זה בסדר לגמרי, ולרוב התמונות הכי מקסימות הן מהרגעים הספונטניים האלה, לא מתמונה מבוימת.",
  },
];

const bringList = [
  "בגד חילופי נקי לאחרי העוגה (וחולצה/בגד נוח להחלפה גם להורה שמחזיק).",
  "חטיף קטן ומוכר ובקבוק — אם יש פער בין הגעה לתחילת הצילום.",
  "צעצוע או חפץ מרגיע אחד שהפעוט מכיר — עוזר כשצריך להסיט תשומת לב רגע לפני שהוא מתעצבן.",
  "מגבונים (יש גם בסטודיו, אבל תמיד שימושי).",
  "תמונה/ציור שהפעוט אוהב להסתכל עליו — לפעמים זה מה שגורם לחיוך האמיתי.",
];

function SmashCakeTodlerPrep() {
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
            איך להכין פעוט ל<span className="italic text-[#b98a7a]">סמאש קייק</span> בלי סטרס
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            צילומי יום שנה עם עוגה הם מהכי כיפיים שיש — אבל גם מהפכפכים ביותר. מדריך קצר שיעזור לכם להגיע מוכנים, בלי לחץ, ולצאת עם תמונות אמיתיות ומשעשעות.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase text-forest/70">
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">קריאה 5 דק'</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">בית שמש</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">מעודכן 2026</span>
          </div>
        </header>

        <section className="mb-12">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-6">שלושה דברים שחשוב לדעת מראש</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {timing.map((t) => (
              <div key={t.title} className="rounded-3xl bg-white border border-black/5 p-6 shadow-sm">
                <div className="h-10 w-10 rounded-full bg-[#f3c9bd]/40 flex items-center justify-center mb-3">
                  <t.icon className="h-5 w-5 text-[#b98a7a]" />
                </div>
                <h3 className="font-display text-xl text-primary mb-2">{t.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-black/5 p-6 md:p-8 mb-12 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Shirt className="h-5 w-5 text-[#b98a7a]" />
            <h2 className="font-display text-2xl md:text-3xl text-primary">מה כדאי להביא</h2>
          </div>
          <ul className="space-y-3 text-sm">
            {bringList.map((item, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-blush-deep shrink-0 mt-0.5" />
                <span className="text-muted-foreground leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl bg-primary text-primary-foreground p-6 md:p-10 mb-12">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-blush" />
            <h2 className="font-display text-2xl md:text-3xl">ומה אם הוא בוכה ולא רוצה בכלל?</h2>
          </div>
          <ol className="mt-4 space-y-3 text-sm text-primary-foreground/85">
            {[
              "זה קורה כמעט בכל סשן, ולא מעיד על כלום — נעצור, נרגיע, ננסה שוב בזווית אחרת.",
              "אם העוגה מלחיצה, מתחילים בלי העוגה — עם הסט, הבלונים או ההורה בלבד — ומשלבים אותה בהדרגה.",
              "התמונות הכי מצולמות שוב ושוב בשנים הבאות הן בדיוק אלה שבהן הפעוט אמיתי — בוכה, מגרד את העוגה, או פשוט מביט בצד. לא צריך רגע 'מושלם' כדי שיהיה רגע יפה.",
            ].map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-blush/25 text-blush shrink-0 flex items-center justify-center text-xs font-medium">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-3xl text-primary mb-4">הכל כלול בסטודיו</h2>
          <p className="text-muted-foreground leading-relaxed">
            בסטודיו שלנו בבית שמש יש סטים ורקעים שמתאימים לצילומי סמאש קייק, ואפשר לשלב גם אביזרים מהקטלוג שלנו להשכרה — כיפות, שלטי "שנה", ובלונים — לפי הסגנון שמתאים לכם. העוגה עצמה בתיאום מראש.
          </p>
        </section>

        <section className="rounded-3xl bg-white border border-black/5 p-8 md:p-10 text-center shadow-sm">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-3">רוצים לתאם צילומי יום שנה?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            נשמח לתאם איתכם את היום — בסטודיו איתנו או בהשכרת החלל לצילום עצמי.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/studio-photography">
              <Button className="rounded-full h-12 px-8 bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-base font-medium">
                צילומים עם מיכל
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
