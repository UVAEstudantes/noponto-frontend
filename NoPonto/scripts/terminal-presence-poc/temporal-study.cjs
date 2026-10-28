'use strict';
// Executable offline study of the existing lab gates. No client or feed import.
function assessTemporalAbsence(input) {
  if (input.identitySeen) return { absenceComparable: false, result: 'identity_seen_in_snapshot', reasons: [] };
  const reasons = [];
  if (input.identityAmbiguous) reasons.push('identity_ambiguous');
  if (!input.itsComplete) reasons.push('its_incomplete');
  if (!input.providerKnown) reasons.push('provider_unverified');
  const age = input.nowMs - input.physicalMs;
  if (!Number.isFinite(age) || age < 0 || age > 60000) reasons.push('physical_age_outside_0_to_60s');
  if (!Number.isFinite(input.minuteMs) || input.minuteMs % 60000 !== 0) reasons.push('invalid_requested_minute');
  if (!Number.isFinite(input.serverMs)) reasons.push('server_time_missing_or_invalid');
  else if (input.serverMs < input.minuteMs || input.serverMs >= input.minuteMs + 60000)
    reasons.push('server_time_outside_requested_minute');
  for (const side of ['before', 'after']) {
    const feed = input[side] || {};
    if (!feed.complete) reasons.push('gtfs_' + side + '_incomplete');
    if (!feed.identityCoverage) reasons.push('gtfs_' + side + '_identity_coverage_incomplete');
    if (!Number.isFinite(feed.generatedMs)) reasons.push('gtfs_' + side + '_generation_missing');
    else {
      if (feed.generatedMs > input.nowMs) reasons.push('gtfs_' + side + '_generation_future');
      else if (input.nowMs - feed.generatedMs > 90000) reasons.push('gtfs_' + side + '_generation_older_than_90s');
      if (Math.abs(feed.generatedMs - input.physicalMs) > 60000) reasons.push('gtfs_' + side + '_physical_gap_over_60s');
    }
  }
  if (Number.isFinite(input.before?.generatedMs) && Number.isFinite(input.after?.generatedMs) &&
      input.after.generatedMs <= input.before.generatedMs) reasons.push('gtfs_generation_not_advanced');
  return { absenceComparable: reasons.length === 0,
    result: reasons.length ? 'inconclusive_absence' : 'not_observed_in_aligned_snapshots', reasons };
}
module.exports = { assessTemporalAbsence };
