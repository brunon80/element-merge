# HANDOFF — Elemental Battle: Merge Arena

> Estado verificado em **01/nov/2026** por inspeção direta + suíte rodando:
> `npx tsc --noEmit` OK · `npx vitest run` **246 testes / 25 arquivos, todos
> verdes** · `npm run build` OK · git limpo em `main` (repo público
> `brunon80/element-merge`, CI → GitHub Pages).

---

## 🎯 TAREFA ATIVA — melhoria visual da árvore elemental (o loop em andamento)

Dar a cada espécie da árvore um **figurino próprio** (modelo denso + rig animado
+ projétil-assinatura + FX de impacto), no padrão dos puros/golém, com laço de
QA por screenshots (Playwright) e **um commit+push por monstro**.

**Ordem combinada e estado:**

| Espécie | Nv | Status |
|---|---|---|
| raio, madeira, magma, gelo, vapor, areia | 6 | ✅ figurino próprio + testes |
| tempestade, obsidiana, pantano, plasma, **névoa** | 7 | ✅ figurino próprio + testes |
| **cristal** | 7 | ⬜ pendente (rig genérico) |
| cósmico, geodo, abissal, vulcânico | 8 | ⬜ pendente |
| astral, colosso | 9 | ⬜ pendente |
| **primordial** | 10 | ⬜ pendente — pedido especial do usuário: **buraco negro
  com disco de acreção, grande, ataque em rajada de energia** |

**Último monstro melhorado: NÉVOA (Nv.7 — "espectro da bruma": planta os pés
numa POÇA de geada opaca, TÚNICA de cinco cascas de lathe (36×48) com aro plano
da barra rasgada, capuz com máscara de gelo-ardósia e olhos fendados, coroa de
icicles plantada no véu, garras de bruma; ataque = ASPIRA FUNDO e SOLTA O BAFO
(pluma de névoa fria com semente de geada; splash 2,4 + slow 0,5)) — commit
mais recente de `main` (`git log -1`).** Anterior: plasma `9d7a881`.

**Próximo: CRISTAL (Nv.7, água+terra+ar, "prisma vivo" — estilhaços que
encadeiam: `chain`)**, depois na ordem da tabela.

### Regras do loop (valem para cada monstro)

1. Refinar o modelo/rig; **rodar `node qa/inspect-species.mjs <especie> [aliada]`**
   (dev server em 5173) e OLHAR os prints; iterar até a aparência ficar boa e o
   console limpo ("SEM ERROS/WARNINGS" = GLSL compila). Console do navegador é
   o verificador de shader; jsdom não compila GLSL.
2. **Teste de pino só depois de aprovado visualmente.** Ao terminar o monstro,
   escrever `src/tests/<especie>Progression.test.ts` com ~10 pinos (silhueta,
   anti low-poly, invólucro, materiais, paleta única motor↔rig↔proj↔FX,
   coreografia exportada, eventos do motor) e rodar `tsc + vitest + build`.
3. Commit + push (mensagem no padrão dos anteriores: "<Monstro>: <conceito>").
   Atualizar esta tabela de status no mesmo commit.
4. **NADA low-poly** (regra de projeto amarrada em teste):
   - poliedro com `amp` (deslocamento) exige subdivisão ≥1 (ideal 2–3);
   - tambor/cilindro com `amp` ≥16 radiais × ≥4 anéis verticais;
   - toros ≥12 tubulares × ≥30 radiais; lathe ≥1700 verts em peças grandes;
   - malha de peça com relevo: ≥10 radiais, ≥4 verticais (corte longo do golem).
5. Silhueta plantada com raiz no tabuleiro é o padrão das espécies pesadas;
   voadoras (com `floatY`) são exceção justificada (a Névoa, mesmo espectro, é
   PLANTADA na poça de geada — `floatY: 0`; decidir por espécie).
6. Invólucro amarrado: halfX < 2,6 · maxZ ≤ 2·ROW_DEPTH · minY ≥ −0,1 ·
   maxY ≤ formTop + 0,25 (ver `partsEnvelope` em `tests/helpers.ts`).

### Lições visuais consolidadas (não re-aprender na prática)

- Legibilidade = **albedo OPACO + ARENA_LIGHT fake**; aditivo só em arcos/
  plasma/partículas. Translúcido só para véus/fumaça; nuvem translúcida **nunca**
  usa tint da equipe (steamShaders nem tem `uTeamColor`).
