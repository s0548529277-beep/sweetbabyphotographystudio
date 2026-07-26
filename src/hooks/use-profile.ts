import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ProfilePrefill = {
  fullName: string;
  phone: string;
  email: string;
  loaded: boolean;
};

/**
 * Loads the signed-in customer's profile details so booking / order forms can
 * be prefilled automatically from the personal area.
 */
export function useProfilePrefill(): ProfilePrefill {
  const { user } = useAuth();
  const [state, setState] = useState<ProfilePrefill>({ fullName: "", phone: "", email: "", loaded: false });

  useEffect(() => {
    let active = true;
    if (!user) {
      setState({ fullName: "", phone: "", email: "", loaded: true });
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
        fullName: data?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "",
        phone: data?.phone ?? (user.user_metadata?.phone as string | undefined) ?? "",
        email: user.email ?? "",
        loaded: true,
      });
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return state;
}
