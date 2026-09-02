// Collage Studio editor — the real thing. Loads the chosen template and
// hands off to StudioEditor (fabric.js underneath, see
// components/collage-studio/StudioCanvas.tsx). Extra Hebrew webfonts for
// the studio's font system are loaded here, scoped to this route only —
// not added to the site-wide font stack.
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StudioEditor } from "@/components/collage-studio/StudioEditor";
import { findTemplate } from "@/lib/collage-studio-data";
import { STUDIO_FONTS_GOOGLE_HREF } from "@/lib/collage-studio-library";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/collage-studio/$templateId")({
  component: CollageStudioEditorPage,
  loader: ({ params }) => {
    const template = findTemplate(params.templateId);
    if (!template) throw notFound();
    return { template };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `עריכת ${loaderData.template.name} | סטודיו קולאז'ים` : "סטודיו קולאז'ים" }],
    links: [{ rel: "stylesheet", href: STUDIO_FONTS_GOOGLE_HREF }],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="container-page py-24 flex-1 text-center">
        <h1 className="font-display text-3xl text-primary mb-4">התבנית לא נמצאה</h1>
        <Link to="/collage-studio" className="text-primary underline">
          חזרה לכל התבניות
        </Link>
      </div>
      <Footer />
    </div>
  ),
});

function CollageStudioEditorPage() {
  const { template } = Route.useLoaderData();
  return <StudioEditor template={template} />;
}