- Ruído em frequência FIXA estica em peça grande → `uCrackScale` por porte;
  veio de pedra/gelo é **trama curta e densa** (crackScale alto = traço curto;
  baixo = zigue-zague de raio largo), glow contido (≤ ~0.5 corpo).
- `uJitter` de arco (ARC_VERT) é em **unidades de mundo**: jitter ≤ raio do
  tubo (0,03–0,2). ⚠️ pendência: `LightningRig` (corpo do Raio) segue com
  jitter 0,9–1,6 em tubos 0,035 — corrigir na passada de revisão do Raio.
- Flash de dano: `mix(vec3(1.0), col, 1 - uHurt·k)` (o bug histórico do vento
  usava `uHurt·0.45` sem o `1 -`). Em criatura escura/tanque, migrar feedback
  p/ brasa/veios e cortar `uHurt` do albedo (×0,25–0,3).
- Points: clamp `min(90.0, size*(28/-z))` em TODO rig (senão envelope fantasma
  rente à câmera).
- Peça rente ao chão não pode ser espelho (envMix baixo); anel de chão nunca
  tint da equipe; plasma em criatura = miúdo + `uAlpha` ≤0,85, nunca bola.
- Vidro negro se lê por specular/reflexo/brasa, nunca por albedo; sparkle ≤1.
- Nuvem: alfa INVERTIDA no fresnel (`1.06 - 0.5*fres`), uHot escuro (o mix
  acontece antes da luz ×2,4 e empilha cascas), amplitudes 0,03–0,05.
- Torso redondo esconde peça de face: olho/boca tem que SAIR da superfície.
- Projeto "espécie nova" ≠ shader novo: primeiro reusar os shaders existentes
  (`stoneShaders`, `iceShaders`, `waterShaders`, `steamShaders`, `woodShaders`,
  `sandShaders`, `makeCoreMaterial`, arcos de `lightningShaders`) em outra
  paleta/pose. Shader novo só quando o figurino pede.
- Paleta ÚNICA por espécie amarrada em teste: `projectileColor` do motor =
  `VISUALS.glow` = veios do rig = plasma = projétil = FX.
- Rampa de saída do projétil define "peso" (0,05 feixe → 0,22 gosma); quique
  define material (vidro/pedra 0,38; lodo 0,08 não quica).
- Janela de ataque exportada (`<ESPÉCIE>_ATTACK_WINDOW` / `_WINDUP`) amarra a
  personalidade na coreografia e em teste. Meios-pesados ~0,6–0,75s.
- Peças animadas sem esqueleto: `part.group` + matemática de pivô via
  `part.group` rotation no rig (pescoços do Pântano, gyro do Plasma).

### Lições da Névoa (nuvem clara/fria — as quatro que o print cobrou)

- **O `smokePool` é grafite-fuligem**: o frag pinta `(0.42,0.38,0.36)` mesmo com
  `heat: 0`. Espécie clara/fria NUNCA usa fumaça do pool (a "bruma" manchava a
  poça branca de cinza). Vazão = motes de geada + véus do próprio corpo; frio
  não suja, só geada. (Na falta de fumaça, o FX de impacto usou 3 anéis de
  geada no piso em vez de puff.)
- **Corpo de nuvem precisa de CASCA ANINHADA** (3–5 lathes concêntricos, mesmo
  material compartilhado de propósito): com `FrontSide` há UMA superfície por
  casca no caminho óptico, e o alfa do vapor é multiplicado pelo ruído `den`
  (~0,65 médio) → uma casca só lia como "gelatina de vidro" (dava pra ver o
  miolo oco do sino). No teto: `uAlpha` 0,94 (clamp do frag) + `uCharge` de base
  ~0,55 no material da túnica (`userData.robe`), senão a opacidade real é ~0,6.
- **O fiapo vem do VÉRTICE, não do alfa**: `amp` alto (0,09–0,16) desfia a
  barra; `swirl` alto abria buraco no meio do tecido. E **véu oco** (funil de
  garma, casca única vista de lado) DOBRA o caminho óptico → alfa raso (0,4),
  senão fecha como tinta preta.
