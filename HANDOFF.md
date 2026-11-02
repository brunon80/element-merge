# HANDOFF — Elemental Battle: Merge Arena

> Estado verificado em **02/nov/2026** por inspeção direta + suíte rodando:
> `npx tsc --noEmit` OK · `npx vitest run` **326 testes / 31 arquivos, todos
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
| tempestade, obsidiana, pantano, plasma, névoa, cristal | 7 | ✅ figurino próprio + testes |
| **cósmico** | 8 | ✅ figurino próprio + testes |
| **geodo** | 8 | ✅ figurino próprio + testes |
| **abissal** | 8 | ✅ figurino próprio + testes |
| **vulcânico** | 8 | ✅ figurino próprio + testes |
| **astral** | 9 | ✅ figurino próprio + testes (espiral barrada de ONZE braços, plantado por onze raízes de gravidade) |
| colosso | 9 | ⬜ pendente — ruling do usuário: leitura **CÓSMICA** (galáxias/estrelas), escalando acima e DIFERENTE do DNA de constelação do Cósmico e da espiral do Astral |
| **primordial** | 10 | ⬜ pendente — pedido especial do usuário: **quasar supermassivo com disco de acreção, grande, ataque em rajada de energia** |
| **primordial** | 10 | ⬜ pendente — pedido especial do usuário: **quasar supermassivo com disco de acreção, grande, ataque em rajada de energia** |

**Último monstro melhorado: ASTRAL (Nv.9 — cósmico+abissal: o TITÃO DE ESPIRAL
BARRADA, a galáxia PLANTADA por onze raízes de gravidade: caça `farthest`,
`pierce 2` + `chain 3·f0,55` + `doubleShot 0,5`, o projétil MAIS RÁPIDO da árvore
(15) no MAIOR alcance (11,5) com a cadência mais rápida (1,2); DNA DE ONZE EM
TUDO — todo `cyl`/`cone` do figurino tem ONZE faces (`rod11`/`spike11`/`spiralArm`;
nenhum outro figurino usa onze: Geodo CINCO, Cristal SEIS, Abissal SETE, Cósmico
OITO, Vulcânico NOVE) e o onze manda nas CONTAGENS: onze braços em log-espiral
ρ = 1,4·e^(0,2θ) varrida até θ = 1,7 (nós afinando 0,15→0,09, varas
0,09→0,066 SOLDADAS nó a nó e emendando na TANGENTE da própria espiral, punho
enterrado em ρ 0,6 no núcleo), ONZE peças na BARRA da espiral barrada (seis nós em
x ±0,24/±0,66/±1,02 cavaletados ACIMA do equador da lente + cinco varas no meio
exato de cada par), ONZE peças na cara, ONZE raios de coroa INTERCALADOS aos ONZE
jatos polares (meio passo de 11 = π/11) com ONZE contas de geada na boca do eixo
de cada jato, ONZE varas de gravidade + ONZE almofadas-âncora a 0,04 do piso, ONZE
nós de cauda de maré (ρ 1,98→2,98 subindo de y 2,86 a 4,24: é a cauda que estica
a pegada para o FUNDO do tabuleiro) e TRÊS cintas de ONZE girando em QUATRO
velocidades (cinta externa 0, halo globular 1, chuva de matéria 2 e o disco
rígido 3 — a rotação diferencial é o motor visual da espécie); ASSINATURA = o
DISCO INCLINADO (`ASTRAL_TILT` 0,3 — a câmera da arena olha a ~18° e um disco
deitado leria uma fatia) com a CABEÇA LEVANTADA num pescoço de gravidade para os
braços varrerem POR BAIXO dela e a BOCA DE BURACO NEGRO: aro âmbar ABERTO
(`openEnded`) com o poço de BREU dentro, MENOR que o aro; FACE ONZE-face em
máscara CLARA com sobrolho e queixo ESCUROS, olhos de BREU com faísca de geada NA
FRENTE (branco sobre máscara branca não lê); PALETA = o Cósmico do avesso — motor
âmbar `#ffb347` (`ASTRAL_STARLIGHT` = `projectileColor` = `VISUALS.glow` =
`uCrack` de TODA a pedra, inclusive a pedra BRONZE dos traços) com ACENTO geada
quase branca `#cfe4ff` (`ASTRAL_FROST` = máscara, pontas, bocas dos jatos,
`uCool` do plasma) sobre corpo grafite-violetu de vazio (`#4a3c60`/`#241d30`,
breu `#141019`); os TRAÇOS DE LUZ são pedra OPACA com o veio aceso (plasma em
vara fina vira tábua) e o relevo vem do TAMANHO da peça (≤ ¼ da menor
meia-dimensão dela); coreografia 0,74 s com 70% de afinação (a MAIOR fração da
árvore: o disco ENCURCA sobre o bojo e destora no estouro) e todos os canais
assentam no zero ANTES do último frame do coice; projétil = COMETA de breu com
veio âmbar, miolo de plasma e rastro PONTILHADO de geada; impacto = três lascas
de ONZE faces + anel âmbar com a geada POR FORA (o inverso exato do pai Cósmico)
+ chuva de breu + fagulhas de geada subindo + pó de disco (`heat` 0,25);
invólucro medido halfX 2,534 / halfZ 2,899 / minY 0,040 / maxY 4,730 com formTop
5,5; **228 peças / 33.966 vértices / 23.272 triângulos** e 13 pinos em
`src/tests/astralProgression.test.ts`) — commit mais recente de `main`
(`git log -1`). Anteriores: vulcânico `e4b4463`, abissal `e38d018`, geodo
`8ae1176`, cósmico, cristal `f48e789`, névoa/plasma
`9d7a881`.

