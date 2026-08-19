export const ARRIVAL_ADDRESS = "תלמוד ירושלמי 24, בית שמש — חדר כחול בחניה";

/** Plain-text arrival instructions, reused inside emails / confirmations. */
export const ARRIVAL_TEXT_HE = [
  "דרכי הגעה:",
  "ברכב — לרשום בוויז: תלמוד ירושלמי 24, בית שמש. הסטודיו נמצא בחדר הכחול בחניה.",
  "באוטובוס — קווים 2 / 4 / 6, לרדת בתחנה פומפדיתא / שדרות האמוראים. משם לגשת למעבר עם מדרגות בין הבניינים בשדרות האמוראים 57-59; בסוף המעבר בצד ימין זה בניין 24. הסטודיו בחדר הכחול בחניה.",
].join("\n");
export const ARRIVAL_HTML_HE = `<div style="margin-top:16px;padding:14px 16px;background:#faf7f4;border-radius:10px;border:1px solid #e8ddd3">
  <p style="margin:0 0 8px;color:#2d3d2b;font-weight:bold;font-size:14px">📍 דרכי הגעה לסטודיו</p>
  <p style="margin:0 0 8px;color:#2d3d2b;font-size:13px;line-height:1.6"><strong>ברכב</strong> — לרשום בוויז: תלמוד ירושלמי 24, בית שמש. הסטודיו נמצא בחדר הכחול בחניה.</p>
  <p style="margin:0;color:#2d3d2b;font-size:13px;line-height:1.6"><strong>באוטובוס</strong> — קווים 2 / 4 / 6, לרדת בתחנה פומפדיתא / שדרות האמוראים. משם לגשת למעבר עם מדרגות בין הבניינים בשדרות האמוראים 57-59; בסוף המעבר בצד ימין זה בניין 24. הסטודיו בחדר הכחול בחניה.</p>
</div>`;
