import logo from "@/assets/logo-peach.png";

export function Footer() {
  return (
    <footer className="mt-24 bg-primary text-primary-foreground">
      <div className="container-page py-14 grid gap-8 md:grid-cols-3">
        <div>
          <img src={logo} alt="Sweetbaby" className="h-16 w-auto -mr-3" />
          <p className="text-primary-foreground/70 text-sm mt-3 max-w-xs leading-relaxed">
            סטודיו סוויט בייבי — התמונה הראשונה שלי. השכרת אביזרים מעוצבים לצילומי ניוברן, גיל שנה, חלאקה ומשפחה.
          </p>
        </div>
        <div className="text-sm space-y-2">
          <h4 className="font-display text-xl mb-3">יצירת קשר</h4>
          <p>תלמוד ירושלמי 24, בית שמש</p>
          <p dir="ltr" className="text-start">054-8529277</p>
          <p dir="ltr" className="text-start">s0548529277@gmail.com</p>
        </div>
        <div className="text-sm space-y-2">
          <h4 className="font-display text-xl mb-3">שעות פעילות</h4>
          <p>איסוף והחזרה תוך 24 שעות</p>
          <p>מינימום הזמנה 50 ש"ח</p>
          <p className="text-primary-foreground/60 mt-4 text-xs">© {new Date().getFullYear()} Sweetbaby Studio</p>
        </div>
      </div>
    </footer>
  );
}
