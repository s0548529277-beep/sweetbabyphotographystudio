import { emailDomainSuggestions } from "@/lib/email-domains";

/**
 * Pair with an <input list={id}> (any email field, controlled or
 * uncontrolled-with-mirrored-value) to offer common domain completions —
 * gmail.com, walla.co.il, etc. — as soon as "@" is typed.
 */
export function EmailDatalist({ id, value }: { id: string; value: string }) {
  const suggestions = emailDomainSuggestions(value);
  return (
    <datalist id={id}>
      {suggestions.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  );
}
