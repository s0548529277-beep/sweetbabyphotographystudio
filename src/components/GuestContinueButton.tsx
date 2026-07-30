import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { UserRound } from "lucide-react";

/**
 * Lets a customer continue without registering — creates an anonymous session
 * so the order / booking can still be saved and tracked.
 */
export function GuestContinueButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      toast.success("ממשיכים ללא הרשמה — ההזמנה תישמר במצב אורח.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "לא הצלחנו להמשיך במצב אורח");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={start}
      className={`rounded-full w-full gap-2 ${className}`}
    >
      <UserRound className="h-4 w-4" />
      {busy ? "רגע…" : "המשך ללא הרשמה (אורח)"}
    </Button>
  );
}
