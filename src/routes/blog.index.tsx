import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Clock } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-posts";

const CANONICAL = "https://sweetbabyphoto.shop/blog";
const TITLE = "הבלוג של Sweetbaby | מדריכים וטיפים לצילומי ניוברן";
const DESCRIPTION =
  "מאמרים, מדריכים והשראה מסטודיו Sweetbaby — אביזרים, סטיילינג ורעיונות לצילומי ניוברן, משפחה וילדים.";

const PAGE_SIZE = 6;

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute("/blog/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "he_IL" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const { page } = Route.useSearch();
  const posts = BLOG_POSTS;
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => posts.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [posts, current],
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="border-b border-border/60 bg-muted/30">
          <div className="container mx-auto px-6 py-16 max-w-5xl">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">Journal</p>
            <h1 className="font-serif text-4xl md:text-5xl leading-tight text-foreground">
              הבלוג של Sweetbaby
            </h1>
            <p className="mt-4 text-muted-foreground max-w-2xl text-lg leading-relaxed">
              מדריכים, השראה וטיפים מבוססי ניסיון של סטודיו — לצלמים, למשפחות ולכל מי שאוהב את עולם הניוברן.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-14 max-w-5xl">
          {pageItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">אין עדיין מאמרים בעמוד זה.</p>
          ) : (
            <ul className="grid gap-8 md:grid-cols-2">
              {pageItems.map((post) => (
                <li key={post.slug}>
                  <article className="group h-full flex flex-col bg-card border border-border/60 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                    <Link to={post.to} className="block aspect-[16/9] overflow-hidden bg-muted">
                      <img
                        src={post.image}
                        alt={post.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </Link>
                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span className="uppercase tracking-widest">{post.category}</span>
                        <span>·</span>
                        <time dateTime={post.date}>
                          {new Date(post.date).toLocaleDateString("he-IL", {
                            year: "numeric",
                            month: "long",
                          })}
                        </time>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {post.readMinutes} דק'
                        </span>
                      </div>
                      <h2 className="font-serif text-2xl leading-snug text-foreground mb-3">
                        <Link to={post.to} className="hover:text-primary transition-colors">
                          {post.title}
                        </Link>
                      </h2>
                      <p className="text-muted-foreground text-sm leading-relaxed flex-1">
                        {post.excerpt}
                      </p>
                      <div className="mt-5">
                        <Link
                          to={post.to}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all"
                        >
                          קריאת המאמר
                          <ChevronLeft className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="ניווט בין עמודי הבלוג"
              className="mt-12 flex items-center justify-center gap-2"
            >
              {current > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/blog" search={{ page: current - 1 }} aria-label="עמוד קודם">
                    <ChevronRight className="w-4 h-4 ml-1" />
                    הקודם
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled aria-label="עמוד קודם">
                  <ChevronRight className="w-4 h-4 ml-1" />
                  הקודם
                </Button>
              )}

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  asChild
                  variant={n === current ? "default" : "outline"}
                  size="sm"
                >
                  <Link to="/blog" search={{ page: n }} aria-current={n === current ? "page" : undefined}>
                    {n}
                  </Link>
                </Button>
              ))}

              {current < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/blog" search={{ page: current + 1 }} aria-label="עמוד הבא">
                    הבא
                    <ChevronLeft className="w-4 h-4 mr-1" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled aria-label="עמוד הבא">
                  הבא
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              )}
            </nav>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