**O VULCANICO (Nv.8 — plasma+obsidiana: o VULCÃO DE
NOVE ESTRATOS plantado na própria cacta de escória, a `catástrofe andante`:
`moveSpeed 0` (a montanha não anda — é a paisagem que ruge), caça `closest`,
`heavy` + `splash 2,0` + `burn 0,4`; DNA DE NOVE EM TUDO — todo `cyl`/`cone` do
figurino tem NOVE faces (`rod9`/`spike9`; nenhum outro figurino usa nove: Geodo
CINCO, Cristal SEIS, Abissal SETE, Cósmico OITO) e o nove manda nas CONTAGENS:
nove estratos empilhados em zigue-zague (cada degrau girado 20° = estrela de
dezoito pontas na silhueta), nove veias de lava descendo do ombro ao sopé, nove
pingos, nove fumarolas, nove merlões, nove esporões por anel, nove raízes, nove
em cada uma das três órbitas; ASSINATURA = a CALDEIRA ACESA no topo — soalho
CLARO de tufo, poço de BREU (preto) menor que o soalho, saia ABERTA (`openEnded`:
a boca da montanha fica aberta para o céu) e NOVE FUMAROLAS TAMPADAS por um
TAMPÃO de escória dobradiçado no aro (`VULCAN_VENT_RIM`/`VULCAN_VENT_Y`
exportados do rig: a tampa BASCULA PARA FORA, a ponta ganha raio e abandona o
prumo da brasa — não ergue para cima); o LAGO do rig mora no poço
(`VULCAN_CORE_POS`) e é a silhueta do projétil; FACE no flanco em placa CLARA
avançando ≥0,08 sobre o estrato ESCURO (a máscara do Geodo INVERTIDA): sobrolho e
boca ESCUROS por cima da placa, órbitas de breu com pinprick de brasa NA FRENTE,
boca vazando lava; braços = CONES PARASITAS plantados no ombro (o `arm.plinth` é
fundação no pivô exportado `VULCAN_ARM_PIVOT`, o resto rocks); identidade da
caldeira ao anel de queimadura: lava #ff4d12 = `projectileColor` = `VISUALS.glow`
= `uCrack` de TODA a pedra (basalto E tufo) = `uGold` do lago/veias/bomba, brasa
#ff9d3d é SEMPRE acento (olhos, coração da face, escórias, anéis do FX); pedra
CRUA (roughness 0,9, zero metal) e tinta de basalto FRIO (b > g) — a régua contra
o tio MAGMA (barro cozido, g > b) e a mãe OBSIDIANA (vidro roxo espelhado, metal
0,55); coreografia 0,98 s com 64% de erupção enchendo (0,627 s absolutos: a
segunda afinação mais lenta da árvore atrás do Geodo 0,714) e a montanha NÃO
VERGA — o `lean` nem existe na pose, o que treme é o chão (`quake`); projétil =
BOMBA de nove faces (0,84 de maior diâmetro, 0,66 de comprimento: o naco mais
GORDO da árvore) com o plug de lava do lago entupindo a boca e nove escórias em
três cintas; impacto = anel de queimadura 3,0·k (a mais LARGA da árvore) + chuva
de basalto + brasa subindo + farpas de pedra-pomes; 183 peças / 12.380 vértices /
10.308 triângulos)** — commit `e4b4463`. Anteriores:
abissal `e38d018`, geodo `8ae1176`, cósmico, cristal `f48e789`, névoa/plasma
`9d7a881`.

**Próximo: COLOSSO (Nv.9)** e depois o primordial
(Nv.10) na ordem da tabela. RULING DO USUÁRIO para o
Nv.9/Nv.10: as espécies Nv.9 (o astral saiu primeiro, falta o colosso) têm que ler
**CÓSMICO — aparência de galáxia/estrelas** (escalar acima e diferir do Cósmico e
da espiral barrada do Astral: o colosso pensa em aglomerado/enxame massivo,
anéis orbitais e pedra de fundo); o primordial
Nv.10 tem que parecer um **QUASAR SUPERMASSIVO com disco de acreção**,
grande, com ataque em rajada de energia.

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

