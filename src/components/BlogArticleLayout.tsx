import { Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export interface BlogSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface BlogArticleData {
  slug: string;
  title: string;
  titleHtml: React.ReactNode;
  intro: string;
  readMinutes: number;
  sections: BlogSection[];
  faq: { q: string; a: string }[];
  related: { to: string; label: string }[];
}

const SITE = "https://sweetbabyphoto.shop";

/** Builds the <head> object for a blog route (meta, canonical, Article + FAQ + breadcrumb JSON-LD). */
export function blogHead(opts: {
  slug: string;
  title: string;
  description: string;
  keywords: string;
  headline: string;
  image: string;
  faq: { q: string; a: string }[];
  datePublished: string;
}) {
  const canonical = `${SITE}/blog/${opts.slug}`;
  const og = opts.image.startsWith("http") ? opts.image : `${SITE}${opts.image}`;
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { name: "keywords", content: opts.keywords },
      { name: "author", content: "Sweetbaby Studio" },
      { property: "og:site_name", content: "Sweetbaby" },
      { property: "og:locale", content: "he_IL" },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: canonical },
      { property: "og:image", content: og },
      { property: "og:image:secure_url", content: og },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: opts.title },
      { name: "twitter:description", content: opts.description },
      { name: "twitter:image", content: og },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: opts.headline,
          description: opts.description,
          inLanguage: "he",
          datePublished: opts.datePublished,
          dateModified: opts.datePublished,
          image: og,
          mainEntityOfPage: canonical,
          author: { "@type": "Organization", name: "Sweetbaby" },
          publisher: { "@type": "Organization", name: "Sweetbaby" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: opts.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Sweetbaby", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
            { "@type": "ListItem", position: 3, name: opts.headline, item: canonical },
          ],
        }),
      },
    ],
  };
}

export function BlogArticleLayout({ data }: { data: BlogArticleData }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f6f1ec]" dir="rtl">
      <Header />
      <article className="container-page py-14 flex-1 max-w-4xl mx-auto">
        <nav className="text-xs tracking-[0.3em] uppercase text-forest/70 mb-4 flex items-center gap-2" aria-label="breadcrumb">
          <Link to="/" className="hover:text-primary">Sweetbaby</Link>
          <span>·</span>
          <Link to="/blog" className="hover:text-primary">בלוג</Link>
        </nav>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl leading-tight text-primary mb-4">{data.titleHtml}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">{data.intro}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase text-forest/70">
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">קריאה {data.readMinutes} דק'</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">בית שמש</span>
            <span className="px-3 py-1 rounded-full bg-white border border-black/5">מעודכן 2026</span>
          </div>
        </header>

        {data.sections.map((s) => (
          <section key={s.title} className="rounded-3xl bg-white border border-black/5 p-6 md:p-8 mb-6 shadow-sm">
            <h2 className="font-display text-2xl md:text-3xl text-primary mb-4">{s.title}</h2>
            {s.paragraphs?.map((p, i) => (
              <p key={i} className="text-muted-foreground leading-relaxed mb-3">{p}</p>
            ))}
            {s.bullets && (
              <ul className="space-y-3 text-sm mt-2">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blush-deep shrink-0 mt-0.5" />
                    <span className="text-muted-foreground leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mb-12 mt-10">
          <h2 className="font-display text-3xl text-primary mb-5">שאלות נפוצות</h2>
          <div className="space-y-4">
            {data.faq.map((f) => (
              <div key={f.q} className="rounded-2xl bg-white border border-black/5 p-5">
                <h3 className="font-display text-lg text-primary mb-1">{f.q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-black/5 p-8 md:p-10 text-center shadow-sm">
          <h2 className="font-display text-3xl md:text-4xl text-primary mb-3">רוצים לתאם צילומי ניו בורן?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-6">
            אפשר לפנות אלינו כבר בהריון ולשריין מקום סביב תאריך הלידה המשוער.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/studio-photography">
              <Button className="rounded-full h-12 px-8 bg-[#f3c9bd] hover:bg-[#eab5a4] text-[#4a2a20] text-base font-medium">
                צילומים עם מיכל
              </Button>
            </Link>
            <Link to="/studio-rental">
              <Button variant="outline" className="rounded-full h-12 px-8 border-primary/20 text-base">
                השכרת הסטודיו
              </Button>
            </Link>
          </div>
          {data.related.length > 0 && (
            <p className="mt-6 text-sm flex flex-wrap gap-x-5 gap-y-2 justify-center">
              {data.related.map((r) => (
                <a key={r.to} href={r.to} className="text-primary underline underline-offset-4 hover:opacity-80">
                  {r.label}
                </a>
              ))}
            </p>
          )}
        </section>
      </article>
      <Footer />
    </div>
  );
}
