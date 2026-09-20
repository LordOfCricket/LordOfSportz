/**
 * Best-available official/cross-verified Kata list for the WKF Kata
 * Competition Rules, Version 2026.0 (valid from 1 January 2026).
 *
 * IMPORTANT PROVENANCE NOTE: the rules document's own Appendix 1 ("OFFICIAL
 * KATA LIST") is rendered as an image/table in the published PDF
 * (https://www.wkf.net/files/pdf/documents/WKF%20Kata%20Competition%20Rules%202026%20MASTER%20COPY_V2.pdf)
 * and is not machine-text-extractable — confirmed by direct extraction
 * attempt on 2026-09-17 (the page contains only its introductory sentence).
 * This list is instead a union of two independently retrieved sources that
 * both title themselves as the WKF Tokui/approved Kata list, cross-checked
 * against each other for consistency:
 *   - https://karatecoaching.com/7801-2/ ("WKF-Approved Kata by Style")
 *   - https://www.sportdata.org/karate/ausschreibungen/977/WKF%20Liste%20de%20Kata.pdf
 *     ("TOKUI KATA LIST OF THE WORLD KARATE FEDERATION (WKF)")
 * Both retrieved 2026-09-17. This is the strongest available seed, not a
 * verbatim transcription of Appendix 1 — treat as a starting reference set,
 * not a certified-complete official enumeration.
 */
export interface OfficialKataListEntry {
  name: string;
  styleNote: string;
}

export const OFFICIAL_KATA_LIST: OfficialKataListEntry[] = [
  // Goju-Ryu
  { name: "Sanchin", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Saifa", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Seiyunchin", styleNote: "Goju-Ryu" },
  { name: "Shisochin", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Sanseru", styleNote: "Goju-Ryu" },
  { name: "Sanseiru", styleNote: "Shito-Ryu" },
  { name: "Seisan", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Seipai", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Kururunfa", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Suparimpei", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Tensho", styleNote: "Goju-Ryu, Shito-Ryu" },
  { name: "Gekisai Dai Ichi", styleNote: "Goju-Ryu (Cadet/Junior)" },
  { name: "Gekisai Dai Ni", styleNote: "Goju-Ryu (Cadet/Junior)" },
  // Wado-Ryu
  { name: "Kushanku", styleNote: "Wado-Ryu" },
  { name: "Naihanchi", styleNote: "Wado-Ryu" },
  { name: "Seishan", styleNote: "Wado-Ryu" },
  { name: "Chinto", styleNote: "Wado-Ryu, Shito-Ryu" },
  { name: "Passai", styleNote: "Wado-Ryu" },
  { name: "Niseishi", styleNote: "Wado-Ryu, Shito-Ryu" },
  { name: "Rohai", styleNote: "Wado-Ryu, Shito-Ryu" },
  { name: "Wanshu", styleNote: "Wado-Ryu, Shito-Ryu" },
  { name: "Jion", styleNote: "Wado-Ryu, Shotokan, Shito-Ryu" },
  { name: "Jitte", styleNote: "Wado-Ryu, Shotokan, Shito-Ryu" },
  { name: "Pinan Shodan", styleNote: "Wado-Ryu, Shito-Ryu (Cadet/Junior)" },
  { name: "Pinan Nidan", styleNote: "Wado-Ryu, Shito-Ryu (Cadet/Junior)" },
  { name: "Pinan Sandan", styleNote: "Wado-Ryu, Shito-Ryu (Cadet/Junior)" },
  { name: "Pinan Yondan", styleNote: "Wado-Ryu, Shito-Ryu (Cadet/Junior)" },
  { name: "Pinan Godan", styleNote: "Wado-Ryu, Shito-Ryu (Cadet/Junior)" },
  // Shotokan
  { name: "Bassai Dai", styleNote: "Shotokan, Shito-Ryu" },
  { name: "Bassai Sho", styleNote: "Shotokan, Shito-Ryu" },
  { name: "Kanku Dai", styleNote: "Shotokan" },
  { name: "Kanku Sho", styleNote: "Shotokan" },
  { name: "Tekki Shodan", styleNote: "Shotokan" },
  { name: "Tekki Nidan", styleNote: "Shotokan" },
  { name: "Tekki Sandan", styleNote: "Shotokan" },
  { name: "Hangetsu", styleNote: "Shotokan" },
  { name: "Empi", styleNote: "Shotokan" },
  { name: "Gankaku", styleNote: "Shotokan" },
  { name: "Meikyo", styleNote: "Shotokan" },
  { name: "Wankan", styleNote: "Shotokan" },
  { name: "Ji'in", styleNote: "Shotokan, Shito-Ryu" },
  { name: "Sochin", styleNote: "Shotokan, Shito-Ryu" },
  { name: "Nijushiho Sho", styleNote: "Shotokan" },
  { name: "Gojushiho Dai", styleNote: "Shotokan" },
  { name: "Gojushiho Sho", styleNote: "Shotokan" },
  { name: "Unsu", styleNote: "Shotokan" },
  { name: "Chinte", styleNote: "Shotokan, Shito-Ryu" },
  { name: "Heian Shodan", styleNote: "Shotokan (Cadet/Junior)" },
  { name: "Heian Nidan", styleNote: "Shotokan (Cadet/Junior)" },
  { name: "Heian Sandan", styleNote: "Shotokan (Cadet/Junior)" },
  { name: "Heian Yondan", styleNote: "Shotokan (Cadet/Junior)" },
  { name: "Heian Godan", styleNote: "Shotokan (Cadet/Junior)" },
  // Shito-Ryu
  { name: "Matsukaze", styleNote: "Shito-Ryu" },
  { name: "Tomari Bassai", styleNote: "Shito-Ryu" },
  { name: "Matsumura Bassai", styleNote: "Shito-Ryu" },
  { name: "Kosokun Dai", styleNote: "Shito-Ryu" },
  { name: "Kosokun Sho", styleNote: "Shito-Ryu" },
  { name: "Kosokun Shiho", styleNote: "Shito-Ryu" },
  { name: "Seienchin", styleNote: "Shito-Ryu" },
  { name: "Gojushiho", styleNote: "Shito-Ryu" },
  { name: "Unshu", styleNote: "Shito-Ryu" },
  { name: "Naifanchin Shodan", styleNote: "Shito-Ryu" },
  { name: "Naifanchin Nidan", styleNote: "Shito-Ryu" },
  { name: "Naifanchin Sandan", styleNote: "Shito-Ryu" },
  { name: "Aoyagi", styleNote: "Shito-Ryu" },
  { name: "Jyuroku", styleNote: "Shito-Ryu" },
  { name: "Nipaipo", styleNote: "Shito-Ryu" },
  { name: "Hakucho", styleNote: "Shito-Ryu" },
  { name: "Pachu", styleNote: "Shito-Ryu" },
  { name: "Heiku", styleNote: "Shito-Ryu" },
  { name: "Paiku", styleNote: "Shito-Ryu" },
  { name: "Annan", styleNote: "Shito-Ryu" },
  { name: "Annanko", styleNote: "Shito-Ryu" },
  { name: "Papuren", styleNote: "Shito-Ryu" },
  { name: "Chatanyara Kushanku", styleNote: "Shito-Ryu" },
];