- **`torus` sem rotação fica de pé no plano XY** (metade dele afunda no
  tabuleiro — o aro da barra da Névoa furava o piso em −1,08): aro de chão é
  sempre `r: [-1.57, 0, 0]`, e o pino `minY ≥ −0.1` do invólucro pega.
- Rosto: **slate médio** (`#5c7488`) — breu puro virava "cartucho"; olhos
  FENDADOS miúdos (≤0,07 de raio, escala y < x) — googly mata o frio. Máscara
  aparafusada NA FRENTE do capuz (a face sai do véu) e **só a máscara é `dark`**
  (gelo escuro nos ombros virava disco preto que engolia a silhueta clara).

### Ferramentas de QA

`qa/inspect-species.mjs <especie> [aliada]` · `qa/find-particles.ps1 <especie>
[saida] [ice|hot|leaf|bright|sand]` (acha projétil/estilhaço nos 40 b-frames) ·
`qa/diff-shots.ps1 a.png b.png` · `qa/probe-parts.mjs` (inventário de meshes/
materials/uniforms) · `qa/probe-flake.mjs` (print na hora do voo) ·
`qa/probe-nevoa.mjs` (varre a CENA atrás da pluma/estilhaço em voo e printa —
útil quando o projétil é LENTO e o b-frame de 0,25 s atravessa o voo) ·
`qa/probe-veil*.mjs` / `probe-quad.mjs` (sondas de material/cena). Prints em
`%LOCALAPPDATA%\Temp\opencode\shots`. ⚠️ sonda: só roda o `wheel` de zoom no
centro do canvas — `page.mouse.click` no tabuleiro ANTES do `start-battle`
agarra unidade e hijacks a luta (a sonda dispara um tiro só). Pré-requisito:
`npm run dev` + chromium do Playwright (já instalado).

---

## O que já está implementado (resumo — NÃO re-implementar)

- **Partida completa**: menu → preparação → combate real-time → resultado
  (recompensa idempotente por `matchId`) → revanche/menu.
- **Árvore elemental Nv.1–10** (única fonte `game/fusion/fusionRules.ts` +
  `data/fusionRecipes.ts`): verticais puros 2×Ln→1×L(n+1) até **Nv.5**
  (L5+L5 pura bloqueada); cross-species **só a partir do Nv.5** nos níveis exatos
  da receita; **19 receitas fixas** (Nv.6–10), sempre 2→1, ordem irrelevante,
  gratuitas; nada acima do Nv.10 (`MAX_LEVEL 10`, `CROSS_FUSION_MIN_LEVEL 5`).
  Rejeições: `DIFFERENT_LEVEL / MIN_LEVEL / INCOMPATIBLE_SPECIES / MAX_LEVEL`.
- **19 espécies de nível fixo único** (raio, madeira, magma, gelo, vapor, areia
  | tempestade, obsidiana, pantano, plasma, nevoa, cristal | cosmico, geodo,
  abissal, vulcanico | astral, colosso | primordial) + 4 puros com 5 formas
  nomeadas (`formTops/formNames`). Híbridos antigos (vulcane/tempest/verdan/
  solaris/vaporis/duna) REMOVIDOS; save **v3** migra com reembolso.
- **Bestiário + descoberta progressiva**: espécie inédita = silhueta + "???" +
  nível (sem stats/receita); primeira fusão abre `DiscoveryOverlay` (especial
  p/ Nv.10) e grava no save; arraste mostra "??? Nv.X"; progresso X/19.
  Receitas visíveis só após descoberta (`evolutionRecipeText`).
- **Combate**: projéteis homing, resistências, burn/slow/**poison**
  (`StatusTickDamage`), abilities splash/pierce/**chain** (`chainLeft`)/
  doubleShot/swift/heavy/**regen**/**drain**, mira por forma (`formAimY/
  formMuzzleY`), morte/fusão animadas, fim por extermínio/160s (fração de HP).
- **IA honesta** (`game/ai/teamComposer.ts` + `fusionPlan.ts`): exército no
  `startBattle`, orçamento `coeff × Σ sellValue`; `sellValue = 100·2^(nv-1)`
  vale p/ TODAS as espécies; `TEAM_RULES`: easy 0 / normal 7 / hard 10
  (`treeMaxLevel`), `hybridChance` 0/0.3/0.6, contra-escolha e tanques na
  frente (normal+), seed determinística.