### Lições do Cristal (prisma translúcido plantado — as cinco que o print cobrou)

- **Anel EM PÉ não existe na natureza do figurino**: os dois `ring` sem rotação
  ficavam verticais no plano XY cortando a cabeça a 3,16/4,30 (o "ouriço de
  satélite" do print). Aro de espécie é sempre DEITADO (`r: [-1.57, 0, 0]`) e,
  quando a peça tem que ORBITAR, ela é um `ringAround(n, raio, y, tilt, …)` —
  círculo horizontal de peças reais, com inclinação radial (tilt ≈ 0,4 rad).
- **Translucidez tem orçamento**: corpo de gelo com alfa 0,78–0,84 + sparkle 1,1
  + `uHurt` 0,5 virava **"poste de gelo leitoso"** e "candelabro oco" (a luz
  vazando por trás). Pedra-densa: `alpha ≥ 0,9`, `sparkle ≤ 0,5` (o sparkle do
  `iceShaders` é AZUL-BRANCO — em corpo grande ele lava a cor da espécie),
  `envMix ≤ 0,45`, `crackGlow ≤ 0,7` e flash de dano `uHurt * 0,3`.
- **Quem brilha é um ponto só.** A matriz (duna/collar/cinto) com veio aceso em
  glow 0,3 + boost 0,8 lia "obsidiana com veios de LAVA" — magma, fora do blurb
  de areia+raiz. Matriz de pedra com gema = **pedra CLARA de geodo** (luma > 0,3,
  `crackGlow × crackBoost ≤ 0,12`) e SÓ a gema do peito acesa.
- **A luz presa em pedra tem que ficar FORA do invólucro translúcido**: enterrada
  no prisma, o alfa comia a luz e o peito lia roxo liso. Gema = octaedro facetado
  (nunca bola: bola virava "olho de bode"/disco de opalina) encaixado num colar
  hexagonal aparafusado na FRENTE da pedra, com `CORE_POS` além da frente da
  pedra, e escala NÃO-uniforme (ponta alongada no Z). Girar octaedro alongado no
  Y inteiro faz a ponta "espetar" para dentro do corpo — balança, não gira.
- **Braço é cadeia, não pílulas soltas**: bola do ombro → úmero → bola do punho →
  rádio → garra de farpas, com cada peça encostando na vizinha, e o rig gira o
  braço INTEIRO no pivô da bola do ombro (exportado). Girar cada peça no próprio
  centro desarticulava o ombro no meio do arremesso.
- **Face escura em corpo escuro = buraco negro no card**: a placa da face recebia
  só 0,32 do key light (a face olha para +Z e a luz vem de cima) e virava
  cartucho. Placa CLARA (o próprio material de crescimento) + sobrancelha e
  boca-trinca ESCURAS por cima é o que faz o rosto ler de longe.
- **Anti low-poly em prisma não é arredondar**: o DNA da espécie são as SEIS
  FACES, então a densidade vem dos ANÉIS VERTICAIS (6 faces × 5–7 seções) e dos
  poliedros SUB 1/2 — um `cyl` de 24 radiais seria outro material, não cristal.

### Lições do Cósmico (constelação viva — as seis que o print cobrou)

- **A ARMADURA FAZ A SILHUETA.** A passada 1 tinha nós do MESMO tamanho da
  loriga e oito pontas compridas em cada nó: o print lia "pilha de bolas azuis
  com estourinhos". A régua nova: loriga opaca de DOZE FACES (largos tambores
  verticais) desenhando a silhueta, e a constelação só POR CIMA dela com nós
  MIÚDOS (raio ≤ 0,13) e pontas CURTAS (≤ 0,16). Densidade de "espécie de
  armadura" vem dos anéis verticais do tambor, nunca de arredondar.
- **A RÉGUA DO JITTER tem que caber no raio do fio** (a lição do Raio amarrada
  em teste): traço do `makeArcMaterial` zigue-zagueia por ruído de `vUv.y` em
  `uJitter`; se `uJitter × pico (1,6)` > raio do tubo, o arco rasga o próprio
  corpo. Aqui `STRAND_LOOK.jitter = 0,028` com fio mais fino de raio 0,048, e
  o projétil voante usa 0,015 (agulha 0,11). Pinar `jitter*1.6 < menor raio` e
  também o `uniforms.uJitter.value` (senão era enfeite de TS).
