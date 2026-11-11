import newbornOg from "@/assets/blog-newborn-props-og.jpg";
import chalakahOg from "@/assets/home-hero-4.jpg.asset.json";
import smashCakeOg from "@/assets/home-hero-5.jpg.asset.json";

export interface BlogPost {
  slug: string;
  to: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readMinutes: number;
  image: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "essential-newborn-props",
    to: "/blog/essential-newborn-props",
    title: "אביזרים חיוניים לצילומי ניוברן למתחילים",
    excerpt:
      "מדריך מלא לאביזרים החיוניים בצילומי ניוברן — סלסלות, מצעים, כובעים ושמיכות. דגש על בטיחות, רבגוניות והציוד ההכרחי לסטודיו הראשון שלך.",
    category: "מדריכים",
    date: "2026-05-01",
    readMinutes: 8,
    image: newbornOg,
  },
  {
    slug: "chalakah-photoshoot-guide",
    to: "/blog/chalakah-photoshoot-guide",
    title: "איך להתכונן לצילומי חלאקה בסטודיו",
    excerpt:
      "תזמון מול התספורת, מה כדאי להביא, ואיך לשמור על ילד בן 3 רגוע ומשתף פעולה מול המצלמה ביום הרגשי הזה.",
    category: "מדריכים",
    date: "2026-08-23",
    readMinutes: 5,
    image: chalakahOg.url,
  },
  {
    slug: "smash-cake-toddler-prep",
    to: "/blog/smash-cake-toddler-prep",
    title: "איך להכין פעוט לצילומי סמאש קייק/שנה בלי סטרס",
    excerpt:
      "תזמון סביב שעות השינה, מה כדאי להביא, ואיך להגיב כשהפעוט לא משתף פעולה — מדריך מעשי לצילומי יום שנה עם עוגה.",
    category: "מדריכים",
    date: "2026-10-13",
    readMinutes: 5,
    image: smashCakeOg.url,
  },
  {
    slug: "newborn-photo-safety",
    to: "/blog/newborn-photo-safety",
    title: "הדבר הכי חשוב בצילומי ניו בורן (לפני היופי)",
    excerpt:
      "בטיחות התינוק קודם לכל: שיטת הספוטר, תנוחות שמורכבות מכמה תמונות, ומה כדאי לשאול כל צלמת.",
    category: "מדריכים",
    date: "2026-11-11",
    readMinutes: 3,
    image: newbornOg,
  },
  {
    slug: "newborn-photo-timing",
    to: "/blog/newborn-photo-timing",
    title: "למה לצלם ניו בורן בשבועיים הראשונים?",
    excerpt:
      "בין 7 ל-14 ימים מהלידה התינוק ישן עמוק וגמיש. למה זה עובד, ואיך לשריין תאריך כבר בהריון.",
    category: "מדריכים",
    date: "2026-11-11",
    readMinutes: 4,
    image: newbornOg,
  },
  {
    slug: "newborn-photo-crying-baby",
    to: "/blog/newborn-photo-crying-baby",
    title: "מה אם התינוק שלי יבכה כל הזמן בצילום?",
    excerpt:
      "צילום ניו בורן לוקח 2-3 שעות בדיוק בשביל זה: זמן להזנה, חיבוק והרגעה, בקצב של התינוק.",
    category: "מדריכים",
    date: "2026-11-11",
    readMinutes: 3,
    image: newbornOg,
  },
];
