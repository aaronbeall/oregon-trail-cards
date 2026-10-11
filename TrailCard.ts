export type Position = 0 | 1 | 2;
export type Supply = 'food' | 'water' | 'medicine' | 'parts';
export type TrailCard = { left: Position; right: Position; type: 'trail' | 'river' | 'calamity'; name: string };
export type Event = { title: string; text: string; supply?: Supply; cost: number; threshold: number; damage: number; kind: 'river' | 'calamity' | 'town' };
export type Journey = { version: 1; miles: number; day: number; health: number; supplies: Record<Supply, number>; hand: TrailCard[]; trail: TrailCard[]; position: Position; event: Event | null; status: 'travel' | 'won' | 'lost'; note: string; die: number | null };
export const names: Record<Supply, string> = { food: 'Provisions', water: 'Water', medicine: 'Medicine', parts: 'Spare parts' };
export const stops = ['Independence', 'Fort Kearny', 'Fort Laramie', 'Fort Hall', 'Oregon City'];
export const roll = (random = Math.random) => Math.floor(random() * 6) + 1;
export const rollCheck = (passing: number[], random = Math.random) => passing.includes(roll(random));
const pick = <T>(items: T[], random: () => number): T => items[Math.floor(random() * items.length)];
const events: Event[] = [
  { title: 'An axle with other plans', text: 'The wheel has decided to become a separate undertaking. A spare part would persuade it otherwise.', supply: 'parts', cost: 1, threshold: 4, damage: 2, kind: 'calamity' },
  { title: 'A suspicious little puddle', text: 'The water looks charming. Your stomach has filed a dissenting opinion. Best open a fresh flask.', supply: 'water', cost: 1, threshold: 3, damage: 1, kind: 'calamity' },
  { title: 'A very dramatic sniffle', text: 'Someone has taken to their blanket and composed a farewell poem. A little medicine should shorten it.', supply: 'medicine', cost: 1, threshold: 4, damage: 2, kind: 'calamity' },
  { title: 'The oxen hold a meeting', text: 'The agenda contains just one item: lunch. They will accept provisions or a particularly convincing pep talk.', supply: 'food', cost: 2, threshold: 3, damage: 1, kind: 'calamity' },
  { title: 'Rain, with enthusiasm', text: 'Everything is damp, including morale. A warm meal might remind the party that blankets are usually nicer than this.', supply: 'food', cost: 1, threshold: 3, damage: 1, kind: 'calamity' },
];
export class TrailGame {
  state: Journey;
  constructor(public random = Math.random, saved?: Journey) { this.state = saved ?? this.fresh(); }
  card(left?: Position): TrailCard {
    const type = pick<TrailCard['type']>(['trail', 'trail', 'river', 'calamity'], this.random);
    return { left: left ?? pick<Position>([0, 1, 2], this.random), right: pick<Position>([0, 1, 2], this.random), type, name: pick(type === 'trail' ? ['Quiet country', 'The long way round', 'Prairie daydream', 'A little further'] : type === 'river' ? ['Water under wheels', 'A river to ponder', 'The other bank'] : ['A small predicament', 'Plans, amended', 'Oh, bother'], this.random) };
  }
  fresh(): Journey { return { version: 1, miles: 0, day: 1, health: 6, supplies: { food: 7, water: 3, medicine: 2, parts: 2 }, hand: [this.card(1), this.card(), this.card()], trail: [], position: 1, event: null, status: 'travel', note: 'The wagon is packed. The horizon looks agreeable.', die: null }; }
  reset() { this.state = this.fresh(); }
  play(index: number) {
    const s = this.state, card = s.hand[index];
    if (s.status !== 'travel' || s.event || !card || card.left !== s.position) return false;
    s.die = null; s.trail.push(card); s.position = card.right; s.miles++; s.day++;
    s.hand.splice(index, 1, this.card());
    if (!s.hand.some(c => c.left === s.position)) s.hand[Math.floor(this.random() * 3)] = this.card(s.position);
    if (s.supplies.food > 0) s.supplies.food--; else s.health--;
    s.note = pick(['The wheels hum a small, dusty tune.', 'Nothing dramatic. An excellent sort of day.', 'A cloud follows along, apparently curious.', 'The oxen seem quietly proud of themselves.'], this.random);
    if (s.health <= 0) { this.finish(); return true; }
    if (card.type === 'river') s.event = { title: 'A river, being a river', text: 'The far bank looks lovely. The wet middle is less helpful. Hire a ferry with a spare part to barter, or trust your wagon to a careful crossing.', supply: 'parts', cost: 1, threshold: 4, damage: 2, kind: 'river' };
    else if (card.type === 'calamity') s.event = { ...pick(events, this.random) };
    else this.arrive();
    return true;
  }
  resolve(safe: boolean) {
    const s = this.state, e = s.event;
    if (!e || e.kind === 'town' || s.status !== 'travel') return false;
    if (safe) {
      if (!e.supply || s.supplies[e.supply] < e.cost) return false;
      s.supplies[e.supply] -= e.cost; s.die = null; s.note = 'A little preparation goes a wonderfully long way.';
    } else {
      s.die = roll(this.random);
      if (s.die < e.threshold) { s.health -= e.damage; s.note = 'A rough day. The party gathers itself and carries on.'; }
      else s.note = 'Quite improbably, that went splendidly.';
    }
    s.event = null; this.arrive(); return true;
  }
  rest(choice: Supply | 'health') {
    const s = this.state;
    if (s.event?.kind !== 'town' || !['food','water','medicine','parts','health'].includes(choice)) return false;
    s.supplies.food += 4;
    if (choice === 'health') s.health = Math.min(6, s.health + 2); else s.supplies[choice] += 2;
    s.note = 'Warm bread, fresh gossip, and a little more road in your heart.'; s.event = null; return true;
  }
  arrive() {
    const s = this.state; this.finish();
    if (s.status === 'travel' && s.miles % 4 === 0) s.event = { title: stops[s.miles / 4], text: 'A friendly porch appears. There are four provisions for the road, and one little kindness of your choosing.', cost: 0, threshold: 0, damage: 0, kind: 'town' };
  }
  finish() {
    const s = this.state;
    if (s.health <= 0) { s.health = 0; s.status = 'lost'; s.event = null; s.note = 'The wagon needs a longer rest. Oregon will keep the kettle on for another try.'; }
    else if (s.miles >= 16) { s.status = 'won'; s.event = null; s.note = 'Oregon at last. Unpack the kettle. You have earned a very unhurried cup of tea.'; }
  }
}
export function readSave(value: string | null): Journey | undefined {
  try {
    const s = JSON.parse(value ?? 'null');
    const pos = (p: unknown) => p === 0 || p === 1 || p === 2;
    const card = (c: any) => c && pos(c.left) && pos(c.right) && ['trail', 'river', 'calamity'].includes(c.type) && typeof c.name === 'string';
    if (s?.version !== 1 || !Number.isInteger(s.miles) || s.miles < 0 || s.miles > 16 || !Number.isInteger(s.day) || s.day < 1 || !Number.isInteger(s.health) || s.health < 0 || s.health > 6 || !pos(s.position) || !['travel','won','lost'].includes(s.status) || !Array.isArray(s.hand) || s.hand.length !== 3 || !s.hand.every(card) || !Array.isArray(s.trail) || s.trail.length !== s.miles || !s.trail.every(card) || typeof s.note !== 'string' || !(s.die === null || Number.isInteger(s.die) && s.die >= 1 && s.die <= 6) || !['food','water','medicine','parts'].every(k => Number.isInteger(s.supplies?.[k]) && s.supplies[k] >= 0 && s.supplies[k] <= 40)) return;
    if (s.event !== null && (!s.event || !['river','calamity','town'].includes(s.event.kind) || typeof s.event.title !== 'string' || typeof s.event.text !== 'string' || !Number.isInteger(s.event.cost) || s.event.cost < 0 || s.event.cost > 2 || !Number.isInteger(s.event.threshold) || s.event.threshold < 0 || s.event.threshold > 6 || !Number.isInteger(s.event.damage) || s.event.damage < 0 || s.event.damage > 2 || s.event.kind !== 'town' && !['food','water','medicine','parts'].includes(s.event.supply))) return;
    return s;
  } catch { return; }
}
