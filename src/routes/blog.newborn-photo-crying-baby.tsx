import { createFileRoute } from "@tanstack/react-router";
import { BlogArticleLayout, blogHead, type BlogArticleData } from "@/components/BlogArticleLayout";
import ogImage from "@/assets/blog-newborn-props-og.jpg";

const SLUG = "newborn-photo-crying-baby";
const TITLE = "מה אם התינוק שלי יבכה בצילומי ניו בורן? | Sweetbaby";
const DESCRIPTION = "הורים חוששים שהתינוק יבכה כל הצילום. למה צילום ניו בורן לוקח 2-3 שעות, איך מתנהל הקצב לפי התינוק, ולמה בסוף יוצאות תמונות יפות.";

const DATA: BlogArticleData = {
  slug: SLUG,
  title: TITLE,
  titleHtml: (<>מה אם התינוק שלי <span className="italic text-[#b98a7a]">יבכה</span> כל הזמן?</>),
  intro: "זו אחת החששות הנפוצות ביותר של הורים טריים לפני צילומי ניו בורן. הנה מה שחשוב לדעת.",
  readMinutes: 3,
  sections: [
  {
    "title": "צילום ניו בורן לוקח 2-3 שעות, וזה בכוונה",
    "paragraphs": [
      "יש בו זמן להזנה, החתלה, חיבוק והרגעה. ההליכה היא בקצב של התינוק ולא בקצב של הצלמת או של השעון."
    ]
  },
  {
    "title": "תינוקות הם לא מכונות",
    "paragraphs": [
      "תינוקות הם בני אדם קטנטנים עם צרכים. הצילום בנוי כך שיהיה זמן וסבלנות, גם עבורם וגם עבורכם."
    ]
  },
  {
    "title": "איך מתכוננים",
    "bullets": [
      "מגיעים אחרי שהתינוק לא רעב מדי, ומאפשרים הזנה בתחילת הצילום או בכל רגע שצריך.",
      "לא לחץ: בכי קצר הוא חלק רגיל מהצילום, עוצרים, מרגיעים וממשיכים.",
      "אם אפשר, לקבוע בשבועיים הראשונים, כשהתינוק ישן עמוק יותר."
    ]
  },
  {
    "title": "בסוף יוצאות תמונות יפות",
    "paragraphs": [
      "גם בצילומים שהתחילו בכי, בסוף יוצאות תמונות מקסימות, כי יש זמן לחכות לרגע הנכון."
    ]
  }
],
  faq: [{"q": "כמה זמן נמשך צילום ניו בורן?", "a": "בדרך כלל 2-3 שעות, כולל הפסקות להזנה, החתלה, חיבוק והרגעה."}, {"q": "מה קורה אם התינוק בוכה?", "a": "עוצרים, מרגיעים, מאכילים ומחזירים בקצב של התינוק. בכי הוא חלק רגיל מהתהליך."}, {"q": "מתי הכי טוב לצלם?", "a": "בין 7 ל-14 ימים מהלידה, כשהתינוק ישן עמוק ורגוע יותר."}],
  related: [{"to": "/blog/newborn-photo-timing", "label": "מתי לצלם ניו בורן"}, {"to": "/blog/newborn-photo-safety", "label": "בטיחות בצילומי ניו בורן"}],
};

export const Route = createFileRoute("/blog/newborn-photo-crying-baby")({
  component: NewbornPhotoCryingBaby,
  head: () =>
    blogHead({
      slug: SLUG,
      title: TITLE,
      description: DESCRIPTION,
      keywords: "תינוק בוכה בצילומי ניו בורן, כמה זמן נמשך צילום ניו בורן, צילומי ניו בורן בית שמש",
      headline: "מה אם התינוק יבכה בצילומי ניו בורן",
      image: ogImage as unknown as string,
      faq: DATA.faq,
      datePublished: "2026-11-11",
    }),
});

function NewbornPhotoCryingBaby() {
  return <BlogArticleLayout data={DATA} />;
}
