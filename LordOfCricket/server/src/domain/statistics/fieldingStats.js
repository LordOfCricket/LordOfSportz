// Pure fielding-statistics math — no pg, no I/O.
//
// Unlike batting/bowling, fielding credit does NOT require replaying an
// innings: wickets.fielder_match_player_id / secondary_fielder_match_player_id
// are simple authoritative facts already attached 1:1 to a delivery, so the
// repository layer can hand this function plain wicket rows (already scoped
// to finalized matches + non-voided deliveries) and this just counts.
//
// Only what the schema can actually attribute is counted: a catch/stumping
// needs dismissal_type + a single fielder (the catcher / the keeper); a
// run-out credits whichever of the (up to two) recorded fielders were this
// player, since the schema explicitly supports a direct-hit fielder and a
// secondary/relay fielder for exactly that dismissal.

export function aggregateFielding(wicketRows, matchPlayerIds) {
  let catches = 0
  let runOuts = 0
  let stumpings = 0

  for (const w of wicketRows) {
    const isFielder = matchPlayerIds.has(w.fielder_match_player_id)
    const isSecondaryFielder = matchPlayerIds.has(w.secondary_fielder_match_player_id)
    if (w.dismissal_type === 'caught' && isFielder) catches += 1
    else if (w.dismissal_type === 'stumped' && isFielder) stumpings += 1
    else if (w.dismissal_type === 'run-out' && (isFielder || isSecondaryFielder)) runOuts += 1
  }

  return { catches, runOuts, stumpings }
}