- **`mm()` espelha POSIÇÃO e INVERTE as rotações y/z** — então o *midpoint* de
  um `strand` espelhado é `(-m.x, m.y, m.z)`, NÃO a média dos dois nós
  espelhados… que é exatamente `mm(médio)`. Fios W soldam nas duas estrelas
  mesmo com o par espelhado. O que QUEBRA é fio torto com as duas pontas em x
  diferentes: a cópia espelhada do pescoço ficou solta no ar. Pinar o fio pelas
  **PONTAS recuperadas** (`p ± applyEuler(Y-up)·altura/2`), soldando em duas
  estrelas OU enterrando a ponta livre dentro do crânio (`dist < raio`).
- **`THREE.Color` armazena LINEAR** (`ColorManagement` converte sRGB hex ao
  carregar): `#a2b0d4` → luma 0,435, não 0,66. Pinos de "isso é pedra-da-lua
  clara?" têm que usar limiares LINEARES (lua > 0,35 · corpo > 0,02 · breu <
  0,05), senão o teste mente contra a paleta do designer.
- **O decay da coreografia começa NO disparo**: `charge` sobe até o release
  (a=windup) e cai direto, então pinar "meia-carga no shot" é erro — no
  `windup + 0,22·(1−windup)` o valor real é 0,25. Medir a curva num scratch
  (varrer `attackPose` de 0,2 a 1,0) antes de escrever qualquer pino de pose.
- **Física de caco do FX é por espécie**: o ramo `star` caiu no `default` do
  `switch` de shards (velocidade/spin de estilhaço comum) e a estrela caía feito
  pedra comum. Cacos de nova espécie entram na condição `fast` do `vy` e no spin
  (`star: 21`), e os pools `shardPrism`/`shardStar` precisam de `dispose()` na
  limpeza (o vazamento do `shardObsidian` já estava amarrado — copiar o padrão).

### Lições do Geodo (catedral de geodo — as cinco que o print cobrou)

- **O print cobra a CARA, não o traço**: a 6 m no card, sobrancelha/olho/boca
  rasos morriam. A régua nova: face de MÁSCARA DE FACHADA — placa aparafusada
  AVANÇANDO sobre o crânio (`zFront` da placa > zFront do crânio), traço
  ESCURO sobre placa CLARA (brow/mouth dark sobre accent), pinprick claro na
  FRENTE da órbita de breu, e a peça mais PARA FRENTE de tudo é a luz do olho
  (o coração da rosácea). Pinar com bbox transformado (`zFront`), senão os
  eixos diferentes de máscara/pétala/órbita mentem.
- **A cobrança do CONTRASTE com a mãe**: com basalto #453a52 o Geodo lia o
  MESMO preto-vidro da Obsidiana ao lado dela no print. Pedra crua ≠ vidro:
  corpo clareado pra ameixa (luma LINEAR ≥ 4× a do corpo da mãe), roughness
  ≥ 0,85 e metalness ≤ 0,1 (a mãe é espelhada, ≥ 0,5). Amarrar VISUALS =
  hexes reais dos LOOKS do shader (senão figurino e rig derivam).
- **A dobradiça é geometria, não animação**: a goela só abre se cada placa
  mandibular tem a própria BASE ABAIXO do plano do aro e o rig gira no eixo
  TANGENCIAL da borda (`q.setFromAxisAngle(tangent, -jawOpen)`) — aí o topo
  tomba PARA FORA (flor abrindo, a leitura aprovada) e o pé desliza para
  dentro do colarinho. Pinar o sinal com quaternion (topo·radial > 0,
  pé·radial < 0), senão a peça vira "pedra voando da cabeça".
- **Anti-z-fighting e anti-coluna-boiando**: `mm()` espelha SÓ o x (o z do
  par espelhado é o MESMO) e peça em x=0 não se espelha — mas escrevem-se
  aspas laterais NUM SÓ `mm()`; espelhar os dois lados em linhas separadas
  duplica tudo em cima (quatro prismas colados = z-fighting, o print não
  mostra mas o teste pega). E pilar que assenta em pedra tem o pé ENTERRADO
  ou plinto até a pedra: coluna boiando a 0,16 do degrau passou no olho e
  caiu no teste de alvenaria. Densidade anti-low-poly que se recupera de
  dedup se repõe com peça ARQUITETÔNICA (plinto), nunca duplicata.
- **O motor não tem gravidade de projétil**: arremesso é GUIADO a velocidade
  CONSTANTE `speed = base × 1.12^(L-1)` (o matacão do Geodo a 15,5 un/s no
  Nv.8 — o mais lento dos Nv.8 mesmo escalado; a régua de "pedra pesada" é
  a VELOCIDADE ESCALADA + `heavy`/`splash`, não um arco que cai). Pinar
  `|vel|` igual à speed escalada em todo o voo e a ordem base (Geodo:
  interval 2,4 e speed 7 = os mais lentos da faixa).

### Lições do Abissal (tamboril das marés mortas — as seis que o print cobrou)

