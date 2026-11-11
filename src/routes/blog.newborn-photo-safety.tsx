import { createFileRoute } from "@tanstack/react-router";
import { BlogArticleLayout, blogHead, type BlogArticleData } from "@/components/BlogArticleLayout";
import ogImage from "@/assets/blog-newborn-props-og.jpg";

const SLUG = "newborn-photo-safety";
const TITLE = "הדבר הכי חשוב בצילומי ניו בורן (לפני היופי) | Sweetbaby";
const DESCRIPTION = "איך נשמרת בטיחות התינוק בצילומי ניו בורן: שיטת הספוטר, תנוחות מורכבות שמורכבות מכמה תמונות בעריכה, ומה כדאי לשאול כל צלמת לפני שסוגרים.";

const DATA: BlogArticleData = {
  slug: SLUG,
  title: TITLE,
  titleHtml: (<>הדבר הכי חשוב בצילומי <span className="italic text-[#b98a7a]">ניו בורן</span> (לפני היופי)</>),
  intro: "לפני שמדברים על סלסלות, צבעים ותנוחות, יש דבר אחד שחשוב לנו יותר מכל: בטיחות התינוק. הנה איך זה נראה בפועל בזמן הצילום.",
  readMinutes: 3,
  sections: [
  {
    "title": "שיטת הספוטר: יד שנייה שתמיד על התינוק",
    "paragraphs": [
      "בכל צילום ניו בורן עובדים בשיטת הספוטר: יד שנייה נמצאת כל הזמן על התינוק, בעיקר בתנוחות המורכבות.",
      "התמונות המרהיבות שרואים בגלריות, כשהתינוק נראה כאילו הוא מאוזן בתנוחה בלתי אפשרית, הן כמעט תמיד שילוב של כמה תמונות שמחוברות בעריכה, ולא תנוחה אחת שהתינוק החזיק לבד."
    ]
  },
  {
    "title": "אף תינוק לא נמצא לבד בתנוחה מסוכנת",
    "paragraphs": [
      "אף תינוק לא נשאר לבד בתנוחה מסוכנת, אפילו לא לשנייה אחת. אם תנוחה לא בטוחה, מצלמים אותה בחלקים ומחברים אחר כך."
    ]
  },
  {
    "title": "מה כדאי לשאול כל צלמת לפני שסוגרים",
    "bullets": [
      "איך מתבצעת הבטיחות בתנוחות המורכבות? האם יש ספוטר ביד?",
      "האם תמונות 'הקסם' הן שילוב של כמה צילומים?",
      "כמה זמן מוקצב לצילום, כדי שיהיה מקום להזנה, החתלה והרגעה?",
      "האם הציוד והסט נקיים ומותאמים לתינוק קטן?"
    ]
  },
  {
    "title": "הכי חשוב בסוף",
    "paragraphs": [
      "התמונות צריכות להיות יפות, אבל התינוק צריך להיות בטוח כל הזמן. זה הסדר הנכון של הדברים."
    ]
  }
],
  faq: [{"q": "מה זו שיטת הספוטר?", "a": "יד שנייה שנמצאת כל הזמן על התינוק בזמן הצילום, בעיקר בתנוחות מורכבות, כדי שלא יישאר לבד בתנוחה אפילו לשנייה."}, {"q": "איך מצלמים תנוחות שנראות בלתי אפשריות?", "a": "מצלמים כמה תמונות בטוחות, עם יד תומכת, ומשלבים אותן בעריכה לתמונה אחת."}, {"q": "מתי כדאי לתאם צילומי ניו בורן?", "a": "מומלץ כבר בהריון, כדי לשריין מקום סביב תאריך הלידה המשוער."}],
  related: [{"to": "/blog/newborn-photo-timing", "label": "מתי לצלם ניו בורן"}, {"to": "/blog/newborn-photo-crying-baby", "label": "מה אם התינוק בוכה בצילום"}],
};

export const Route = createFileRoute("/blog/newborn-photo-safety")({
  component: NewbornPhotoSafety,
  head: () =>
    blogHead({
      slug: SLUG,
      title: TITLE,
      description: DESCRIPTION,
      keywords: "בטיחות בצילומי ניו בורן, שיטת הספוטר, צילומי ניו בורן בית שמש, תנוחות ניו בורן",
      headline: "בטיחות בצילומי ניו בורן: שיטת הספוטר",
      image: ogImage as unknown as string,
      faq: DATA.faq,
      datePublished: "2026-11-11",
    }),
});

function NewbornPhotoSafety() {
  return <BlogArticleLayout data={DATA} />;
}
