import logo from "@/assets/logo-peach.png";

export function Footer() {
  return (
    <footer className="mt-24 bg-foreground text-background border-t border-foreground">
      <div className="container-page py-20">
        <div className="grid gap-12 md:grid-cols-12 border-b border-background/15 pb-12">
          <div className="md:col-span-5">
            <img src={logo} alt="Sweetbaby" className="h-16 w-auto -mr-3 opacity-90" />
            <p className="text-background/70 text-sm mt-4 max-w-sm leading-relaxed">
              סטודיו Sweetbaby — התמונה הראשונה שלי. השכרת אביזרים מעוצבים לצילומי ניוברן, גיל שנה, חלאקה ומשפחה.
            </p>
          </div>
          <div className="md:col-span-3 text-sm space-y-2">
            <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">Contact</h4>
            <p className="text-background/85">תלמוד ירושלמי 24, בית שמש</p>
            <p dir="ltr" className="text-start text-background/85">054-8529277</p>
            <p dir="ltr" className="text-start text-background/85">s0548529277@gmail.com</p>
          </div>
          <div className="md:col-span-4 text-sm space-y-2">
            <h4 className="text-[10px] tracking-[0.35em] uppercase text-sand mb-4">Hours</h4>
            <p className="text-background/85">איסוף והחזרה תוך 24 שעות</p>
            <p className="text-background/85">מינימום הזמנה 50 ש״ח</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-between gap-4 pt-8 text-[11px] tracking-[0.28em] uppercase text-background/50">
          <span>© {new Date().getFullYear()} Sweetbaby Studio</span>
          <span>Photography Props · Est. 2020</span>
        </div>
      </div>
    </footer>
  );
}
