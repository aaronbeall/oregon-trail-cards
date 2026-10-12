# Rules reference

This implementation uses the base **2017 Pressman Oregon Trail Card Game**, played locally by 2–6 people sharing the screen (or one person controlling the wagon party). It does not use the expansion or optional easier house rules.

Primary reference: [Pressman’s 2017 instruction sheet](https://www.buffalolib.org/sites/default/files/gaming-unplugged/inst/The%20Oregon%20Trail%20Card%20Game%20Instructions.pdf). Printed card instructions and deck composition were checked against the card scans in the [Vassal reference module](https://vassalengine.org/wiki_old/wiki/Module%3AThe_Oregon_Trail_Card_Game). Those scans are research references; the artwork in this app remains generated original illustrations. The module’s joke “Dissin’ Terry” replacement is treated as the original second Dysentery card.

## Table and turns

There are 56 playable Trail cards plus Start and Finish, 32 Calamity cards, and 26 Supply cards. Each player starts with five Trail cards; supply hands contain eight cards for two players, five for three/four, four for five, or three for six. The remaining supplies form the shop. Select the player born nearest Willamette Valley to start; the app handles shopkeeping.

A turn plays one connected Trail card or supplies to remedy an active calamity. There is no replacement draw after playing. If no trail fits, including after rotating, a player may draw one card and end their turn. Remedies are optional; the party may elect to leave a calamity unresolved. One Supply card may be played per turn, except with exactly two survivors, when up to two may be played. Two-for-one shop trades do not consume a turn; two players can contribute one supply each and choose the recipient together.

The road must meet at the card edges without sliding. Rotating 180 degrees flips both ends and their positions. Towns and Forts accept any road, and any road may follow them. A Town grants one available supply **or** removes one active calamity; a Fort grants two available supplies.

The trail continues from the last card played, without piles or five-card milestones. Earlier cards recycle when the draw deck is empty, while their visits and outcomes remain visible. Fifty travelled cards reach Oregon; at least one survivor means everyone wins.

## Rivers and calamities

An even roll fords a river. Failed attempts pass to the next survivor without adding a Trail card. The 2017 sheet explicitly says 3/5 do nothing on a supply-loss river; 1 loses a supply. A drowning river kills the player on 1. A player obliged to sit out passes the attempt without rolling.

Spacebar-marked Trail cards draw Calamities. The drawer is affected unless the card concerns the entire wagon. A timed round starts with the next living player and ends after the drawer’s next turn, giving the drawer a final opportunity to remedy it. Death removes a player from future turn order.

| Calamity | Printed effect implemented |
| --- | --- |
| Broken axle, tongue, wheel | Roll 4–6 for immediate repair; otherwise one spare part within one round. Trail play stops; missing the deadline loses the party. |
| Dead oxen | One oxen supply within one round; trail play stops and the missed deadline loses the party. |
| Bad water | One clean water. A second active card kills the oxen, starting an oxen replacement deadline. |
| Inadequate grass | Only a Town removes it. A second active card kills the oxen, starting an oxen replacement deadline. |
| Cholera | Two medicine; a second active card kills the previously afflicted player. |
| Measles | Miss one turn unless cured with medicine; a second active card kills the previously afflicted player. |
| Broken arm | Sit out two rounds, then recover. |
| Extreme cold | Clothes within one round or the afflicted player dies. |
| Typhoid | Clean water AND medicine within one round or the afflicted player dies. |
| Starvation | Food within two rounds or the afflicted player dies. |
| Thief | Lose one supply. |
| Hunting | Having bullets grants one available Food card; the printed card does not instruct spending the bullets. |
| Snakebite, Dysentery | Immediate death. |

Supply remedies return supplies to the shop. Partial multi-card remedies remain outstanding. If a player must lose a supply but has none, they select another player’s hidden card without viewing or discussing it. Death allows up to two supplies to be willed to survivors; remaining supplies return to the shop, and the deceased’s Trail cards go to the bottom of the draw pile. Epitaphs can be edited.

## Edition differences and digital conventions

The 2017 rule sheet takes precedence over older printed text: notably the two-player supply deal, the 3/5 river clarification, and Town-only removal of Inadequate Grass. Duplicate grass/water cards remain active after killing the oxen; the resulting replacement requirement is displayed as a separate wagon calamity rather than taking a physical Dead Oxen card from the draw pile.

The rule sheet does not specify what to do if all 32 Calamity cards are exhausted. This app reshuffles remedied/discarded calamities; if none are available, that draw has no effect. This is an explicit digital fallback, not a published rule. Town/Fort supply picks may be declined when the shop cannot provide what the player wants. All effects of the fiftieth card resolve before winning. On-screen hands show only the current player’s supplies; players sharing the device must respect that information boundary themselves.

The previous solo “16 cards / party spirit / automatic provisions” save format is incompatible and is not loaded. The corrected game saves under a separate browser key.

The digital trail is continuous: every card connects to the last card played. Five-card piles and milestones are omitted. Earlier physical cards recycle when the deck is empty; immutable visit snapshots keep the complete trail visible.
