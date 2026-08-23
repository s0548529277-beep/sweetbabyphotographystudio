import newbornOg from "@/assets/blog-newborn-props-og.jpg";
import chalakahOg from "@/assets/home-hero-4.jpg.asset.json";

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
];