- **Espécie que só atira com alvo ao alcance precisa de TANQUE no probe de
  impacto**: abissal tem range 10 e para de cuspir sem alvo — solo run de
  QA fica em idle e a varredura de cor nunca vê o FX. Promovido
  `qa/probe-impact-fast.mjs <especie> [aliada] [outDir]`: JPEG do viewport
  inteiro (~4× mais rápido que PNG no SwiftShader, ~2-3 frames/s), 150
  frames cobrem voo (0,5 s) + FX (1 s), e o 3º argumento é o aliado tanque
  (golem/obsidiana — `madera` não tem `debug-spawn-madera`).
- **A armadilha do `SphereGeometry(r, 1, ...)`**: `widthSegments: 1` degenera
  a malha (peça invisível/estilhaçada no print) e passa liso no tsc. Toda
  esfera de corpo é ≥12×8 segmentos; pinar contagens por raio.
- **Dobradiça se pina por CINEMÁTICA, não por posição**: os centros das
  presas da mandíbula ficam ACIMA do pivô da bochecha (a raiz entra no
  maciço), então "centro abaixo do pivô" é falso — o teste certo é girar o
  quaternion do pose (`setFromAxisAngle(X, gape)`) e cobrar que TODAS as
  peças `jaw.*` CAIAM (>0,05; queixo >0,25). A mesma virada valeu para o
  Geodo (tangente) — pivô sempre exportado do rig para o teste.
- **Sete faces = identidade de espécie**: cada híbrido da árvore agora tem
  UMA contagem de faces própria (Geodo CINCO, Cristal SEIS, Cósmico OITO,
  Abissal SETE) — pino `a[3]===7` em todo `cyl` e `a[2]===7` em todo `cone`
  pega figurino inteiro de uma vez e a silhueta lê diferente no print. O
  sete vale também para as CONTAGENS (presas, gotas, ganchos, luas, vidas
  cativas) — forma e número da mesma família.
- **Bioluminescência própria POLUI varredura de matiz**: scan de cor pontua
  os fotoóforos do próprio monstro tanto quanto o FX do impacto — o score
  não separa criatura de tiro. Para projétil/FX, ler frames DENSOS do
  probe-fast olho no olho (aqui: globo em voo no f-007, enxame de dreno no
  f-012), varredura é só índice de onde olhar.
- **Gancho de jaula se pina por RAIO, não por mira**: "a ponta aponta para o
  centro" é duro demais com tilt (o berço da lanterna abre a boca para cima
  — `tilt 0,5` num aro de 0,16). A cobrança certa é tip-vs-base: raio da
  ponta < raio da base (o gancho FECHA) e a ponta invade o vão da luz. O
  `aim` do `speciesModels` aponta o +Y local (eixo do cyl/cone) — pino de
  eixo usa `(0,1,0).applyEuler(r)` e fecha as juntas do `rod7` a <0,05.

### Lições do Vulcânico (montanha plantada — as seis que o print cobrou)

- **O dev server velho serve o TRANSFORM OBSOLETO silenciosamente**: enquanto
  houver um `npm run dev` antigo em 5173 (base `/element-merge/`), cada sonda QA
  pode rodar contra o código ANTERIOR sem nenhum erro. Antes de qualquer sonda,
  tocar os fontes alterados: `foreach ($f in 'src\scene\X.ts',...) {
  (Get-Item $f).LastWriteTime = Get-Date }`.
- **Tampa de fumarola é DOBRADIÇA PARA FORA, não elevação**: "a tampa ergue" é
  a física errada (a tampa sai voando por cima da cratera e some do print). A
  tampa é TAMPÃO entupindo a boca do tambor (base da tampa ≈ topo do tambor) e
  bascula na TANGENTE do aro: com `-capOpen` a ponta ganha RAIO (0,58→0,63) e
  abandona o prumo da brasa, expondo a luz. Pinar por raio/pino, não por Y:
  `rAfter > rBefore`, distância ao eixo do tambor cresce, e a base quase não se
  move (<0,04 do pino exportado).
- **O ápice do `ConeGeometry` fica em +Y** (a base em −Y): pinos de "ponta" e
  "umbigo" de pingo/escória dependem disso — `tipY = p.p[1] + u.y*half` com
  `u = (0,1,0).applyEuler(r)`, e `spike9`/`rod9` plantam a base no maciço por
  esse mesmo motivo.
- **Matiz se pinar parseando o HEX, não o `THREE.Color`**: `new THREE.Color(hex)`
  converte sRGB→linear e APLANA as diferenças (o barro do Magma deu `r-b = 16`
  em vez de 34 e o pino "tio magma é barro cozido" quebrou). `rgb()` =
  `parseInt(hex.slice(1,3),16)`; `luma()` continua em espaço LINEAR (é a régua do
  "a placa clara lê sobre a rocha escura?").
