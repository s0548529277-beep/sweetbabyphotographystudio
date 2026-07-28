import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { loadContactHandoff } from "@/lib/contact-handoff";

export type ProfilePrefill = {
  fullName: string;
  phone: string;
  email: string;
  /** Session type carried over from the coordination agreement. */
  sessionType: string;
  loaded: boolean;
};

/**
 * Loads the signed-in customer's profile details so booking / order forms can
 * be prefilled automatically from the personal area.
 */
export function useProfilePrefill(): ProfilePrefill {
  const { user } = useAuth();
  const [state, setState] = useState<ProfilePrefill>({
    fullName: "", phone: "", email: "", sessionType: "", loaded: false,
  });

  useEffect(() => {
    let active = true;
    const handoff = loadContactHandoff();
    if (!user) {
      setState({ ...handoff, loaded: true });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      setState({
        fullName: handoff.fullName || data?.full_name || (user.user_metadata?.full_name as string | undefined) || "",
        phone: handoff.phone || data?.phone || (user.user_metadata?.phone as string | undefined) || "",
        email: user.email || handoff.email || "",
        sessionType: handoff.sessionType,
        loaded: true,
      });
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return state;
}
