// Which Toronto Police call types become map pins. The test for each one:
// "If I were walking down this street when this happened, would I care?"
// Crimes count; medical calls, collisions, disputes and fire calls (covered by the fire feed) don't.

const INCLUDED_CODES = new Set([
  'ASS', // ASSAULT
  'ASSJU', // ASSAULT JUST OCCURRED
  'ASSPR', // ASSAULT IN PROGRESS
  'BREEN', // BREAK & ENTER
  'BREPR', // BREAK & ENTER IN PROGRESS
  'DAMJU', // DAMAGE JUST OCCURRED
  'DIS', // DISORDERLIES
  'ESCCU', // ESCAPE CUSTODY
  'FIG', // FIGHT
  'FTRPD', // FAIL TO REMAIN PROPERTY DAMAGE COLLISION (hit and run)
  'FTRPI', // FAIL TO REMAIN PERSONAL INJURY COLLISION (hit and run)
  'HOLAL', // HOLDUP ALARM
  'IMPDR', // IMPAIRED DRIVER
  'PERKN', // PERSON WITH A KNIFE
  'ROB', // ROBBERY
  'THEJU', // THEFT JUST OCCURRED
  'THEPR', // THEFT IN PROGRESS
]);

const EXCLUDED_CODES = new Set([
  'ARR', // ARREST: follows a call that is already on the map
  'DISPU', // DISPUTE
  'FIR', // FIRE
  'FIRAL', // FIRE ALARM
  'HAZ', // HAZARD
  'PDACC', // PROPERTY DAMAGE COLLISION
  'PIACC', // PERSONAL INJURY COLLISION
  'SEEAM', // SEE AMBULANCE
  'SEEFI', // SEE FIRE DEPT
  'TAXAL', // TAXI ALARM
  'UNKTR', // UNKNOWN TROUBLE
]);

// Codes not listed above are matched on their description, so rare types like a shooting
// still show up. Anything that matches neither list is skipped and logged for review.
const INCLUDED_WORDS =
  /ASSAULT|ROBBERY|BREAK & ENTER|THEFT|STOLEN|DAMAGE|MISCHIEF|KNIFE|GUN|FIREARM|SHOOT|STAB|WEAPON|FIGHT|DISORDERL|IMPAIRED|FAIL TO REMAIN|ESCAPE|ARSON|CARJACK|HOLDUP|INDECENT/;
// \bFIRE\b so "PERSON WITH A FIREARM" isn't treated as a fire call.
const EXCLUDED_WORDS = /DISPUTE|AMBULANCE|MEDICAL|\bFIRE\b|COLLISION|ALARM/;

export type CallDecision = 'include' | 'exclude' | 'unknown';

export function classifyCall(code: string, description: string): CallDecision {
  if (INCLUDED_CODES.has(code)) return 'include';
  if (EXCLUDED_CODES.has(code)) return 'exclude';
  const text = description.toUpperCase();
  // Exclusions win, so "DISPUTE WITH WEAPON"-style mixes need an explicit code above.
  if (EXCLUDED_WORDS.test(text) && !/FAIL TO REMAIN|HOLDUP/.test(text)) return 'exclude';
  if (INCLUDED_WORDS.test(text)) return 'include';
  return 'unknown';
}
