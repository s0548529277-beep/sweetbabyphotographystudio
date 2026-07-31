import { Car, Bus, MapPin } from "lucide-react";

export const ARRIVAL_ADDRESS = "תלמוד ירושלמי 24, בית שמש — חדר כחול בחניה";

/** Plain-text version, reused inside emails / confirmations. */
export const ARRIVAL_TEXT_HE = [
  "דרכי הגעה:",
  "ברכב — לרשום בוויז: תלמוד ירושלמי 24, בית שמש. הסטודיו נמצא בחדר הכחול בחניה.",
  "באוטובוס — קווים 2 / 4 / 6, לרדת בתחנה פומפדיתא / שדרות האמוראים. משם לגשת לבית שדרות האמוראים 57-59, יש מעבר עם מדרגות; בסוף המעבר בצד ימין זה בניין 24. הסטודיו בחדר הכחול בחניה.",
].join("\n");

/** Shared arrival instructions block (car + bus) for the studio. */
export function ArrivalDirections({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-3xl border border-primary/10 bg-cream/60 p-6 md:p-8 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="h-5 w-5 text-peach-deep" />
        <h3 className="font-display text-2xl text-primary">דרכי הגעה לסטודיו</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-5 text-sm leading-relaxed text-muted-foreground">
        <div className="bg-card rounded-2xl p-5 border border-primary/5">
          <div className="flex items-center gap-2 text-primary font-medium mb-2">
            <Car className="h-4 w-4 text-peach-deep" /> ברכב
          </div>
          <p>
            לרשום בוויז: <span className="text-primary font-medium">תלמוד ירושלמי 24, בית שמש</span>.
            <br />
            הסטודיו נמצא ב<span className="text-primary font-medium">חדר הכחול בחניה</span>.
          </p>
        </div>
        <div className="bg-card rounded-2xl p-5 border border-primary/5">
          <div className="flex items-center gap-2 text-primary font-medium mb-2">
            <Bus className="h-4 w-4 text-peach-deep" /> באוטובוס
          </div>
          <p>
            קווים <span dir="ltr">2 / 4 / 6</span> — יורדים בתחנה פומפדיתא / שדרות האמוראים.
            <br />
            ממשיכים לבית שדרות האמוראים <span dir="ltr">57-59</span>, יש מעבר עם מדרגות; בסוף המעבר בצד ימין זה בניין 24.
            הסטודיו בחדר הכחול בחניה.
          </p>
        </div>
      </div>
    </div>
  );
}
