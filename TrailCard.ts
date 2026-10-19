export const PORTRAIT_COUNT = 18;
export type Position = 0 | 1 | 2;
export type Supply =
  "food" | "water" | "medicine" | "parts" | "oxen" | "clothes" | "bullets";
export const names: Record<Supply, string> = {
  food: "Food",
  water: "Clean water",
  medicine: "Medicine",
  parts: "Spare parts",
  oxen: "Oxen",
  clothes: "Clothes",
  bullets: "Bullets",
};
export type TrailCard = {
  id: number;
  left: Position;
  right: Position;
  type: "trail" | "calamity" | "river" | "town" | "fort";
  rotated: boolean;
  deadly?: boolean;
  journeyStep?: number;
  locationName?: string;
};
export type Calamity =
  | "axle"
  | "tongue"
  | "wheel"
  | "oxen"
  | "water"
  | "grass"
  | "cholera"
  | "measles"
  | "arm"
  | "cold"
  | "typhoid"
  | "starvation"
  | "thief"
  | "hunting"
  | "snake"
  | "dysentery";
export const titles: Record<Calamity, string> = {
  axle: "Broken axle",
  tongue: "Broken tongue",
  wheel: "Broken wheel",
  oxen: "Dead oxen",
  water: "Bad water",
  grass: "Inadequate grass",
  cholera: "Cholera",
  measles: "Measles",
  arm: "Broken arm",
  cold: "Extreme cold",
  typhoid: "Typhoid",
  starvation: "Starvation",
  thief: "Thief",
  hunting: "Hunting",
  snake: "Snakebite",
  dysentery: "Dysentery",
};
export type TrailReport = {
  card?: TrailCard;
  playedBy?: number;
  title: string;
  scene?: "success" | "loss" | "drowning" | "attempt" | "restored";
  calamity?: Calamity;
  owner?: number;
  attempts?: number;
  results?: string[];
  remedies?: (Calamity | { kind: Calamity; owner?: number })[];
  wagonRemedies?: { kind: Calamity; supply: Supply; player: number }[];
  losses: number;
  lostSupplies?: Supply[];
  lostSupplyOwners?: number[];
  gainOwner?: number;
  gains: Partial<Record<Supply, number>>;
  deaths: { name: string; cause: string }[];
};
export type Hazard = {
  trailStep?: number;
  virtual?: boolean;
  id: number;
  kind: Calamity;
  owner: number;
  needs: Partial<Record<Supply, number>>;
  rounds: number | null;
  waiting: number[];
  born: number;
  skip: number;
};
export type HazardSeverity = "setback" | "risk" | "danger" | "critical";
/** Presentation urgency follows the actual recovery/death rules, not illness names. */
export function hazardSeverity(
  hazard: Pick<Hazard, "kind" | "rounds">,
): HazardSeverity {
  if (hazard.kind === "arm") return "setback";
  if (["cholera", "measles", "grass", "water"].includes(hazard.kind))
    return "risk";
  if (hazard.rounds !== null) return hazard.rounds <= 1 ? "critical" : "danger";
  return "setback";
}
export const JOURNEY_START_DATE = "1847-04-01";
// Fictional birthdays belong to the illustrated characters, in atlas order.
export const portraitBirthdays = [
  "1822-08-19",
  "1792-11-03",
  "1817-05-26",
  "1813-09-12",
  "1782-06-07",
  "1824-12-14",
  "1775-10-22",
  "1821-07-04",
  "1802-08-30",
  "1799-05-18",
  "1827-11-09",
  "1770-09-23",
  "1815-06-16",
  "1811-10-05",
  "1777-07-28",
  "1819-12-02",
  "1804-08-11",
  "1795-05-31",
] as const;
export function journeyDate(days: number, start = JOURNEY_START_DATE) {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function nextJourneyStartDate(previous: (string | undefined)[]) {
  // Journey numbering supplies a stable baseline for older saves sharing April 1.
  let next = journeyDate(previous.length);
  for (const date of previous) {
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date))
    )
      continue;
    const following = journeyDate(1, date);
    if (following > next) next = following;
  }
  return next;
}
export function calendarDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export type Player = {
  controller?: "human" | "computer";
  portrait?: number;
  name: string;
  alive: boolean;
  hand: TrailCard[];
  supplies: Supply[];
  epitaph: string;
  deathCause?: string;
  birthday?: string;
  deathDate?: string;
  deathDay?: number;
};
export type Phase =
  | "turn"
  | "river"
  | "repair"
  | "town"
  | "fort"
  | "stack"
  | "discard"
  | "legacy";
