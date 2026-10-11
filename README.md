# Oregon Trail Cards

A pocket-sized westward wander. Lay a little road, mind the provisions, and get your wagon to Oregon with enough spirit left for tea.

![A wagon journey in soft sage and parchment, with three illustrated trail cards](docs/preview.png)

## Play locally

```sh
npm install
npm run dev
```

Pick a card whose left connection matches the wagon's trail. Every card uses one provision; without provisions, the party loses one spirit. Rivers and mishaps offer a supply payment or a dice roll. Forts replenish provisions and offer a choice of supplies or rest. Reach Oregon after 16 cards before spirit runs out.

Journeys save automatically in this browser. A new journey starts with fresh cards and supplies.

Built with TypeScript, Vite, plain HTML/CSS, and generated, distressed-print illustrations. No accounts, remote asset dependencies, or backend. Artwork and paper texture live in `assets/`; the generation prompts are in [docs/art-prompts.md](docs/art-prompts.md). `npm test` checks the rules; `npm run build` checks types and creates the static app in `dist/`.
