# HANDOFF — Elemental Battle: Merge Arena

> Estado verificado em **01/nov/2026** por inspeção direta + suíte rodando:
> `npx tsc --noEmit` OK · `npx vitest run` **286 testes / 28 arquivos, todos
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
| abissal, vulcânico | 8 | ⬜ pendente |
| astral, colosso | 9 | ⬜ pendente — ruling do usuário: leitura **CÓSMICA** (galáxias/estrelas), escalando acima e DIFERENTE do DNA de constelação do Cósmico |
| **primordial** | 10 | ⬜ pendente — pedido especial do usuário: **quasar supermassivo com disco de acreção, grande, ataque em rajada de energia** |

**Último monstro melhorado: GEODO (Nv.8 — obsidiana+cristal: a CATEDRAL DE
GEODO plantada na própria fundação, o mais duro dos tanques: três degraus
pentagonais de cantaria CLARA escalonados 36° = estrela de dez pontas +
entulho cuspidido; DNA PENTAGONAL EM TUDO — todo `cyl`/`cone` tem CINCO
faces, os mamelões são dodecaedros (doze pentágonos), zero esfera/toro no
modelo inteiro; basalto AMEIXA CRUA e fosca (#5c4e74 metal 0,06 — nunca o
vidro negro espelhado da Obsidiana-mãe) com a cantaria clara valendo ≥3× a
luma do corpo; face de MÁSCARA DE FACHADA — placa pentagonal CLARA
avançando sobre o crânio (vértice para baixo = queixo), rosácea de cinco
pétalas de quartzo, barra escura de sobrancelha/boca SOBRE a placa clara,
órbitas de breu com pinpricks na frente e barba DOWN5 no queixo, com a
colunata pentagonal (capital + plinto alicerçado) FLANQUEANDO a face — a
cobrança do print: coluna clara atrás da máscara apagava a face; ASSINATURA
= o RELIQUÁRIO ABERTO na copa (aro pentagonal ABERTO com cinco placas
mandibulares DOBRADIÇADAS no aro — girar na tangente abre a goela em FLOR,
e o boulder-de-luz paira na cama de cristais apontada para dentro), torres
de ápside VERTICAIS com nódulo na ponta e três órbitas em alturas que nunca
se tocam; identidade única do motor ao caco — ametista #c77dff no veio do
basalto/cantaria/núcleo/boulder/FX, o hot #e0b3ff é SEMPRE acento;
coreografia MAIS LENTA da árvore: 1,05 s com 68% de afinação e pose que
zera no fim; 151 peças / ~8,9 mil vértices / ~5,4 mil triângulos)** — commit
mais recente de `main` (`git log -1`). Anteriores: cósmico, cristal `f48e789`, névoa/plasma `9d7a881`.

**Próximo: ABISSAL (Nv.8)** e depois vulcânico (Nv.8), astral e colosso
(Nv.9), primordial (Nv.10) na ordem da tabela. RULING DO USUÁRIO para o
Nv.9/Nv.10: as espécies Nv.9 (astral, colosso) têm que ler **CÓSMICO —
aparência de galáxia/estrelas** (escalar acima e diferir do Cósmico: pensar
em galáxia espiral, enxames de estrelas, anéis orbitais); o primordial
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