- **A câmera do r3f NÃO está na cena nem no `__THREE_DEVTOOLS__`** (só a Scene é
  registrada — `rend.projectionMatrix` é `undefined`): a alça é `obj.__r3f.root`
  (todo Object3D criado por JSX carrega) → `.getState()` dá `camera/gl/size`.
  Com `projectionMatrix × matrixWorldInverse` projeta-se a INSTANCIA do pool na
  tela e o recorte nasce em cima do alvo. Ferramenta nova:
  `qa/probe-projectile.mjs <especie> [aliada] [outDir] [hexDoNúcleo]` (recorte
  cru + 3× ampliado sem suavizar, mira ciano na posição EXTRAPOLADA e anel de
  raio 0,3 u para medir o tiro em pixels).
- **Silhueta de projétil se mede comparando com os irmãos**: o fuso de 0,44 de
  comprimento lia como LASCAS a 20 px no zoom do jogo (o golém Nv.1 cospe um
  bloco de 0,95). Bomba gorda = 0,84 de maior diâmetro / 0,66 de comprimento e o
  plug de lava do lago ENTUPINDO a boca do fuso (maior que a boca: salta para
  fora da casca opaca — o miolo dentro de pedra opaca é INVISÍVEL, o `uCrack`
  sozinho não resolve). Varredura por COR nunca acha o tiro: o próprio monstro
  brilha igual; achar por `isInstancedMesh` (figurino são meshes comuns) + raio
  finito ≥0,03 (tabuleiro/anéis de FX são `PlaneGeometry` sem raio) + a matiz do
  núcleo, e a velocidade por IDENTIDADE DE INSTANCIA (pool+índice) — o pool
  recicla slots e "velocidade" sai 0.

### Lições da Astral (galáxia plantada por gravidade — as oito que o print cobrou)

- **Traço ESTRUTURAL aceso é PEDRA OPACA, nunca plasma**: `makeCoreMaterial` é
  `transparent: true`, `depthWrite: false`, `DoubleSide` e SEM `blending` (logo
  `material.blending === NormalBlending` — o pino que procurava
  `AdditiveBlending` estava errado). Numa vara de 0,055 o plasma mostra a própria
  face de trás e o traço ENGORDA até virar TÁBUA: os onze braços do astral
  viraram onze pás e o disco inteiro sumia no print. Régua: structure =
  `makeStoneMaterial` (opaco, escreve fundo, `FrontSide`) e aditivo só onde é
  GOELA/OLHO/MIOLO (`core.rim`, a faísca do olho, o caroço do cometa).
- **Com dezenas de traços acesos, a cor de identidade mora no VEIO, não na
  pedra** (a leitura que o print da arena arrancou): 78 peças `m:'glow' com pedra
  âmbar `#ffb347` somavam na câmera de longe e a galáxia lia LÂMPADA DE LAVA — e
  baixar `crackGlow` de 1,3 para 0,85 NÃO mudou nada, porque a cor vinha do
  `rockA`. Correto: pedra BRONZE escura (`rockA #a4611f` / `rockB #3f2410`) com o
  âmbar do motor no `crack` (`crackGlow 1,5`, `crackBoost 1,3`, veio FINO 0,035)
  e, para fechar o contraste, a casca do corpo CLAREADA (`#3a3048 → #4a3c60`) — o
  bojo é que tem que ler de longe. Pino de luma: pedra do traço < 0,6·luma do
  motor.
- **Relevo vem do TAMANHO da peça, nunca do humor do artista**: o shader da
  pedra desloca vértice AO LONGO DA NORMAL (`nrm*((n1-0,5)*1,6+(n2-0,5)*0,8)*amp`),
  então `amp` da ordem do raio da peça INFLA/AFIA (braço de 0,09 com amp 0,04 já
  era pá). A régua do rig: `amp = min(uAmp, rMin·0,25)` com `rMin` = menor
  meia-dimensão da caixa ESCALADA da peça, e o valor arredondado entra NA CHAVE do
  cache de materiais (senão duas peças de tamanhos diferentes dividem o mesmo
  material).
- **CONTINUIDADE DE POSE é pino, não sensação**: o `align` parava em 1 e o
  `flare` em 0,5 no último frame do coice — a cabeça e os jatos cortavam num
  frame só e o titã dava um SALTO a cada tiro. Agora `relax = 1 − r^2,2` multiplica
  align/flare e os seis canais chegam a ~0 antes do fim da janela (0,999·janela:
  align 0,007 / snap 0,001). Pine `attackPose(0.999·window)` e a continuidade no
  frame do tiro (±0,001) para `flinch/align/charge`; só `snap/quake/flare` são
  impulso DECLARADO (podem descontínuar).
