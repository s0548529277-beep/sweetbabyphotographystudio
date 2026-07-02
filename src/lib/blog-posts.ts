import newbornOg from "@/assets/blog-newborn-props-og.jpg";

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
];