- **Economia fixa**: 100/invocação, +100 vit / +50 derrota-empate, fusões
  grátis, venda devolve custo acumulado, saldo nunca negativo.
- **Persistência** (`persistence/saveGame.ts`, chave `elemental-merge-save-v1`,
  `SAVE_VERSION 3`): moedas, descobertas, `retainedRoster` (sobreviventes
  voltam de graça, ≤12), settings (dificuldade, saldo inicial, debugMode),
  estatísticas; load defensivo com migração.
- **Modo debug**: Configurações → Depuração → botão "Criar no campo" em todo
  card do bestiário (`engine.addRetainedUnit`, só na preparação, sem descoberta);
  puros têm seletor de forma Nv.1–5; card selado mostra rig real.
- **Puros com figurino completo e aprovado**: ignis (FlameRig), zephyr
  (WindRig), golem (StoneRig — o padrão físico modelo), nereia (WaterRig) —
  5 formas visíveis cada, gateadas por `minLvl/maxLvl`.
- **Arena**: ilha flutuante, plataformas derivadas de `game/board.ts`
  (`TILE_SPACING_X 3,2 · ROW_DEPTH 2,3 · FRONT_ROW_Z 2,5 · UNIT_BASE_Y 0,28 ·
  12 slots/lado`), câmera orbital 360° (dist 3–34, polar 0,35–1,32).
- **QA visual automatizado** (laço Playwright descrito acima), 237 testes/24.

## Arquitetura (regras de sempre)

- Stack: React 18 + Vite 5 + TS 5.6 estrito + three r169 via R3F 8 + drei 9 +
  zustand 4; testes Vitest 2 + RTL (jsdom).
- Camadas: `src/game/` + `src/data/` = motor/regras **puros** (proibido three);
  `src/store/gameStore.ts` = espelho discreto da UI (`getEngine()` singleton
  fora do React); `src/scene/` = R3F lendo o mundo em `useFrame` (mutação
  imperativa, pools, sem re-render); `src/components/` = DOM sobreposto.
- Loop: `hooks/useGameDriver.ts` (rAF, dt≤0,05; `syncUi` ~8×/s; FX consomem
  `engine.drainFx()` — fila de `FxEvent` com `pos2/species/level` nos impactos
  e `species/level` no chain).
- Cena: `BattleScene` (raycast de arraste no plano y=0.28), `UnitView` (rig +
  drag), registro `scene/speciesRigs.ts` (`SPECIES_RIGS`; ausente = rig genérico
  de peças), modelos em `scene/speciesModels.ts` (`Part` com g/a/p/s/r/m/
  minLvl/tags/group/amp/flick/rise + `groups` spin; `VISUALS` por espécie),
  `Effects.tsx` (pools: anéis, estilhaços por kind rock/wood/lava/ice/glass/
  mud, arcos jagados, smoke…; branch de impacto por espécie),
  `ProjectileField.tsx` (casos-assinatura: isBolt/isBoulder/isSeed/isSpike/
  plume/isLuff/globo/lança…; `pendingShots` readonly), rigs com coreografia de
  arremesso (windup→swing→decay) + morte crumble/estilhaço.

## Comandos de verificação (rodar SEMPRE após mudanças)

```
npx tsc --noEmit          # tipos
npx vitest run            # 237 testes, 24 arquivos
npm run build             # tsc + build de produção
npm run dev               # http://localhost:5173 (HMR; hard refresh ao mexer shaders)
node qa/inspect-species.mjs <especie> [aliada]
```

## Armadilhas (resumo)

- HMR preserva `useMemo` de material three → reiniciar dev ou Ctrl+Shift+R ao
  editar shaders/cores.
- GLSL silencioso: vírgula antes de `)` quebra compilação e a mesh SUMIA (hoje
  o laço Playwright pega pelo console; ainda assim escanear GLSL editado).
- `<sprite>` sem `map` = quadrado sólido.
- Pipeline de cor: hex dos catálogos já compensam a linearização do three;
  não "corrigir" um material isolado.
- Flaky ocasional: `ui.test.tsx` "tempo persistido" (sync de 0,14s).
- UI e comentários em **PT-BR**; aprovar visual só com screenshot (nos do
  laço Playwright valem) — nunca aprovar às cegas.