- **`MODELS.<sp>.bob` vale também para quem tem rig registrado** (o `UnitView`
  aplica o `bob` no grupo inteiro): com bob 0,05 o Nv.9 plantado afundava as onze
  almofadas e o pino `minY ≥ -0,01` ia abaixo. Titã plantado = `floatY 0` **e**
  `bob ≤ 0,02`.
- **Pine por FÓRMULA DE IDENTIDADE, nunca por "as duas peças mais próximas"**:
  agrupar os nós pela azimute da log-espiral misturava braços vizinhos (só 0,571
  rad de passo), a caixa do pino de jato é inflada pela vara INCLINADA (comparar
  a conta de geada com o topo da caixa, não com o topo do EIXO `dir·half`), e a
  azimute de coroa-vs-jato tem que medir no PÉ do jato (a vara é varrida para −z:
  centro e topo mentem). Agrupe pelo φ do espichão e exija `angGap < 0,01` — cada
  nó pertence MESMO a um braço.
- **A cara ONZE-face não pode repetir a própria máscara**: olho CLARO em máscara
  CLARA desaparecia no close. Olho = BREU (`#0d0a12`) com a faísca de geada na
  FRENTE (z 0,38 → 0,47), e o par é Espelhado pelo `mm` do figurino (pine
  `|x₀| == |x₁|` com 6 casas, não `x₀ + x₁ ≈ 0` entre peças de lados trocados).
