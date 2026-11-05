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

/** One-tap Waze navigation to the studio (same address as the site's home page link). */
export const STUDIO_WAZE_URL = "https://waze.com/ul?q=%D7%AA%D7%9C%D7%9E%D7%95%D7%93%20%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%9E%D7%99%2024%2C%20%D7%91%D7%99%D7%AA%20%D7%A9%D7%9E%D7%A9&navigate=yes";

/** The studio address as a Waze link, for e-mail lines like "כתובת הסטודיו: …". */
export const STUDIO_ADDRESS_WAZE_HTML = `<a href="${STUDIO_WAZE_URL}" style="color:inherit;text-decoration:underline">תלמוד ירושלמי 24, בית שמש</a>`;

/** Pill button "ניווט בוויז" in the same style as the signature buttons. */
export const WAZE_BUTTON_HTML = `<div style="text-align:center;margin:16px 0 4px"><a href="${STUDIO_WAZE_URL}" style="display:inline-block;background:#3e3029;color:#f7f3ee;border:1px solid #3e3029;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:9px 24px;border-radius:18px;white-space:nowrap">ניווט בוויז 🚗</a></div>`;