export type SupplyLoss = {
  sequence: number;
  owner: number;
  supply: Supply;
  reason: "river" | "thief";
};
export type Journey = {
  version: 2;
  players: Player[];
  current: number;
  turn: number;
  deck: TrailCard[];
  calamities: Calamity[];
  discarded: Calamity[];
  shop: Record<Supply, number>;
  stacks: TrailCard[][];
  run: TrailCard[];
  count: number;
  hazards: Hazard[];
  serial: number;
  phase: Phase;
  resume: Phase;
  deaths: number[];
  legacyCount: number;
  pending: Calamity | null;
  take: number;
  used: number;
  status: "travel" | "won" | "lost";
  note: string;
  die: number | null;
  started: boolean;
  startDate?: string;
  trailReports?: Record<number, TrailReport>;
  lastSupplyLoss?: SupplyLoss;
};
/** Count actual player turns, including this turn, until this condition expires. */
export function hazardDeadline(s: Journey, hazard: Hazard) {
  if (hazard.rounds === null || hazard.rounds <= 0) return;
  const living = s.players.flatMap((p, i) => (p.alive ? [i] : []));
  if (!living.length) return;
  let waiting = new Set(hazard.waiting.filter((i) => s.players[i]?.alive));
  let rounds = hazard.rounds;
  let turns = 0;
  for (let offset = 0; ; offset++) {
    const player = (s.current + offset) % s.players.length;
    if (!s.players[player].alive) continue;
    turns++;
    // A condition drawn this turn starts counting on the following turn.
    if (offset === 0 && hazard.born === s.turn) continue;
    waiting.delete(player);
    if (!waiting.size) {
      if (--rounds === 0) return { turns, player };
      waiting = new Set(living);
    }
  }
}