- **Flaky conhecido da suíte**: `src/tests/ui.test.tsx > Tempo persistido entre
  partidas > sobreviventes voltam de graça` ("expected 0 to be greater than or
  equal to 1") falhou uma vez na suíte inteira, não reproduziu nem sozinho nem na
  segunda corrida completa — não é do figurino, não mexer nele.

### Ferramentas de QA

`qa/inspect-species.mjs <especie> [aliada]` · `qa/find-particles.ps1 <especie>
[saida] [ice|hot|leaf|bright|sand]` (acha projétil/estilhaço nos 40 b-frames) ·
`qa/diff-shots.ps1 a.png b.png` · `qa/probe-parts.mjs` (inventário de meshes/
materials/uniforms) · `qa/probe-flake.mjs` (print na hora do voo) ·
`qa/probe-nevoa.mjs` (varre a CENA atrás da pluma/estilhaço em voo e printa —
útil quando o projétil é LENTO e o b-frame de 0,25 s atravessa o voo) ·
`qa/probe-front.mjs <especie> [aliada] [outDir] [graus]` (orbita a câmera da
arena até a FRENTE do modelo + zoom e fotografa o combate — a câmera padrão
olha as COSTAS das unidades e o viewer do card do bestiário também mostra o
REVERSO, então a face só é olhável por aqui) · `qa/probe-impact.mjs <especie>
[aliada] [outDir]` (zoom PARA FORA antes do combate: o tabuleiro inimigo fica
fora do enquadre padrão e o FX de impacto é invisível nos b-frames normais) ·
`qa/probe-impact-fast.mjs <especie> [aliada tanque] [outDir]` (irmã densa:
150 JPEGs do viewport a ~2-3 frames/s cobrem o voo + a explosão que duram ~1 s
— exige ALIADA TANQUE, espécie que só atira com alvo ao alcance fica em idle
sem ela; `madera` não tem `debug-spawn-` próprio, use golem/obsidiana) ·
`qa/probe-projectile.mjs <especie> [aliada] [outDir] [hexDoNúcleo]` (fecha o zoom
EM CIMA do tiro em voo: acha a instância do pool na cena, projeta na tela pela
câmera achada em `obj.__r3f.root.getState()` e salva o recorte cru + o mesmo
recorte 3× ampliado sem suavizar, com mira ciano na posição EXTRAPOLADA
(velocidade medida por identidade de instância: pool+índice) e um anel de raio
0,3 u para medir o projétil em pixels — é assim que se julga "o tiro lê na arena?"
e se compara com o tiro de uma espécie já aprovada) ·
`qa/probe-veil*.mjs` / `probe-quad.mjs` (sondas de material/cena). Prints em
`%LOCALAPPDATA%\Temp\opencode\shots`. ⚠️ sonda: só roda o `wheel` de zoom no
centro do canvas — `page.mouse.click` no tabuleiro ANTES do `start-battle`
agarra unidade e hijacks a luta (a sonda dispara um tiro só). Pré-requisito:
`npm run dev` + chromium do Playwright (já instalado). Para o iOS há três sondas
irmãs no WebKit (o motor do Safari do iPhone): `qa/probe-webkit.mjs` (caps +
console), `qa/inspect-webkit.mjs <especie> [aliada]` (o mesmo roteiro do
inspect-species no WebKit) e `qa/audit-bestiary.mjs [chromium|webkit] [saida]
[especies...]` (enciclopédia inteira: printa CADA CARD como o usuário vê, conta os
contextos WebGL da página e cataloga erros do console). Requer
`npx playwright install webkit` (instalado).

---

## Compatibilidade iOS/WebKit (corrigido em 01/nov — NÃO reverter)

Dois defeitos reais do WebKit faziam os monstros SUMIREM no iPhone e aparecerem
no desktop. Verificados e sanados rodando as sondas acima no WebKit (o gate iOS
é `node qa/audit-bestiary.mjs webkit`: **2 canvases vivos e CONSOLE: 0**).

1. **`aSeed` com bound curto → o WebKit recusa o draw.** Os rigs criavam o
   atributo de fase com UM valor (`new BufferAttribute(new Float32Array([seed]), 1)`)
   em geometrias de milhares de vértices. O ANGLE-D3D do Windows lê fora do
   buffer e tolera; o WebKit valida o bound e **não desenha nada**:
   `WebGL: INVALID_OPERATION: glDrawArrays: Vertex buffer is not big enough for
   the draw call`. Corrigido por `setSeedAttribute(geo, seed)` em
   `scene/assets.ts` (carimba o seed em TODOS os vértices da peça clonada), usado
   pelos 12 rigs cujo shader lê `aSeed`. Nos projéteis instanciados o atributo já
   estava certo (`InstancedBufferAttribute` = um valor por INSTÂNCIA).
2. **Teto de contextos WebGL → a batalha perdia o canvas.** Cada card do
   bestiário montava um `<Canvas>` próprio. No WebKit, estourado o teto, o
   contexto sacrificado é o MAIS ANTIGO — o canvas da batalha. `forceContextLoss()`
   no desmonte + orçamento de slots **não resolveu**: a contagem interna do Safari
   só cai no GC, e o GC nunca chega a tempo (sonda com contexto sintético também
   não vale, o WebKit só conta os que desenham). Arquitetura definitiva: **DOIS
   contextos no jogo inteiro** — o da batalha e um ÚNICO palco para a
   enciclopédia (`scene/BestiaryStage.tsx`: um `<Canvas>` absoluto cobrindo a
   janela, `alpha: true`, `dpr [1,1.5]`, `powerPreference: low-power`, z-index 45
   acima do overlay, `pointer-events: none` inline — senão o canvas engole os
   cliques dos cards), e cada card é um `<View>` do drei (`@react-three/drei/web`)
   que usa a caixa `.beast-model` como retângulo de rastreamento: o drei recorta
   scissor/viewport daquele card no canvas do palco. O que isso exigiu:
   - **limpeza manual** (`ClearBuffer`, `useFrame` prioridade `-1`, roda antes dos
     containers do View que têm `index >= 1`): o container do drei só liga o
     scissor e renderiza, nunca limpa a própria janela → sem `setScissorTest(false)`
     + `gl.clear()` no começo do quadro os cards herdam cor **e o z-buffer** uns
     dos outros (o gelo saiu "fantasma" na primeira versão: profundidade
     envelhecida esconde partes do modelo);
   - **uma câmera só** para todos os cards (`[0, 1.1, 4.6]`, fov 38, `lookAt` na
     origem; o drei só troca o `aspect` por card) → quem se enquadra é o MODELO:
     `fit = min(1.96 / top^0,72; 2.7 / top)` e `frameY = -top*fit/2` (o centro da
     caixa delimitadora na origem);
   - **sem OrbitControls no card**: a vitrola é `bodyRef.rotation.y` (auto-giro
     0,34 rad/s) + arrasto do usuário nos pointer events da caixa
     `.beast-card-model` (`touch-action: pan-y` continua deixando o toque rolar a
     página);
   - **DOM que não pode ser coberto**: o palco pinta ACIMA do overlay, e o
     recorte é exatamente a caixa do card (o modelo nunca vaza dela). Então
     `.beast-top` deixou de ser sticky (rola com o painel), o fechar virou
     `.beast-close-float` (fixo, z-index 46, acima do palco) e os chips de forma,
     o rótulo da forma e a dica de clique saíram da caixa 3D para a linha
     `.beast-model-foot` embaixo dela — dentro da caixa o modelo os cobriria.
3. **WebGL2 é obrigatório** (three r169 não fala mais WebGL1): `hasWebGL2()` em
   `scene/webgl.ts` (**cacheada** — é chamada em todo render de card, e sem cache
   cada card pediria um contexto novo ao Safari) + `app/GLBoundary.tsx` em volta
   do `<Canvas>` da batalha: iPhone com iOS < 15 e WebViews de aplicativo veem o
   painel `.gl-missing` ("3D indisponível … atualize para o iOS 15 ou mais novo")
   em vez de tela preta. Sem WebGL2 os viewers do bestiário também não montam
   (ficam com o aviso `.beast-model-hint`).

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
