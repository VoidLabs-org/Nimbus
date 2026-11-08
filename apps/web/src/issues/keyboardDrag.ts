/**
 * Moving a carried Issue by keyboard, as places in groups of cards: the Board's columns now, the Swimlanes' cells and
 * the List's and Table's groups later. It knows nothing of the screen: a view says what its groups are, which index
 * Left and Right reach (`across`), and moves its drag to the place this gives.
 */

/** A group of cards in their order, its key list possibly holding the carried card itself. */
export type Group = { id: string; name: string; keys: string[] };

/** Where the carried card would land: a group, and its index among that group's other cards. */
export type Place = { group: number; index: number };

export type Direction = "up" | "down" | "left" | "right";

/** The other cards of a group, without the carried one. */
function others(group: Group, carried: string) {
  return group.keys.filter((key) => key !== carried);
}

/** Where the carried card is before it moves, or null if it is in no group. */
export function placeOf(groups: Group[], carried: string): Place | null {
  for (const [group, { keys }] of groups.entries()) {
    const index = keys.indexOf(carried);
    if (index >= 0) return { group, index };
  }
  return null;
}

/**
 * The place an arrow key carries the card to. Up and Down move it one place in its group, stopping at the ends. Left
 * and Right move it to the neighbouring group, at the index `across` gives for it (its own index by default, about
 * the same height when cards are alike), kept within that group; past the first or last group it stays.
 */
export function nextPlace(
  groups: Group[],
  carried: string,
  place: Place,
  direction: Direction,
  across: (group: number) => number = () => place.index,
): Place {
  const last = (group: number) => others(groups[group]!, carried).length;
  if (direction === "up") return { ...place, index: Math.max(0, place.index - 1) };
  if (direction === "down")
    return { ...place, index: Math.min(last(place.group), place.index + 1) };
  const group = place.group + (direction === "left" ? -1 : 1);
  if (group < 0 || group >= groups.length) return place;
  return { group, index: Math.min(Math.max(0, across(group)), last(group)) };
}

/** The keys of the cards directly above and below the place, as a drop sends them. */
export function neighboursAt(groups: Group[], carried: string, place: Place) {
  const rest = others(groups[place.group]!, carried);
  return { after: rest[place.index - 1], before: rest[place.index] };
}

/** "position 3 of 8 in In progress": the place, counting the carried card in its group. */
export function describeWhere(groups: Group[], carried: string, place: Place) {
  const group = groups[place.group]!;
  return `position ${place.index + 1} of ${others(group, carried).length + 1} in ${group.name}`;
}

/** "NIM-12, position 3 of 8 in In progress", as the live region says it while the card moves. */
export function describePlace(groups: Group[], carried: string, place: Place) {
  return `${carried}, ${describeWhere(groups, carried, place)}`;
}

/** The key of the card (or group) a drag should be over to stand at the place (see the Board's keyboard drag). */
export function aimAt(groups: Group[], carried: string, place: Place): string {
  const group = groups[place.group]!;
  // In its own group the card is one of the keys, and being over the card at an index puts it at that index.
  if (group.keys.includes(carried)) return group.keys[place.index] ?? carried;
  const rest = others(group, carried);
  // In another group, over the card it lands above; past the last card, over the last one; in an empty group, the group.
  return rest[place.index] ?? rest.at(-1) ?? group.id;
}
