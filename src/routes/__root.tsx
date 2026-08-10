import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { Toaster } from "@/components/ui/sonner";
import { ChatBot } from "@/components/ChatBot";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">הדף לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">הדף שחיפשת אינו קיים או הועבר.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground hover:opacity-90">
            חזרה לעמוד הבית
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-display text-primary">משהו השתבש</h1>
        <p className="mt-2 text-sm text-muted-foreground">ניתן לרענן את הדף או לחזור לעמוד הבית.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
          >נסה שוב</button>
          <a href="/" className="rounded-full border border-input bg-background px-5 py-2 text-sm">עמוד הבית</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "סטודיו לצילום להשכרה סוויט בייבי  -השכרת אביזרים מיכל סיבוני" },
      { name: "description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי.סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
      { property: "og:title", content: "סטודיו לצילום להשכרה סוויט בייבי  -השכרת אביזרים מיכל סיבוני" },
      { property: "og:description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי.סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Sweetbaby" },
      { property: "og:locale", content: "he_IL" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "סטודיו לצילום להשכרה סוויט בייבי  -השכרת אביזרים מיכל סיבוני" },
      { name: "twitter:description", content: "סטודיו לצילום להשכרה סוויט בייבי — התמונה הראשונה שלי.סטודיו בוטיק להשכרה בבית שמש השכרת אביזרים לצילום ניוברן חלאקה סמאש קיק ועוד, סשן צילום -הצלמת מיכל סיבוני" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6289e61-8ced-4114-a05d-0d663b3f6782/id-preview-e15289a5--7f3ae80d-8585-4972-a43d-424c2a2cc887.lovable.app-1784667774798.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6289e61-8ced-4114-a05d-0d663b3f6782/id-preview-e15289a5--7f3ae80d-8585-4972-a43d-424c2a2cc887.lovable.app-1784667774798.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Fira+Sans:wght@300;400;500;600;700&family=Assistant:wght@300;400;500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Sweetbaby",
          url: "https://sweetbabyphoto.shop",
          logo: "https://sweetbabyphoto.shop/favicon.ico",
          description: "השכרת אביזרים מעוצבים לצילומי ניוברן, גיל שנה, חלאקה ומשפחה.",
          telephone: "+972-54-8529277",
          email: "s0548529277@gmail.com",
          address: {
            "@type": "PostalAddress",
            streetAddress: "תלמוד ירושלמי 24",
            addressLocality: "בית שמש",
            addressCountry: "IL",
          },
          sameAs: [],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Sweetbaby",
          url: "https://sweetbabyphoto.shop",
          inLanguage: "he-IL",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <Outlet />
          <Toaster position="top-center" richColors />
          <ChatBot />
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
