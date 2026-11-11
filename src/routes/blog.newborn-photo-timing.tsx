import { createFileRoute } from "@tanstack/react-router";
import { BlogArticleLayout, blogHead, type BlogArticleData } from "@/components/BlogArticleLayout";
import ogImage from "@/assets/blog-newborn-props-og.jpg";

const SLUG = "newborn-photo-timing";
const TITLE = "מתי לצלם ניו בורן? 7-14 ימים מהלידה | Sweetbaby";
const DESCRIPTION = "הזמן הכי טוב לצילומי ניו בורן הוא 7 עד 14 ימים מהלידה. למה זה עובד, מה קורה אחרי שבועיים, ואיך לשריין תאריך כבר בהריון.";

const DATA: BlogArticleData = {
  slug: SLUG,
  title: TITLE,
  titleHtml: (<>למה לצלם <span className="italic text-[#b98a7a]">ניו בורן</span> בשבועיים הראשונים?</>),
  intro: "שאלה שחוזרת הרבה: מתי בדיוק כדאי לצלם ניו בורן? התשובה הקצרה: בין 7 ל-14 ימים מהלידה.",
  readMinutes: 4,
  sections: [
  {
    "title": "למה דווקא 7-14 ימים",
    "bullets": [
      "התינוק עדיין ישן שינה עמוקה מאוד.",
      "הגוף גמיש ונכנס בצורה טבעית לתנוחות ה\"רחמיות\".",
      "פחות גזים ואי נוחות.",
      "העור בשיא הרכות והחלקות."
    ]
  },
  {
    "title": "ומה אחרי שבועיים?",
    "paragraphs": [
      "אפשר לצלם גם אחרי שבועיים, אבל זה פחות קל לתינוק ולצוות. בגיל 3-4 שבועות התינוק ער יותר, פחות גמיש וקשה יותר להרדים.",
      "התקופה של התינוק הזעיר והמקופל חולפת מהר מאוד, ולכן כדאי לא לחכות."
    ]
  },
  {
    "title": "הטיפ: לקבוע כבר בהריון",
    "paragraphs": [
      "הכי נוח לשריין את הצילום כבר בהריון, סביב תאריך הלידה המשוער, ואז לעדכן בתאריך המדויק אחרי שהתינוק נולד.",
      "ככה לא נאבקים על מקום פנוי ברגע שהכי פחות נוח לחפש."
    ]
  }
],
  faq: [{"q": "מתי הזמן הכי טוב לצלם ניו בורן?", "a": "בין 7 ל-14 ימים מהלידה, כשהתינוק ישן עמוק, גמיש ורגוע."}, {"q": "אפשר לצלם ניו בורן אחרי שבועיים?", "a": "כן, אבל זה פחות קל: התינוק ער יותר, פחות גמיש וקשה יותר להרדים."}, {"q": "מתי כדאי לתאם?", "a": "כבר בהריון, סביב תאריך הלידה המשוער, ואז לעדכן אחרי הלידה."}],
  related: [{"to": "/blog/newborn-photo-safety", "label": "בטיחות בצילומי ניו בורן"}, {"to": "/blog/newborn-photo-crying-baby", "label": "מה אם התינוק בוכה בצילום"}],
};

export const Route = createFileRoute("/blog/newborn-photo-timing")({
  component: NewbornPhotoTiming,
  head: () =>
    blogHead({
      slug: SLUG,
      title: TITLE,
      description: DESCRIPTION,
      keywords: "מתי לצלם ניו בורן, צילומי ניו בורן גיל, צילום ניו בורן שבועיים, צילומי ניו בורן בית שמש",
      headline: "מתי כדאי לצלם ניו בורן",
      image: ogImage as unknown as string,
      faq: DATA.faq,
      datePublished: "2026-11-11",
    }),
});

function NewbornPhotoTiming() {
  return <BlogArticleLayout data={DATA} />;
}