export function ends(c: TrailCard): [Position, Position] {
  return c.rotated
    ? [(2 - c.right) as Position, (2 - c.left) as Position]
    : [c.left, c.right];
}
export function label(c: TrailCard) {
  if ((c.type === "town" || c.type === "fort") && c.locationName)
    return c.locationName;
  return c.type === "river"
    ? c.deadly
      ? "River · drowning risk"
      : "River crossing"
    : c.type === "calamity"
      ? "Calamity"
      : c.type === "town"
        ? "Town"
        : c.type === "fort"
          ? "Fort"
          : "Quiet trail";
}
export function description(c: TrailCard) {
  switch (c.type) {
    case "calamity":
      return "Face a calamity and resolve its effect.";
    case "river":
      return c.deadly
        ? "Roll even to cross. A 1 drowns the traveller; 3 or 5 passes the attempt."
        : "Roll even to cross. A 1 loses a supply; 3 or 5 passes the attempt.";
    case "town":
      return "Take one supply OR remove one active calamity.";
    case "fort":
      return "Take two available supplies.";
    case "trail":
      return "Lay this road and end your turn.";
  }
}
export const roll = (random = Math.random) => Math.floor(random() * 6) + 1;
export function trailDeck() {
  let id = 0;
  const result: TrailCard[] = [];
  const add = (
    type: TrailCard["type"],
    pattern: string,
    n: number,
    deadly = false,
  ) => {
    for (let i = 0; i < n; i++)
      result.push({
        id: id++,
        type,
        left: "LMR".indexOf(pattern[0]) as Position,
        right: "LMR".indexOf(pattern[1]) as Position,
        rotated: false,
        deadly,
      });
  };
  for (const [type, counts] of [
    ["calamity", [4, 4, 3, 4, 4, 5]],
    ["trail", [1, 1, 3, 1, 1, 1]],
    ["river", [2, 3, 3, 2, 3, 4]],
  ] as const)
    ["LM", "LR", "MM", "RL", "RM", "RR"].forEach((p, i) =>
      add(type, p, counts[i]),
    );
  add("river", "LM", 1, true);
  add("river", "MM", 1, true);
  add("river", "RL", 1, true);
  add("town", "MM", 2);
  add("fort", "MM", 2);
  return result;
}
export class TrailGame {
  state: Journey;
  constructor(
    public random = Math.random,
    saved?: Journey,
    private onRoll?: (n: number) => void,
    private onCalamity?: (kind: Calamity | undefined) => void,
  ) {
    this.state = saved ?? this.fresh(["Juniper", "Clementine", "Otis"]);
    this.state.startDate ??= JOURNEY_START_DATE;
    // Older saves stored five-card piles; restore their surviving cards in visit order.
    if (this.state.stacks.length) {
      const earlier = this.state.stacks.flatMap((pile, index) =>
        pile.map((c, offset) => ({
          ...c,
          journeyStep: c.journeyStep ?? index * 5 + offset + 1,
        })),
      );
      this.state.run = [...earlier, ...this.state.run].sort(
        (a, b) =>
          (a.journeyStep ?? this.state.count) -
          (b.journeyStep ?? this.state.count),
      );
      this.state.stacks = [];
    }
    if (this.state.phase === "stack") this.finishCard();
    if (this.state.resume === "stack") this.state.resume = "turn";
    this.nameLocations([
      ...this.state.deck,
      ...this.state.run,
      ...this.state.players.flatMap((p) => p.hand),
      ...Object.values(this.state.trailReports ?? {}).flatMap((r) =>
        r.card ? [r.card] : [],
      ),
    ]);
    for (const report of Object.values(this.state.trailReports ?? {}))
      if (report.card?.locationName && ["Town", "Fort"].includes(report.title))
        report.title = report.card.locationName;
    const assigned = new Set(this.state.players.map((p) => p.portrait));
    const available = this.shuffle(
      Array.from({ length: PORTRAIT_COUNT }, (_, i) => i).filter(
        (i) => !assigned.has(i),
      ),
    );
    for (const player of this.state.players) {
      if (player.portrait === undefined) player.portrait = available.pop()!;
      player.birthday ??= portraitBirthdays[player.portrait];
    }
  }
  private nameLocations(cards: TrailCard[]) {
    const locations = cards.filter(
      (c) => c.type === "town" || c.type === "fort",
    );
    const assigned = new Map(
      locations
        .filter((c) => c.locationName)
        .map((c) => [c.id, c.locationName!]),
    );
    const used = new Set(assigned.values());
    const townNames = this.shuffle(
      [
        "Clover Creek",
        "Juniper Hollow",
        "Willow Bend",
        "Bramble Crossing",
        "Copper Kettle",
        "Whispering Pines",
        "Thistle Junction",
        "Hazel Springs",
        "Cottonwood Vale",
        "Sparrow Ridge",
        "Prairie Lantern",
        "Applewood Landing",
      ].filter((n) => !used.has(n)),
    );
    const fortNames = this.shuffle(
      [
        "Fort Juniper",
        "Fort Lantern",
        "Fort Willow",
        "Fort Cinder",
        "Fort Ashwood",
        "Fort Sparrow",
        "Fort Cedar",
        "Fort Bramble",
        "Fort Hearth",
        "Fort Mosswood",
        "Fort Cottonwood",
        "Fort Copper",
      ].filter((n) => !used.has(n)),
    );
    for (const c of locations) {
      if (!assigned.has(c.id))
        assigned.set(c.id, (c.type === "town" ? townNames : fortNames).pop()!);
      c.locationName = assigned.get(c.id);
    }
  }
  shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  fresh(playerNames: string[]): Journey {
    const deck = this.shuffle(trailDeck()),
      stock: Record<Supply, number> = {
        medicine: 6,
        water: 5,
        oxen: 3,
        parts: 4,
        clothes: 3,
        food: 3,
        bullets: 2,
      };
    const bag = this.shuffle(
      (Object.keys(stock) as Supply[]).flatMap((k) =>
        Array<Supply>(stock[k]).fill(k),
      ),
    );
    const n = playerNames.length;
    const amount = n === 2 ? 8 : n < 5 ? 5 : n === 5 ? 4 : 3;
    const portraits = this.shuffle(
      Array.from({ length: PORTRAIT_COUNT }, (_, i) => i),
    );
    const players = playerNames.map((name, index) => ({
      portrait: portraits[index],
      birthday: portraitBirthdays[portraits[index]],
      name,
      alive: true,
      hand: deck.splice(0, 5),
      supplies: bag.splice(0, amount),
      epitaph: "",
    }));
    const shop = { ...stock };
    players.forEach((p) => p.supplies.forEach((k) => shop[k]--));
    this.nameLocations(deck);
    return {
      version: 2,
      players,
      current: 0,
      turn: 1,
      deck,
      calamities: this.shuffle(
        (Object.keys(titles) as Calamity[]).flatMap((k) => [k, k]),
      ),
      discarded: [],
      shop,
      stacks: [],
      run: [],
      count: 0,
      hazards: [],
      serial: 0,
      phase: "turn",
      resume: "turn",
      deaths: [],
      legacyCount: 0,
      pending: null,
      take: 0,
      used: 0,
      status: "travel",
      note: "The kettle is packed. Fifty little roads to Oregon.",
      die: null,
      started: false,
      startDate: JOURNEY_START_DATE,
    };
  }
  reset(playerNames: string[], first = 0, portraits?: number[]) {
    if (
      playerNames.length < 2 ||
      playerNames.length > 6 ||
      playerNames.some((n) => !n.trim()) ||
      first < 0 ||
      first >= playerNames.length ||
      (portraits !== undefined &&
        (portraits.length !== playerNames.length ||
          portraits.some(
            (n) => !Number.isInteger(n) || n < 0 || n >= PORTRAIT_COUNT,
          )))
    )
      return false;
    this.state = this.fresh(playerNames.map((n) => n.trim().slice(0, 30)));
    if (portraits)
      this.state.players.forEach((p, i) => {
        p.portrait = portraits[i];
        p.birthday = portraitBirthdays[portraits[i]];
      });
    this.state.current = first;
    this.state.started = true;
    return true;
  }
  get player() {
    return this.state.players[this.state.current];
  }
  get living() {
    return this.state.players
      .map((p, i) => (p.alive ? i : -1))
      .filter((i) => i >= 0);
  }
  get top() {
    const s = this.state;
    return s.run.at(-1);
  }
  get blocked() {
    return this.state.hazards.some((h) =>
      ["axle", "tongue", "wheel", "oxen"].includes(h.kind),
    );
  }
  get hasTrail() {
    return (
      !this.blocked &&
      !this.skips &&
      this.player.hand.some(
        (c) => this.matches(c) || this.matches({ ...c, rotated: !c.rotated }),
      )
    );
  }
  get skips() {
    return this.state.hazards.some(
      (h) => h.owner === this.state.current && h.skip > 0,
    );
  }
  matches(c: TrailCard) {
    const t = this.top;
    return (
      !t ||
      ["town", "fort"].includes(t.type) ||
      ["town", "fort"].includes(c.type) ||
      ends(t)[1] === ends(c)[0]
    );
  }
  canPlay(c: TrailCard) {
    return (
      this.state.started &&
      this.state.status === "travel" &&
      this.state.phase === "turn" &&
      !this.blocked &&
      !this.skips &&
      !this.state.used &&
      this.matches(c)
    );
  }
  rotate(i: number) {
    if (
      this.state.phase !== "turn" ||
      this.state.status !== "travel" ||
      !this.player.hand[i]
    )
      return false;
    this.player.hand[i].rotated = !this.player.hand[i].rotated;
    return true;
  }
  play(i: number) {
    const s = this.state,
      c = this.player.hand[i];
    if (!c || !this.canPlay(c)) return false;
    this.player.hand.splice(i, 1);
    s.run.push(c);
    s.count++;
    s.die = null;
    s.note = `${this.player.name} laid ${label(c).toLowerCase()}.`;
    if (c.type === "river") {
      s.phase = "river";
      return true;
    }
    if (c.type === "town" || c.type === "fort") {
      s.phase = c.type;
      s.take = c.type === "fort" ? 2 : 1;
      return true;
    }
    if (c.type === "calamity") {
      this.drawCalamity();
      return true;
    }
    this.finishCard();
    return true;
  }
  private die() {
    const n = roll(this.random);
    this.state.die = n;
    this.onRoll?.(n);
    return n;
  }
  private order(owner: number) {
    const n = this.state.players.length;
    return Array.from({ length: n }, (_, i) => (owner + i + 1) % n).filter(
      (i) => this.state.players[i].alive,
    );
  }
  private add(
    kind: Calamity,
    needs: Hazard["needs"],
    rounds: number | null = null,
    skip = 0,
    virtual = false,
  ) {
    const s = this.state;
    s.hazards.push({
      id: ++s.serial,
      kind,
      owner: s.current,
      needs,
      rounds,
      waiting: this.order(s.current),
      born: s.turn,
      skip,
      virtual,
    });
  }
  private kill(i: number, cause: string) {
    const s = this.state,
      p = s.players[i];
    if (!p.alive) return;
    p.alive = false;
    p.deathCause = cause;
    p.deathDay = s.turn - 1;
    p.deathDate = journeyDate(p.deathDay, s.startDate);
    p.epitaph = `Here rests ${p.name}. ${cause}. The prairie remembers.`;
    s.deck.push(...p.hand);
    p.hand = [];
    s.deaths.push(i);
    const removed = s.hazards.filter(
      (h) =>
        h.owner === i &&
        !["oxen", "axle", "tongue", "wheel", "water", "grass"].includes(h.kind),
    );
    s.discarded.push(...removed.filter((h) => !h.virtual).map((h) => h.kind));
    s.hazards = s.hazards.filter((h) => !removed.includes(h));
    s.note = `${p.name} died: ${cause}.`;
    if (!this.living.length) {
      s.status = "lost";
      s.players.forEach((p) => {
        p.supplies.forEach((k) => s.shop[k]++);
        p.supplies = [];
      });
      s.deaths = [];
    }
  }
  private legacy() {
    const s = this.state;
    if (s.deaths.length && s.status === "travel" && s.phase !== "legacy") {
      s.resume = s.phase;
      s.phase = "legacy";
      s.legacyCount = 0;
    }
  }
  will(index: number, to: number) {
    const s = this.state;
    if (s.phase !== "legacy" || !s.players[to]?.alive || s.legacyCount >= 2)
      return false;
    const dead = s.players[s.deaths[0]];
    if (!dead?.supplies[index]) return false;
    s.players[to].supplies.push(dead.supplies.splice(index, 1)[0]);
    s.legacyCount++;
    return true;
  }
  closeWill() {
    const s = this.state;
    if (s.phase !== "legacy") return false;
    const dead = s.players[s.deaths.shift()!];
    dead.supplies.forEach((k) => s.shop[k]++);
    dead.supplies = [];
    s.legacyCount = 0;
    if (!s.deaths.length) {
      s.phase = s.resume;
      if (s.phase === "stack") this.finishCard();
    }
    return true;
  }
  private endTurn() {
    const s = this.state,
      ending = s.current;
    for (const h of [...s.hazards]) {
      if (!s.hazards.includes(h) || h.born === s.turn) continue;
      if (h.owner === ending && h.skip > 0) h.skip--;
      if (h.rounds !== null) {
        h.waiting = h.waiting.filter((i) => i !== ending && s.players[i].alive);
        if (!h.waiting.length) {
          h.rounds--;
          if (h.rounds <= 0) {
            s.hazards = s.hazards.filter((x) => x !== h);
            if (!h.virtual) s.discarded.push(h.kind);
            if (h.kind === "arm") continue;
            if (["oxen", "axle", "tongue", "wheel"].includes(h.kind)) {
              s.status = "lost";
              s.note = `The wagon cannot continue: ${titles[h.kind].toLowerCase()} went unremedied.`;
            } else this.kill(h.owner, titles[h.kind]);
          } else h.waiting = this.order(h.owner);
        }
      }
    }
    s.used = 0;
    s.turn++;
    if (this.living.length) {
      let next = (ending + 1) % s.players.length;
      while (!s.players[next].alive) next = (next + 1) % s.players.length;
      s.current = next;
    }
    this.legacy();
  }
  private finishCard() {
    const s = this.state;
    if (s.status !== "travel") return;
    s.phase = "turn";
    this.endTurn();
    if (s.count === 50 && s.status === "travel") {
      s.status = "won";
      s.note =
        "Willamette Valley at last. One survivor means a victory for everyone. Put the kettle on.";
    }
  }
  draw() {
    const s = this.state;
    if (
      s.phase !== "turn" ||
      s.used ||
      s.status !== "travel" ||
      this.skips ||
      this.hasTrail
    )
      return false;
    if (!s.deck.length) {
      // Keep the current connection physical; earlier visits remain immutable in the timeline.
      const reports = (s.trailReports ??= {});
      s.run.forEach((c, i) => {
        const step = c.journeyStep ?? s.count - s.run.length + i + 1;
        const report = (reports[step] ??= {
          title: label(c),
          losses: 0,
          gains: {},
          deaths: [],
        });
        report.card ??= { ...c, journeyStep: step };
      });
      const recycled = s.run.splice(0, Math.max(0, s.run.length - 1));
      s.deck = this.shuffle(recycled);
    }
    if (s.deck.length) {
      this.player.hand.push(s.deck.shift()!);
      s.note = `${this.player.name} drew one trail card. It must wait until their next turn.`;
    } else s.note = "No trail cards to draw. Pass the wagon.";
    this.endTurn();
    return true;
  }
  skip() {
    if (!["turn", "river"].includes(this.state.phase) || !this.skips)
      return false;
    this.state.note = `${this.player.name} rests this turn. The wagon politely carries on.`;
    this.endTurn();
    return true;
  }
  endSupplies() {
    if (this.state.phase !== "turn" || !this.state.used) return false;
    this.endTurn();
    return true;
  }
  cure(hazardId: number, supply: Supply) {
    const s = this.state,
      h = s.hazards.find((h) => h.id === hazardId),
      i = this.player.supplies.indexOf(supply);
    if (
      s.phase !== "turn" ||
      s.status !== "travel" ||
      this.skips ||
      s.used >= (this.living.length === 2 ? 2 : 1) ||
      !h ||
      !h.needs[supply] ||
      i < 0
    )
      return false;
    this.player.supplies.splice(i, 1);
    s.shop[supply]++;
    h.needs[supply]!--;
    s.used++;
    s.note = `${this.player.name} offered ${names[supply].toLowerCase()}.`;
    if (Object.values(h.needs).every((n) => n === 0)) {
      s.hazards = s.hazards.filter((x) => x !== h);
      if (!h.virtual) s.discarded.push(h.kind);
      s.note += ` ${titles[h.kind]} is remedied.`;
    }
    if (s.used >= (this.living.length === 2 ? 2 : 1)) this.endTurn();
    return true;
  }
  trade(
    payments: { player: number; index: number }[],
    supply: Supply,
    recipient: number,
  ) {
    const s = this.state;
    if (
      !s.started ||
      s.status !== "travel" ||
      s.phase === "legacy" ||
      s.phase === "discard" ||
      !s.players[recipient]?.alive ||
      payments.length !== 2 ||
      !s.shop[supply] ||
      new Set(payments.map((p) => `${p.player}:${p.index}`)).size !== 2 ||
      payments.some(
        (p) =>
          !s.players[p.player]?.alive || !s.players[p.player].supplies[p.index],
      )
    )
      return false;
    for (const p of [...payments].sort((a, b) => b.index - a.index)) {
      const k = s.players[p.player].supplies.splice(p.index, 1)[0];
      s.shop[k]++;
    }
    s.shop[supply]--;
    s.players[recipient].supplies.push(supply);
    s.note =
      "Two supplies traded for one. The shopkeeper tips an imaginary hat.";
    return true;
  }
  takeSupply(k: Supply) {
    const s = this.state;
    if (!["town", "fort"].includes(s.phase) || !s.shop[k] || !s.take)
      return false;
    s.shop[k]--;
    this.player.supplies.push(k);
    if (--s.take === 0) this.finishCard();
    return true;
  }
  leaveShop() {
    if (!["town", "fort"].includes(this.state.phase)) return false;
    this.state.take = 0;
    this.finishCard();
    return true;
  }
  townCure(id: number) {
    const s = this.state;
    if (s.phase !== "town") return false;
    const h = s.hazards.find((h) => h.id === id);
    if (!h) return false;
    s.hazards = s.hazards.filter((x) => x !== h);
    if (!h.virtual) s.discarded.push(h.kind);
    s.note = `The town took care of ${titles[h.kind].toLowerCase()}.`;
    this.finishCard();
    return true;
  }
  cross() {
    const s = this.state;
    if (s.phase !== "river" || s.status !== "travel" || this.skips)
      return false;
    const n = this.die();
    if (n % 2 === 0) {
      s.note = "The far bank! Even the oxen look relieved.";
      this.finishCard();
    } else if (n === 1) {
      if (this.top?.deadly) {
        this.kill(s.current, "drowned crossing the river");
        if (s.status === "travel") this.endTurn();
      } else {
        this.requestDiscard("river");
      }
    } else {
      s.note = "No crossing this turn. The river remains unconvinced.";
      this.endTurn();
    }
    this.legacy();
    return true;
  }
  private requestDiscard(kind: Calamity | "river") {
    const s = this.state;
    s.pending = kind === "river" ? null : kind;
    if (!s.players.some((p) => p.alive && p.supplies.length)) {
      s.note = "No supplies remain to lose.";
      if (kind === "river") this.endTurn();
      else {
        s.discarded.push(kind);
        s.pending = null;
        this.finishCard();
      }
    } else {
      s.phase = "discard";
      this.autoDiscardSupply();
    }
  }
  autoDiscardSupply() {
    if (this.state.phase !== "discard") return false;
    const candidates = (
      this.player.supplies.length ? [this.state.current] : this.living
    ).flatMap((owner) =>
      this.state.players[owner].supplies.map((_, index) => ({ owner, index })),
    );
    if (!candidates.length) {
      const thief = this.state.pending === "thief";
      this.state.pending = null;
      this.state.note = "No supplies remain to lose.";
      if (thief) {
        this.state.discarded.push("thief");
        this.finishCard();
      } else {
        this.state.phase = "river";
        this.endTurn();
      }
      return true;
    }
    const selected = candidates[Math.floor(this.random() * candidates.length)];
    return this.discardSupply(selected.owner, selected.index);
  }
  discardSupply(owner: number, index: number) {
    const s = this.state;
    if (
      s.phase !== "discard" ||
      !s.players[owner]?.alive ||
      !s.players[owner].supplies[index] ||
      (this.player.supplies.length && owner !== s.current)
    )
      return false;
    const k = s.players[owner].supplies.splice(index, 1)[0];
    s.shop[k]++;
    const thief = s.pending === "thief";
    s.lastSupplyLoss = {
      sequence: (s.lastSupplyLoss?.sequence ?? 0) + 1,
      owner,
      supply: k,
      reason: thief ? "thief" : "river",
    };
    s.note = `${s.players[owner].name} lost ${names[k].toLowerCase()} ${thief ? "to a thief" : "in the river"}.`;
    s.pending = null;
    if (thief) {
      s.discarded.push("thief");
      this.finishCard();
    } else {
      s.phase = "river";
      this.endTurn();
    }
    return true;
  }
  repair() {
    const s = this.state;
    if (s.phase !== "repair" || !s.pending) return false;
    const k = s.pending;
    s.pending = null;
    if (this.die() < 4) this.add(k, { parts: 1 }, 1);
    else {
      s.discarded.push(k);
      s.note = "A lucky repair. The wheels have reconsidered.";
    }
    this.finishCard();
    return true;
  }
  drawCalamity() {
    const s = this.state;
    if (!s.calamities.length)
      s.calamities = this.shuffle(s.discarded.splice(0));
    const k = s.calamities.shift();
    this.onCalamity?.(k);
    if (!k) {
      s.note = "The calamity pile is empty; no new calamity.";
      this.finishCard();
      return;
    }
    s.note = `${this.player.name} faced ${titles[k].toLowerCase()}.`;
    if (["snake", "dysentery"].includes(k)) {
      s.discarded.push(k);
      this.kill(s.current, titles[k]);
      this.finishCard();
      this.legacy();
    } else if (["axle", "tongue", "wheel"].includes(k)) {
      s.pending = k;
      s.phase = "repair";
    } else if (k === "thief") this.requestDiscard(k);
    else if (k === "hunting") {
      if (this.player.supplies.includes("bullets") && s.shop.food) {
        s.shop.food--;
        this.player.supplies.push("food");
        s.note = "Hunting brought home food. Bullets stay in your supply hand.";
      } else
        s.note = "No bullets or no food in the shop: the hunt passes quietly.";
      s.discarded.push(k);
      this.finishCard();
    } else {
      if (k === "cholera" || k === "measles") {
        for (const h of s.hazards.filter((h) => h.kind === k)) {
          this.kill(h.owner, `a second ${titles[k].toLowerCase()} card`);
          s.hazards = s.hazards.filter((x) => x !== h);
        }
        if (this.player.alive)
          this.add(
            k,
            k === "cholera" ? { medicine: 2 } : { medicine: 1 },
            null,
            k === "measles" ? 1 : 0,
          );
        else s.discarded.push(k);
      } else if (k === "grass" || k === "water") {
        if (s.hazards.some((h) => h.kind === k))
          this.add("oxen", { oxen: 1 }, 1, 0, true);
        this.add(k, k === "water" ? { water: 1 } : {});
      } else if (k === "oxen") this.add(k, { oxen: 1 }, 1);
      else if (k === "arm") this.add(k, {}, 2, 2);
      else if (k === "cold") this.add(k, { clothes: 1 }, 1);
      else if (k === "typhoid") this.add(k, { water: 1, medicine: 1 }, 1);
      else if (k === "starvation") this.add(k, { food: 1 }, 2);
      this.finishCard();
      this.legacy();
    }
  }
}
export function readSave(raw: string | null): Journey | undefined {
  try {
    const s = JSON.parse(raw ?? "null");
    if (
      s?.version !== 2 ||
      !Array.isArray(s.players) ||
      s.players.length < 2 ||
      s.players.length > 6 ||
      !Number.isInteger(s.current) ||
      !s.players[s.current] ||
      !["travel", "won", "lost"].includes(s.status) ||
      ![
        "turn",
        "river",
        "repair",
        "town",
        "fort",
        "stack",
        "discard",
        "legacy",
      ].includes(s.phase) ||
      !Array.isArray(s.hazards) ||
      !Array.isArray(s.stacks) ||
      !Array.isArray(s.run) ||
      !Array.isArray(s.deck) ||
      !Array.isArray(s.calamities) ||
      !Array.isArray(s.discarded) ||
      !Array.isArray(s.deaths) ||
      !Number.isInteger(s.count) ||
      s.count < 0 ||
      s.count > 50 ||
      !Number.isInteger(s.turn) ||
      s.turn < 1 ||
      typeof s.started !== "boolean" ||
      typeof s.note !== "string"
    )
      return;
    const card = (c: TrailCard) =>
      c &&
      Number.isInteger(c.id) &&
      [0, 1, 2].includes(c.left) &&
      [0, 1, 2].includes(c.right) &&
      ["trail", "river", "calamity", "town", "fort"].includes(c.type) &&
      typeof c.rotated === "boolean";
    if (
      !s.players.every(
        (p: Player) =>
          (p.controller === undefined ||
            p.controller === "human" ||
            p.controller === "computer") &&
          typeof p.name === "string" &&
          typeof p.alive === "boolean" &&
          Array.isArray(p.hand) &&
          p.hand.every(card) &&
          Array.isArray(p.supplies) &&
          p.supplies.every((k) => k in names),
      ) ||
      ![...s.deck, ...s.run, ...s.stacks.flat()].every(card) ||
      (Object.keys(names) as Supply[]).some(
        (k) => !Number.isInteger(s.shop?.[k]) || s.shop[k] < 0,
      ) ||
      !s.hazards.every(
        (h: Hazard) =>
          h.kind in titles &&
          s.players[h.owner] &&
          Array.isArray(h.waiting) &&
          h.needs &&
          typeof h.needs === "object",
      )
    )
      return;
    return s;
  } catch {
    return;
  }
}
