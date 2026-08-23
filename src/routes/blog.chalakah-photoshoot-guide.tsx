import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Scissors, Shirt, Clock, Smile, Sparkles, CheckCircle2 } from "lucide-react";
import ogImage from "@/assets/home-hero-4.jpg.asset.json";

const CANONICAL = "https://sweetbabyphoto.shop/blog/chalakah-photoshoot-guide";
const TITLE = "מדריך: איך להתכונן לצילומי חלאקה בסטודיו | Sweetbaby";
const DESCRIPTION =
  "כל מה שכדאי לדעת לפני צילומי חלאקה בסטודיו — תזמון מול התספורת, מה להביא, אביזרים שיש בסטודיו ואיך לשמור על ילד בן 3 רגוע ומשתף פעולה.";

export const Route = createFileRoute("/blog/chalakah-photoshoot-guide")({
  component: ChalakahPhotoshootGuide,
  head: () => {
    const OG_IMAGE = `https://sweetbabyphoto.shop${ogImage.url}`;
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { name: "keywords", content: "צילומי חלאקה, חלאקה בית שמש, צילום חלאקה בסטודיו, אפשרויות תלבושת לחלאקה" },
        { name: "author", content: "Sweetbaby Studio" },
        { property: "og:site_name", content: "Sweetbaby" },
        { property: "og:locale", content: "he_IL" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "article" },
        { property: "og:url", content: CANONICAL },
        { property: "og:image", content: OG_IMAGE },
        { property: "og:image:secure_url", content: OG_IMAGE },
        { property: "article:section", content: "Chalakah Photography" },
        { property: "article:author", content: "Sweetbaby" },
        { property: "article:tag", content: "צילומי חלאקה" },
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
            headline: "איך להתכונן לצילומי חלאקה בסטודיו",
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
              { "@type": "ListItem", position: 3, name: "צילומי חלאקה", item: CANONICAL },
            ],
          }),
        },
      ],
    };
  },
});

const timeline = [
  {
    icon: Clock,
    title: "לפני התספורת",
    body: "רוב המשפחות מגיעות לסטודיו בבוקר החלאקה עצמה, לפני שקוצצים את התלתלים — כדי לתעד את השיער הארוך בפעם האחרונה. אפשר גם לתאם צילום נפרד ימים ספורים לפני, כשהילד רגוע ולא בלחץ של יום האירוע.",
  },
  {
    icon: Scissors,
    title: "בזמן / מיד אחרי",
    body: "אם מתכננים לתעד גם את רגע התספורת עצמו, כדאי לתאם מראש חלון זמן רחב — ילדים בני 3 לא תמיד משתפים פעולה בלוח זמנים קבוע. אנחנו גמישים בסידור השעות סביב האירוע.",
  },
  {
    icon: Smile,
    title: "אחרי, עם התספורת החדשה",
    body: "סשן קצר נוסף אחרי התספורת מתעד את המראה החדש — קיפה, פאות אם רלוונטי, ותחושת ה'ילד גדול'. אפשר לשלב זאת באותו ביקור או בתאריך נפרד.",
  },
];

const bringList = [
  "בגד חג / חליפה שהילד כבר ניסה ומרגיש בו בנוח — יום החלאקה עמוס רגשית, לא כדאי שגם הבגד יהיה חדש ולא מוכר.",
  "כיפה, אבנט או טלית קטן — אם יש פריט משפחתי או מיוחד שחשוב לכם בתמונות.",
  "חטיף אהוב וצעצוע מרגיע — לשמור על שיתוף פעולה בין הצילומים.",
  "בקבוק מים וממחטות — יום ארוך עם הרבה התרגשות.",
  "אם מגיעים ישר מהתספורת — מברשת קטנה לסדר את השיער לפני הכניסה לסטודיו.",
];

function ChalakahPhotoshootGuide() {
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
            איך להתכונן ל<span className="italic text-[#b98a7a]">חלאקה</span> בסטודיו
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            חלאקה היא אחד הימים הרגשיים בשנה הראשונות של ילד — וגם אחד העמוסים. מדריך קצר שיעזור לתזמן נכון, לדעת מה להביא, ולצאת עם תמונות שישארו לשנים.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase text-forest/70">
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">קריאה 5 דק'</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">בית שמש</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">מעודכן 2026</span>
          </div>
        </header>

        <section className="mb-12">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-6">מתי לצלם — לפני, בזמן או אחרי</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {timeline.map((t) => (
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
            <h2 className="font-display text-2xl md:text-3xl">שלוש טיפים לילד בן 3 רגוע</h2>
          </div>
          <ol className="mt-4 space-y-3 text-sm text-primary-foreground/85">
            {[
              "תזמנו את הצילום סביב שעת שינה טובה — לא ממש לפני נמנום ולא מיד אחרי ארוחה כבדה.",
              "תנו לילד להסתובב בסטודיו כמה דקות לפני שמתחילים — היכרות עם החלל מפחיתה מבוכה מול המצלמה.",
              "אל תלחצו על חיוך מושלם — הרגעים הכי אמיתיים (כולל בכי קטן) הם לרוב אלה שהופכים לתמונה האהובה.",
            ].map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="h-6 w-6 rounded-full bg-blush/25 text-blush shrink-0 flex items-center justify-center text-xs font-medium">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-3xl text-primary mb-4">אביזרים בסטודיו</h2>
          <p className="text-muted-foreground leading-relaxed">
            בסטודיו שלנו בבית שמש יש מגוון רקעים וסטים שמתאימים לחלאקה — כולל אפשרויות רכות ונקיות שמתאימות גם לתמונות משפחתיות מסביב לילד החוגג. אפשר לשלב גם אביזרים מהקטלוג שלנו להשכרה, לפי הסגנון שמתאים לכם.
          </p>
        </section>

        <section className="rounded-3xl bg-white border border-black/5 p-8 md:p-10 text-center shadow-sm">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-3">רוצים לתאם צילומי חלאקה?</h2>
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
