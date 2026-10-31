# HANDOFF — Elemental Battle: Merge Arena

> Relatório de continuidade do projeto. Escritado a partir da **inspeção direta do
> código em 31/out/2026**, não de memória de conversa. Uma nova sessão de
> desenvolvimento deve conseguir continuar este trabalho lendo só este arquivo.
>
> **Estado da árvore no momento deste relatório (verificado):**
> `npx tsc --noEmit` OK · `npx vitest run` **157 testes / 14 arquivos, todos verdes** ·
> `npm run build` OK (aviso de chunk-size do three, inofensivo).
> ✅ Agora **versionado em git**: repo público `brunon80/element-merge` (SSH),
> branch `main`. **CI/CD**: todo push na `main` roda o workflow
> `.github/workflows/deploy.yml` (Actions → build → GitHub Pages em
> https://brunon80.github.io/element-merge/). O `vite.config.ts` novo fixa
> `base: '/element-merge/'` para os assets do subcaminho.

> ## ⚡ ATUALIZAÇÃO — árvore elemental Nv.1–10 + modo debug (sessão atual)
>
> Os §§2–9 abaixo descrevem o estado **antigo** (5 níveis, 6 híbridos Nv.1). O
> estado vigente é este (commit `fdea59a` + o seguinte do modo debug):
>
> - **Fusões (regra nova, única fonte `fusionRules.ts`):** verticais 2×Ln→1×L(n+1)
>   para as 4 puras **até Nv.5** (L5+L5 de puro é bloqueada); fusões cross-species
>   **só a partir do Nv.5**, exigindo os ingredientes exatamente no nível que a
>   receita pede. **19 receitas fixas** (Nv.6–10) em `data/fusionRecipes.ts`,
>   ordem irrelevante, sempre 2→1, gratuitas; **nada acima do Nv.10** (`MAX_LEVEL`).
>   Rejeições: `DIFFERENT_LEVEL / MIN_LEVEL / INCOMPATIBLE_SPECIES / MAX_LEVEL`.
> - **19 espécies novas de nível fixo único:** magma, gelo, madeira, raio, vapor,
>   areia (Nv.6) · tempestade, obsidiana, pantano, âmbar, névoa (Nv.7) · plasma,
>   cristal, abissal, vulcão (Nv.8) · astral, geodo, maré, lâmina (Nv.9) ·
>   **primordial** (Nv.10, coroa). Os 6 híbridos antigos foram **removidos**; o
>   save **v3** migra (vulcane→magma, tempest→gelo, verdan→madeira, solaris→raio,
>   vaporis→vapor, duna→areia) com reembolso das unidades retidas antigas.
> - **Descoberta:** espécie inédita aparece no bestiário como **silhueta escura +
>   "???" + nível** (sem nome/stats/receita); a primeira fusão abre o
>   `DiscoveryOverlay` (especial para o Nv.10) e grava no save permanentemente;
>   durante o arraste o resultado oculto aparece como "??? Nv.X" no slot.
>   Progresso `X/19` no topo do bestiário.
> - **Habilidades novas** (`combat/status.ts` + engine): `poison` (DoT com elemento
>   próprio — `StatusTickDamage`), `regen` (madeira), `drain` (abissal cura ao
>   causar dano), `chain` em projéteis (`chainLeft`, tempestade/raio). FX épicos
>   do primordial Nv.10.
> - **IA honesta:** `fusionPlan.ts` prova composabilidade (toda criatura da árvore
>   custa `2^(nv-1)` sementes de 100 moedas); `TEAM_RULES` ganhou
>   `treeMaxLevel` (easy 0 / normal 7 / hard 10) e `hybridChance` (0/0.3/0.6).
>   `sellValue = 100·2^(nv-1)` vale para **todas** as espécies até Nv.10.
> - **Modo debug** (novo): Configurações → **Depuração → "Modo debug"** liga um
>   botão **"Criar no campo"** em todo card do bestiário (inclusive selados), que
>   usa `engine.addRetainedUnit` para colocar a espécie no primeiro slot livre do
>   jogador — grátis, sem fusão, sem descoberta, **só na preparação**; o bestiário
>   fecha sozinho para ver a criatura na arena. Puros têm seletor de forma
>   Nv.1–5 (na linha de botões do card e nos chips do MonsterViewer, roxo quando
>   controlado). A flag persiste em `save.settings.debugMode`. Criaturas criadas
>   assim voltam com o `retainedRoster` se sobreviverem ao combate.
> - Testes novos: `plan.test.ts`, cadeia completa Nv.1→Nv.10 em `fusion.test.ts`
>   (512 sementes, recursão determinística `growTo`), migração de save v2→v3 em
>   `economy.test.ts`, habilidades em `combat.test.ts`, 6 testes de modo debug em
>   `ui.test.tsx`. Total: **157 testes**.

---

## 1. Arquitetura e tecnologias

- **Stack:** React 18 + Vite 5 + TypeScript 5.6 estrito; 3D com **three.js r169**
  via **@react-three/fiber 8** e **@react-three/drei 9**; estado com **zustand 4**.
  Testes: **Vitest 2 + Testing Library** (ambiente jsdom; `vitest.config.ts` tem o
  plugin react e `src/tests/setup.ts`).
- **Arquitetura em camadas (regra do projeto):**
  1. `src/game/` e `src/data/` — **motor e regras puros, sem React/three**
     (importar three.js ali é proibido; a engine guarda posições como `[x,y,z]`).
  2. `src/store/gameStore.ts` — zustand; espelho discreto da UI (`UiUnit`), drag &
     drop, toasts; a instância do `GameEngine` vive **fora** do estado React
     (singleton `getEngine()`), mutado a cada frame.
  3. `src/scene/` — renderização R3F; lê o mundo da engine diretamente nos
     `useFrame` (mutação imperativa de meshes/pools, sem re-render React).
  4. `src/components/` — HUD/loja/painéis em DOM sobreposto (`src/styles.css`).
- **Loop:** `src/hooks/useGameDriver.ts` → requestAnimationFrame com `dt` limitado
  a 0,05s; `engine.update(dt)`; `syncUi()` ~8×/s; efeitos visuais consomem
  `engine.drainFx()` (fila de `FxEvent`).
- **Sem vite.config.ts na raiz** — Vite usa padrões; JSX automático vem do
  `tsconfig` (`"jsx": "react-jsx"`). Funciona; HMR do Vite **preserva
  `useMemo` de materiais three** ao editar shaders/cores (ver armadilhas no §4).
- ~13.600 linhas de código (src completo, incluindo testes).

## 2. Funcionalidades completas e funcionando

- **Partida completa:** menu → preparação (montar time sem cronômetro) → combate
  em tempo real → vitória/derrota/empate (tela de resultado com recompensa e
  botão de revanche) → volta ao menu. Fluxo coberto por testes (`fullMatch`, `ui`).
- **Invocação:** loja vende só os 4 puros a preço fixo de 100 moedas; placement
  em slot livre do lado do jogador.
- **Fusões** (regra fixa, única fonte `game/fusion/fusionRules.ts`): 2×Ln → 1×L(n+1)
  até L5, L5+L5 bloqueada; híbrido só de 2 puros L1 de elementos diferentes
  (6 receitas fixas em `data/fusionRecipes.ts`); gratuitas; **par-a-par** (nunca
  fusão tripla implícita). Fusão **somente arrastando uma criatura sobre a outra
  na arena 3D** (caminho único; UI não tem botão de fusão).
- **Arraste na arena 3D:** ponteiro → raio no plano `y=0.28` (`BattleScene`) →
  `tileFromWorld`; destaque de destino completo em `scene/DropSpot.tsx` (disco,
  anel tracejado, colchetes, feixe, faíscas de fusão, X vermelho de inválido);
  limites de arraste derivados de `PLATFORM` (fica na própria metade da ilha).
- **Venda (Lixeira):** arrastar criatura sobre o painel `[data-sell-target]`
  vende e devolve o **custo acumulado** (`economy.sellValue`: Nv1=100 … Nv5=1600,
  híbrido = 2× o do nível).
- **Combate:** projéteis homing lógicos, resistências elementais, status burn/slow,
  abilities splash/pierce/chain/doubleShot/swift/heavy, kill/respawn-free,
  fim de combate por extermínio ou estouro de tempo (vitória por fração de vida).
- **IA inimiga:** sem decisão em tempo real — exército montado no `startBattle`
  por `game/ai/teamComposer.ts` (orçamento = coeff×valor do time do jogador,
  níveis-híbridos-contra-escolha-posição por dificuldade).
- **Economia fixa:** 100/invocação; +100 vitória, +50 derrota/empate; uma
  recompensa por `matchId` (ledger `processedMatchIds`); saldo nunca negativo.
- **Persistência (localStorage `elemental-merge-save-v1`, v2):** moedas, espécies
  descobertas, **time sobrevivente volta de graça para a próxima partida**
  (`retainedRoster`), configurações (dificuldade, saldo inicial), estatísticas,
  `lastSummary`; load defensivo com migração/correção de campos.
- **Progressão visual por elemento (rigs próprios + rig procedural por nível):**
  fogo (ignis), vento (zephyr), terra (golem) e água (nereia) — cada um com
  shader próprio e **5 formas visíveis** (faísca→dragão, sopro→tornado,
  penedo→montanha muscular, gotinha→tsunami) com nomes/alturas em
  `SpeciesDef.formTops/formNames` e partes gateadas por `minLvl/maxLvl` em
  `scene/speciesModels.ts`. Os quatro foram **aprovados visualmente pelo usuário**
  na rodada iterativa com screenshots (fogo, vento, terra, água; a água foi a
  última aprovada após migrar para material opaco — ver §5).
- **Arena:** ilha flutuante com plataformas derivadas das constantes de
  `game/board.ts`; obeliscos elementais, cristais flutuantes, estrelas/motes,
  névoa; câmera orbital **livre em 360°** (nova nesta sessão).
- **Testes: 129** em 13 arquivos (motor, economia, fusão, IA, combate, venda,
  partida completa, UI com RTL, 4 testes de progressão de formas por elemento +
  board). `src/tests/helpers.ts` tem `partsEnvelope` (Box3 real das peças).

## 3. Funcionalidades parcialmente implementadas

- **Híbridos sem rig/progressão visual:** só os 4 puros têm rig próprio
  (`SPECIES_RIGS` em `scene/speciesRigs.ts`); vulcane/tempest/verdan/solaris/
  vaporis/duna usam o **rig genérico de peças** (sem `formTops` → mesma silhueta
  em todos os níveis). É o próximo grande bloco de trabalho visual.
- **Reforço dos efeitos de ataque (golem/zéfiro/água) — implementado mas sem
  validação visual final:** os ramos de impacto por espécie existem em
  `Effects.tsx` (linhas ~357–410: ignis chama, golem pedras+anéis de peso,
  zephyr faíscas geladas, nereia fonte azul), projéteis assinados em
  `ProjectileField.tsx` (gota de fogo, dodecaedro de pedra que tomba com material
  da pedra, torque de vento, gota d'água) e rastros por espécie em
  `FlameTrail.tsx` (`TRAILS`). O usuário pediu o reforço e ainda **não mandou os
  screenshots** pedindo calibragem.
- **Bestiário/enciclopédia:** existe e lista espécies + receitas, mas mostra
  apenas um modelo representativo (MonsterViewer) — não percorre as 5 formas.
- **Movimento de criaturas:** `moveUnit` funciona, mas todas as espécies têm
  `moveSpeed: 0` (jogo é de posicionamento fixo por design atual).

## 4. Problemas conhecidos e bugs pendentes

1. **Anéis de impacto no chão provavelmente invisíveis sobre as plataformas**
   (suspeita forte, não confirmada visualmente): `spawnRing(x, 0.1|0.16, z)` em
   `Effects.tsx` e o `floor = 0.1 + 0.1·size` dos estilhaços de pedra quicam
   **abaixo do topo da plataforma** (que é `UNIT_BASE_Y = 0.28`); os anéis têm
   `depthTest` ligado → ficam dentro da caixa da plataforma. Provável correção:
   usar `UNIT_BASE_Y + 0.02` (ou `depthTest={false}`). Confirmar com screenshot.
2. **Teste flaky de timing do HUD:** `ui.test.tsx > "Tempo persistido entre
   partidas" > "time persistido sobrevive ao 'recarregar' a página"` falha de
   vez em quando no suite completo (passa isolado 3/3 e na 2ª rodada). Causa
   provável: sincronização de `syncUi` a cada 0,14s de relógio real. Se irritar,
   fragilizar a asserção de tempo ou usar relógio falso.
3. **HMR engana ao mexer em materiais/shaders:** `useMemo` do R3F preserva o
   material antigo ao editar só as cores/GLSL — **reiniciar o servidor de dev ou
   Ctrl+Shift+R** antes de concluir que "a mudança não funcionou". (Dica que já
   economizou várias rodadas nesta sessão.)
4. **GLSL silencioso:** vírgula final antes de `)` quebra a compilação do shader
   e a mesh **some** (não há erro no console). Sempre escanear GLSL editado; o
   script auxiliar ficava em `%TEMP%\opencode\glslscan.cjs` (pode ter sumido —
   recriar se necessário).
5. **Sprites sem `map` viram quadrados sólidos** — bug clássico já enfrentado
   (o "quadrado azul" da água). Todo `<sprite>` precisa de `map`.
6. **Rig de água é opaco e autoiluminado** (ver §5): se alguém voltar a mexer no
   alpha, o jogo entra em loop de "fantasma branco" — não reabrir translucidez
   para o corpo da criatura sem um motivo muito forte.

## 5. Decisões técnicas e de design (com rationale)

- **Regras de jogo 100% determinísticas e puras** em `src/game` + catálogo de
  dados em `src/data`; UI/3D nunca decidem gameplay. (Testes sem React/three.)
- **Engine mutável fora do React**; zustand só espelha o discreto. Decisão forte:
  posições/projéteis **não** vão para estado React.
- **Economia travada em valores fixos de design** (100/100/50), fusões grátis,
  recompensa idempotente por `matchId`, venda devolve só o investido.
- **IA por composição de exército no início do combate** (não micro em tempo real);
  budget baseado no **custo de reposição 2→1** — o mesmo número que a lixeira
  devolve (`sellValue` é a moeda de valor do jogo).
- **Formas por nível = dado da espécie** (`formTops/formNames` + `data/forms.ts`):
  o motor usa para altura de cano (`formMuzzleY`) e mira (`formAimY`); a cena usa
  para o envelope das peças; testes de progressão amarram isso (envelope via
  `partsEnvelope`, `halfX < TILE_SPACING_X`, `maxZ ≤ 2·ROW_DEPTH`).
- **Tabuleiro maior (nesta sessão, último commit lógico):** `TILE_SPACING_X 2.3→3.2`,
  `ROW_DEPTH 1.5→2.3`, `FRONT_ROW_Z 2.2→2.5` — espaço para monstros Nv5. O teto
  de `FRONT_ROW_Z` é **2.5**, senão o teste do menor alcance (golem `range: 8`)
  quebra: exige `range ≥ 2·FRONT_ROW_Z + 3`. Plataformas/ilha/arraste/obeliscos
  recalculam sozinhos a partir dessas constantes.
- **Câmera orbital livre em 360° de azimute** (usuário queria ver a frente dos
  monstros); polar limitado 0.35–1.32 para não passar por baixo da ilha; distância
  10–34; enquadramento inicial recuado (`App.tsx` camera/fog ajustados).
- **Material de água OPACO no figurino do material de pedra** (decisão da sessão,
  aprovada pelo usuário: "agora ficou bem melhor"): corpo azul sólido (marinho
  `#123a66`→azure `#4db4ff`), **ondas brancas descendo de cima para baixo**
  (banda `fall = fract(vG·2.3 + uTime·0.5…)`), espuma no cume, iluminação fake da
  arena (`ARENA_LIGHT`/`TEAM_TINT` emprestados de `stoneShaders.ts`),
  `transparent:false, FrontSide, depthWrite:true`. Toda a saga translúcida
  (alpha/empilhamento/color-space) foi abandonada em favor desse figurino.
  **Regra prática derivada:** elementos grandes/legíveis = albedo opaco + fake
  lighting; translúcido só para partículas/efeitos.
- **Pipeline de cor:** `new THREE.Color(hex)` lineariza e os ShaderMaterials
  escrevem cru no framebuffer — os hex dos catálogos (ex.: `WATER_ROLE_LOOK`) já
  são escolhidos compensando esse desvio. Não "corrigir" para sRGB cru sem
  mudar todos os rigs juntos.
- **Vento é branco** (nuvem), não azul — pedido explícito do usuário; a paleta
  azul é só da água.

## 6. Componentes principais

- `src/app/App.tsx` — shell: `<Canvas>` (camera `[0,14.2,19.5]`, fog 30–80) + DOM;
  telas menu/jogo; usa `useGameDriver()`.
- `src/store/gameStore.ts` — único ponto de integração engine↔React: eventos do
  motor → toasts/descobertas/finishMatch (recompensa idempotente, retainedRoster);
  ações de drag (`beginDragCandidate`→`tryPromoteDrag`→`hoverWorld`→`endDrag`),
  venda via `sellHover` (lixeira DOM detectada por `elementFromPoint`).
- `src/scene/BattleScene.tsx` — monta Lighting/Arena/Effects/FlameTrail/
  ProjectileField/DropSpot/UnitViews + raycast de arraste; `key={matchId}`
  remontou a cena a cada partida.
- `src/scene/UnitView.tsx` — por unidade: rig, barra de vida billboard, animação
  de spawn/morte/fusão, drag 3D (limites da própria metade).
- `src/scene/speciesRigs.ts` — registro `SPECIES_RIGS` (ignis→FlameRig,
  zephyr→WindRig, golem→StoneRig, nereia→WaterRig); ausente = rig de peças
  genérico (usado pelos híbridos).
- `src/scene/speciesModels.ts` — `Part` (geo, role, `minLvl/maxLvl`, `lv()`/`mm()`),
  `MODELS` por espécie/nível, `VISUALS` (cores do catálogo), `MatRole`
  (body/dark/glow/accent/trans/...); rigs leem `partsForLevel`.
- Shaders/materials: `flameShaders` (fogo + `NOISE_GLSL`), `windShaders` (seda
  translúcida com spin diferencial — aprovada, **não mexer sem motivo**),
  `stoneShaders` (pedra opaca + `ARENA_LIGHT`/`TEAM_TINT` — figurino modelo),
  `waterShaders` (água opaca + ondas). Rig de água/vento/pedra/fogo = um arquivo
  .tsx cada.
- `src/scene/Effects.tsx` — pools: fagulhas, sprites de status, **anéis**, raios
  (chain), bursts de chama, **estilhaços de pedra** (SHARD_CAP, física CPU com
  gravidade/quique/tumble com material de pedra); ramos de impacto por espécie.
- `src/scene/ProjectileField.tsx` — projéteis instanciados com `aSeed` por
  espécie (assinaturas) + halos que crescem com o nível; híbridos = mesh básica.
- `src/components/*` — HUD (fase/coins/timer), ShopPanel (4 puros + Lixeira),
  InspectorPanel (unidade selecionada), BattleControls (Iniciar Combate),
  Bestiary (enciclopédia com viewer 3D próprio — `MonsterViewer.tsx`),
  SettingsMenu (dificuldade, saldo inicial, reset), ResultScreen, ToastLayer.

## 7. Monstros, níveis e fusões (estado atual dos dados)

- 4 puros: **ignis** (burn, range 9,5), **nereia** (slow, range 10,5), **golem**
  (heavy, range **8** — o mais curto, trava o layout), **zephyr** (swift, ps 14).
- 6 híbridos (todos com `formTops` ausente → sem progressão visual): vulcane
  (splash+burn), tempest (chain+slow, farthest), verdan (splash+slow, tanque),
  solaris (pierce+burn, farthest), vaporis (splash+burn+slow), duna
  (doubleShot, farthest).
- Todos os 4 puros têm 5 formas nomeadas (ver `monsters.ts`); nereia:
  gotinha/gota viva/ondina/cavalo de onda/tsunami (tops 1,4→4,3).
- Nível: 1..5; `scaledStats` (balance.ts): hp/dmg ×2,15^p, range +0,4·p,
  interval ×0,94^p, ps ×1,12^p, reload ×0,9^p (mín 0,2).
- Fusões: §2. Descobrir um híbrido registra a espécie na enciclopédia e mostra
  toast; híbrido Nv1 é o único ponto de entrada para híbrido.

## 8. Combate e IA

- Tick da engine em `combatTick`: cooldowns/reload, `pickTarget` (closest/
  farthest/lowestHp/backmost; só alvo **vivo e dentro de `range`** — fora do
  alcance a unidade não ataca), disparo com `formMuzzleY` (altura cresce com a
  forma), `doubleShot` com delay 0,3s, projéteis homing (`HIT_RADIUS 0,85`,
  aimY do alvo segue a forma), acerto resolve resistências (`damage.ts`) +
  splash/pierce/chain + status (`status.ts`: burn dps fracionado, slow multiplica
  interval).
- Morte: `diedAt` + `DEATH_ANIMATION_WINDOW 0,9s` até `purgeCorpses` (a cena faz
  fade/alfa). Fusão: `MERGE_ANIMATION_WINDOW 0,5s` (mergeStart→mergeDone).
- Fim: extermínio, ou `MAX_BATTLE_TIME 160s` → fração de vida (vitória/derrota)
  com empate se muito próximos (`checkEndConditions`/`healthFraction`). Começar
  combate com um lado vazio resolve por w.o.
- IA inimiga: `teamComposer` determinístico por seed; `TEAM_RULES` easy/normal/
  hard (coeff 0,6/1,0/1,4; maxLevel 2/3/4; híbridos 0/35%/65%; normal+ hard:
  counter-pick por fraquezas e tanques na frente); orçamento = coeff × soma de
  `sellValue`. Dificuldade pode ser trocada **durante** a partida (afeta o
  exército no próximo `startBattle`/revanche).

## 9. Economia e persistência

- Ver §2/§5. Números fixos: `SUMMON_COST 100`, +100/+50, `sellValue` = 100·2^(nv-1)
  (híbrido ×2), `DEFAULT_STARTING_COINS 500` (configurável nas settings,
  múltiplos de 100).
- Save: chave `elemental-merge-save-v1`, `SAVE_VERSION 2` (retainedRoster),
  processado defensivamente no load; `processedMatchIds` limita a 50;
  `resetProgress` preserva settings.
- Regras de UI: abandonar partida em andamento só persiste o saldo gasto;
  sobreviventes do player voltam na próxima (até 12).

## 10. Próximas tarefas (por prioridade)

1. **Validar visualmente os ataques reforçados** (golem e zéfiro principalmente):
   pedir ao usuário screenshots de Nv4/Nv5 acertando inimigo (projétil em voo +
   impacto) e calibrar tamanho/brilho de estilhaços, faíscas e anéis.
2. **Corrigir/confirmar os anéis e estilhaços abaixo do topo da plataforma**
   (§4 item 1) — mexer em `Effects.tsx` (y dos `spawnRing` de chão e `floor` dos
   shards → derivar de `UNIT_BASE_Y`).
3. **Rigs e formas dos 6 híbridos** (última grande lacuna visual; o usuário
   trabalha elemento a elemento com aprovação por screenshot — perguntar qual
   híbrido primeiro; usar o figurino opaco modelo).
4. ~~Init git + commit inicial~~ — **feito**: repo público `brunon80/element-merge`,
   CI de Pages no push da `main` (workflows em `.github/workflows/deploy.yml`).
5. Opções de calibragem fina pendentes (só se o usuário pedir): tom azul da água
   (agora `#123a66`→`#4db4ff` com ondas brancas `#eaf6ff`), velocidade das ondas,
   tuning de balanceamento pós-arena-maior (projéteis cruzam corredor de 5,0).
6. Opcional: bestiário percorrer as 5 formas; matar o flaky do HUD (§4 item 2).

## Comandos de verificação (rodar SEMPRE após mudanças)

```
npx tsc --noEmit          # tipos
npx vitest run            # 157 testes, 14 arquivos
npm run build             # tsc + build de produção
npm run dev               # http://localhost:5173 (HMR; hard refresh ao mexer shaders)
```

## Notas de estilo/idioma

- UI e comentários em **PT-BR**; reportar ao usuário em PT-BR.
- O usuário valida visuais por **screenshots** e itera rápido ("não se preocupe
  em errar, vamos experimentando"); validação WebGL é impossível em testes
  (jsdom) — nunca "aprovar" um visual sem screenshot do usuário.
- Constantes do tabuleiro atuais: `TILE_SPACING_X 3,2 · ROW_DEPTH 2,3 ·
  FRONT_ROW_Z 2,5 · UNIT_BASE_Y 0,28 · BOARD_COLS 4×3 linhas · 12 slots/lado`.
