# HANDOFF — Elemental Battle: Merge Arena

> Estado verificado em **12/nov/2026** por inspeção direta + suíte e sondas
> rodando: `npx tsc --noEmit` OK · `npx vitest run` **505 testes / 45 arquivos**
> (as únicas falhas são as conhecidas e IDÊNTICAS no HEAD: `app.test.tsx`
> *App (smoke)* ×2 porque o jsdom não tem WebGL e `data-testid="scene-game"` não
> nasce — verificado no worktree do HEAD — mais o flaky já documentado de
> `ui.test.tsx` "tempo persistido") · `npm run build` OK · sondas verdes:
> `qa/probe-framing.mjs` (24/24 buracos + arraste real no slot do alvo),
> `qa/probe-sell-fab.mjs` (SEM FALHAS) e `qa/probe-tutorial.mjs` (92 checagens,
> 0 falhas) · git em `dev` (repo público `brunon80/element-merge`, CI → GitHub
> Pages).
>
> **Atualizado em 14/nov (malhas do Ignis, Zéfiro e GOLÉM Nv.1 — o golem só
> entrou depois da 4ª rodada de prints):** `npx
> tsc --noEmit` OK · `npm run build` OK (os `.glb` saem como assets: 2,5 + 4,4
> + 5,7 MB) · suíte 505 testes
> com as falhas CONHECIDAS do ambiente local Node 26 — `app.test.tsx` ×2
> (jsdom sem WebGL) + contaminação de timers de música em
> `audioUnlock.test.ts` ("expected 2 to be 1"); rodados isolados, os dois
> passam (o audioUnlock fecha 6/6 sozinho). Trabalhando em `dev`.

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
| **colosso** | 9 | ✅ figurino próprio + testes (montanha eterna que virou LUA: planetóide de regolito claro com anel inclinado de treze matacões) |
| **primordial** | 10 | ✅ figurino próprio + testes (REWORK quasar-puro 03/nov: ESFERA NEGRA + disco dourado LARGO girando RÁPIDO + silhueta lensada do disco por CIMA e por BAIXO (Gargantua); BLOOM gateado) |

> **REWORK artístico do PRIMORDIAL pedido pelo usuário em 03/nov — FEITO (é o
> commit mais recente de `main`):** o monstro agora é APENAS o QUASAR — tombou o
> templo "tronco com cabeça" de dezessete pilares (base rochosa, torres, garras,
> pátio, entulho, coroa, lunetas e cometa segurado; 145 peças viraram CINCO); o
> centro é uma ESFERA NEGRA COM geometria (o horizonte de eventos); o disco de
> acreção (o que o usuário elogiou) ficou MAIOR (ρ 0,96→3,0, +32%), amarelado~
> esbranquiçado, e gira BEM mais rápido (`PRIMORDIAL_SPIN.base` 2,4 vs 0,5); a
> silhueta SUPERIOR e INFERIOR do disco arqueia sobre a esfera (os arcos de lente
> estilo Gargantua do Interestelar — a referência que o usuário colou). O FIX do
> quadrado preto (`21e9c09`) foi commitado+pushado ANTES do rework, e os três
> pins `?raw` do lesson WebKit seguem verdes no rig reescrito (blindam os shaders
> novos). Detalhes no bloco do PRIMORDIAL abaixo.

**Último monstro melhorado: PRIMORDIAL (Nv.10 — astral+colosso: A ENTIDADE
PRIMORDIAL — agora QUASAR PURO (rework artístico de 03/nov a pedido do usuário:
"ele deve ser APENAS o Quasar"; o quasar-de-templo de 145 peças foi DEMOLIDO: não
sobrou uma pedra). É o ÚLTIMO da árvore e o único monstro com pós-processamento;
caça `lowestHp`, rajada `#ffeccb` (luz-de-quasar) no projétil MAIS RÁPIDO da
árvore (12), `pierce 2` + `chain 3` + o `splash` MAIS LARGO (2,5) + `burn/slow
0,4` + `regen 0,05`, hp 130 / dmg 30, e é o ÚNICO com os QUATRO elementos
resistidos (0,25 cada — ele os precede); FIGURINO = CINCO peças de céu: a ESFERA
NEGRA `hole.horizon` (sphere r 0,98 plantada no plano do disco y 2,4, `m:'black'`
— breu puro SEM relevo; cortada em 34(=2×17)×17), o ANEL DE FÓTONS `hole.photon`
(toro 1,015 + tubo 0,02, 17×34, plasma rente ao ombro da esfera, `flick 0,18`), o
DISCO DE ACREÇÃO `disk.accr` (UMA só peça `ring` de ρ 0,96→3,0 com 102=6×17
segs — NASCE EMBUTIDO na superfície da esfera (o furo ρ<0,62 pintado do desenho
antigo morreu), 32% MAIS LARGO que o antigo 2,28 — o "maior" que o usuário pediu,
com shader próprio DISK_FRAG: branco-quasar na boca, OURO na meia-envergadura
(smoothstep 1,05→2,3) e franja EMBER esfriando na borda (2,5→2,9), anel de fótons
em HDR com feixe doppler é o que alimenta o bloom, e bandas de gás SEM noise com
ω ∝ ρ^−1,5), e os DOIS ARCOS DE LENTE `lens.top`/`lens.bottom` (toros de ARCO —
1,3/tubo 0,09/arco 2,4 rad e 1,42/0,07/2,9 rad, todos < π: as pontas esmaecem no
shader LENS_FRAG antes da banda do disco — a SILHUETA GARGANTUA pedida: o de cima
arqueia SOBRE a cabeça da esfera negra, o de baixo pendura POR BAIXO, no plano
VERTICAL de frente do modelo); o DNA DEZESSETE sobrevive só nas COSTURAS das
curvas (esfera 2×17 meridianos, disco 6×17, toros 17×34) e no rig (jato de 17
faces, pó 2×17=34, 17 baforadas) — NENHUM `cyl`/`cone` sobrou no figurino
(`rod17`/`spike17`/`mz` mortos), NENHUM grupo orbital, NENHUMA tag de templo;
FÍSICA DO DISCO: o wrapper só INCLINA no pivô (0, 2,4, 0) `PRIMORDIAL_DISK_PIVOT`
e o tilt oscila APENAS 0,42–0,50 — o quasar PAIRA (a borda ρ 3,0 desce a ~0,96 no
tilt máximo e a lente de baixo a 0,91; pino `env.minY ≥ 0,5`); o spin diferencial
mora no SHADER (ângulo ACUMULADO `uSpin`; a rotação ALTA pedida: `PRIMORDIAL_SPIN
{base 2,4, charge 1,7, jet 2,6}` — era 0,5 de base; pino `base ≥ 2`; e o pó orbita
a 5,2/ρ (era 1,4/ρ) na FAIXA do disco novo ρ 1,02–2,92); o CÉU (fótons + lentes)
é virado em Y pelo rig para ENCARAR A CÂMERA (billboard: anel de lente é projeção
no plano do céu e NUNCA entra no wrapper do disco); a RAJADA sai do VENTRE da
esfera negra (`PRIMORDIAL_MUZZLE` [0, 2,4, 1,06] — fura a casca frontal, h > raio,
como o jato relativístico varando o disco) e `formTops [4,9]` (caiu de 6,2: o
quasar é LARGO, não alto) amarra `formMuzzleY` 2,39 ≈ `PRIMORDIAL_DISK_Y` 2,4
(pino < 0,06: a origem do motor e o ventre do rig falam a mesma língua); PALETA
NOVA (pin motor↔figurino↔rig↔proj↔FX pelo HEX): OURO-QUASAR `#ffeccb` (=
`projectileColor` = `VISUALS.glow` = anel de fótons = veio da rajada = miolo do
jato = veio da farpa), o OURO do disco `#ffd66b` (= `VISUALS.body` = contorno do
`QUASAR_PLASMA.cool` — o azó frio `#e8f6ff` e o gelo `#9ad0ff` do desenho antigo
MORRERAM com o templo; pinos de separação: ≠ âmbar do astral `#ffb347`, ≠ âmbar
do colosso), o EMBER `#ff7a3c` esfriando na borda e o BREU NEGRO `#0e0a16` da
esfera (mais fundo que o breu do Colosso — pino de luma) — e a MATÉRIA
VITRIFICADA `SINTER_LOOK` (a única "pedra" que sobrou: escória de plasma que
passou pelo poço e esfriou em vidro dourado) é o corpo da LANÇA de rajada E as
farpas `quasarShard`; pino `warm` (b < g) em toda luz da espécie (amarelado~
esbranquiçado de verdade); COREOGRAFIA: janela 0,94 (entre astral 0,74 e colosso
1,25; a cadência do Nv.10 é interval 1,5) com 60% de afinação — o canal `gather`
das garras MORREU junto com o templo (lean/charge/flare/jet/recoil/quake), o jato
IGNORA do zero, ESTOURA em seno no meio do sopro e ASSENTA em 0 aos 87%;
projétil = lança de DEZESSETE faces de MATÉRIA VITRIFICADA com o plasma do MESMO
anel de fótons no caroço da boca (ouro no fresnel: o disco contorna a luz) +
rabo de DEZESSETE fagulhas de escória dourada `#f2dcae` com veio branco-quasar
(rolo de broca, ponta-fria e reta como o cometa do pai); impacto = farpa bicuda
de DEZESSETE faces `quasarShard` (física 'quasar': tier comet, spin 17, quique de
VÍTRO dourado vy·0,3 / vx·0,6) + anel QUASAR 3,7·k (o MAIS LARGO da árvore,
espelhando o splash 2,5) + EMBER 2,0·k POR FORA (a ordem ouro-dentro/ember-fora é
SÓ do Nv.10) + flash MIÚDO `#fff4d9` + DEZESSETE grãos de OURO SUSPENSOS subindo
(o DNA em partícula) + 17 puffs de VAPOR VITRIFICADO heat 0,22 (plasma arrancado
do disco esfriando em vidro — o pó de lua do Colosso 0,12 é FRIO ao lado); CHAIN =
o traço mais RETO da árvore (amp 0,06 — jato relativístico não ferve) vestido com
o INVERSO do pai astral: cauda OURO com miolo BRANCO-QUASAR (o pai é âmbar com
geada; o filho é branco-ouro — é assim que um print separa os dois Nv.9/Nv.10) +
burst `quasarShard` + miniatura do disco no destino (ouro dentro, ember fora);
NASCIMENTO: o terceiro anel do birth é o EMBER da borda do disco (o anel azo
`#9ad0ff` antigo morreu com o templo); BLOOM (autorizado pelo usuário SÓ pro
disco, `src/scene/BloomGate.tsx`): pipeline DECIDIDO em 01/nov MANTIDO (composer
PERMANENTE montado desde o frame 1: RenderPass com clearColor `ARENA_BG` + RT
HalfFloat `samples: 4` + UnrealBloomPass GATEADO por "existe um primordial VIVO
em cena" com rampa 2,5/s — strength 0,62 / radius 0,5 / threshold 0,8 — + pass
final de CÓPIA PURA; `patchBuiltins` devolve ACES+sRGB aos materiais embutidos
que o three despacha cru no RT; `scene.background = null`; proibido `OutputPass`)
— com o rework o HDR que alimenta o bloom é o anel de fótons do disco + o anel
billboardado, e o alpha do disco caiu a 0,45 (era 0,5) para frear a área HDR 32%
maior nova; invólucro medido: estático autoral halfX 3,0 / halfZ 3,0 / minY 0,91
(quasar PAIRA) / maxY 3,79 com formTop 4,9; EM MUNDO REAL autoral X 3,01 × Z 2,74
(a sonda de footprint; o tilt do rig fecha o Z); `MEDIDO.primordial {x: 3,01,
z: 2,74}` → familyRadius 3,09, slotFit ≈0,81 (o UnitView REDUZ o quasar 0,81: o
disco de 3,01 ocupa 2,44 dentro do buraco de 2,5); **CINCO peças / 2.726
vértices / 4.760 triângulos** — o figurino MAIS LEVE da árvore (contra 145 peças
do templo antigo e 221 do pai Colosso): o céu do Nv.10 é trabalho do SHADER
(disco, jato, pó e lentes são pintura HDR) e a malha é só o esqueleto do
horizonte; **10 testes** em `src/tests/primordialProgression.test.ts` (pins:
cinco peças e zero tag de templo, silhueta Gargantua — yHi da lente de cima ACIMA
da cabeça da esfera e yLo da de baixo ABAIXO do breu, arcos só com rotação em Z e
< π, esfera negra centrada no plano do disco, disco > 2,6 e embutido na esfera,
rajada no ventre, spin ALTA, paleta warm separada dos pais, coreografia sem
`gather`, motor armado — e os TRÊS pins estáticos `?raw` do lesson WebKit
intactos, blindando os shaders NOVOS contra a volta do quadrado preto) — commit
mais recente de `main` (`git log -1`), em cima do fix do quadrado preto `21e9c09`
(03/nov). Anteriores: colosso `a96bccb`, astral `488fc40`, vulcânico `e4b4463`,
abissal `e38d018`, geodo `8ae1176`, cósmico `5a11c80`, cristal `f48e789`,
névoa/plasma `9d7a881`.

**O COLOSSO (Nv.9 — geodo+vulcânico: a MONTANHA ETERNA
QUE VIROU LUA, o planetóide de regolito claro com ANEL INCLINADO de treze
matacões, plantado por treze contrafortes: caça `closest`, o projétil MAIS LENTO
da árvore (7), o `splash` MAIS LARGO (2,2), `heavy` + `regen 0,04`, hp 132 /
dmg 27; DNA DE TREZE EM TUDO — todo `cyl`/`cone` do figurino tem TREZE faces
(`rod13`/`spike13`/`CRATER13`; nenhum outro figurino usa treze: Geodo CINCO,
Cristal SEIS, Abissal SETE, Cósmico OITO, Vulcânico NOVE, Astral ONZE) e o treze
manda nas CONTAGENS: treze contrafortes + treze almofadas, treze menires com
lages (cerca miúda: pilar y 0,34 + lage y 0,67, senão funde com a faixa do
anel), treze crateras-cicatriz (aro CLARO + poço de BREU + gema de ametista +
LÂMPADA de magma), anel com treze matacões deitados NA TANGENTE (ρ 2,08,
`m:'dark'` — anel claro sobre planetóide claro some) + treze placas no vão +
treze lascas de talco CLARAS, treze entulhos no chão, treze brasas altas
orbitando a coroa, treze fissuras na barriga, treze espigões de coroa polar;
FACE TREZE-face (13 peças) com caloura ESCURA deitada, aro âmbar da goela no
eixo exato (`COLOSSO_CORE_POS` = centro do aro) e olhos de DISCO CLARO com
pupila de breu (receita invertida: aqui a máscara é escura); os DOIS BRAÇOS de
arremesso penduram na cova do ombro BAIXA (`COLOSSO_ARM_PIVOT` y 3,0, o ombro
do figurino É a constante exportada) e moram todos DENTRO do furo do anel
(ρ ≤ 1,65 vs furo 1,85 — o arremesso não vara as pedras); ASSINATURA = o ANEL
INCLINADO (`COLOSSO_RING_TILT` 0,5, rodando em `COLOSSO_RING_PIVOT` com os três
corpos — matacões, placas, lascas — no MESMO plano inclinado): a inclinação é
DITADA PELA CARA — o arco da frente passa ABAIXO do queixo (y 1,72, com folga
para a goela) e o de trás aparece por cima do ombro (y 3,72); com tilt curto
(0,26) a corrente escura atravessava a cara e o print lia "cesta por cima da
lua"; PALETA = LUA MORTA: regolito claro `#9a95a3` (a pedra mais clara da
família das montanhas — é o que faz a arena ler LUA, não fogueira) + breu
`#2b2636` + veio de magma `#d98c4a` CONTIDO (glow 0,34 × boost 0,62 = 0,21:
com 13 lâmpadas + 13 fissuras + 13 brasas acesas, veio solto lia "lâmpada de
lava") + ametista `#c77dff` HERANÇA do pai Geodo (com veio âmbar na fratura — é
como o print separa filho do pai) + talco `#cfc9d6` (olhos, lascas do anel e o
tambor do tiro); projétil = TAMBOR de treze faces em talco claro com veia FINA
(0,026) e a LÂMPADA de poço sentada na cratera do topo + rastro PONTILHADO de
treze lascas de talco espaçadas 0,22 (COLAR de seixos escuros abraçado no
tambor foi REJEITADO: engolia a silhueta e copiava o anel do dono); pedra clara
no voo exige boost de sky/amb só no material do tiro (`moon: 1,5`) — a key
light da arena é lateral-superior e a face lateral do tambor ficava ESCURA
(mesma lição do boulder do Geodo; `rockA` `#9a95a3` no tiro lia igual ao
matacão do Geodo); impacto = cacos de lua com os física mais PESADA da árvore
(quique 0,15) + anel duplo o mais largo da árvore (magma 3,4·k por dentro +
talco 2,1·k por fora) + PÓ DE LUA (`heat` 0,12: entre a cinza incandescente do
pai Vulcânico 0,65 e o pó morto do pai Geodo 0); coreografia: a janela de
arremesso MAIS LONGA da árvore (1,25 s; windup 0,66 = 0,825 s só com o braço
indo atrás) e TODOS os canais assentam no zero antes do fim da janela;
invólucro medido halfX 2,545 / halfZ 2,315 / minY 0,010 / maxY 4,249 com
formTop 5,6; **221 peças / 40.538 vértices / 23.270 triângulos** e 7 testes em
`src/tests/colossoProgression.test.ts`) — commit `a96bccb`. Anteriores: astral
`488fc40`, vulcânico `e4b4463`, abissal `e38d018`, geodo `8ae1176`, cósmico
`5a11c80`, cristal `f48e789`, névoa/plasma `9d7a881`.

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

**🔥 LINHA NOVA ABERTA EM 14/nov: MODELOS 3D IMPORTADOS.** O usuário vai gerar
GLBs fora do jogo (Hunyuan3D) para as outras espécies; o IGNIS Nv.1 é o
piloto — seção `## 🔥 Ignis Nv.1 de MALHA 3D IMPORTADA` abaixo. O loop da
árvore continua completo; o que muda é o pipeline de figurino a partir daqui.

> **14/nov (2): o ZÉFIRO Nv.1 entrou no molde** (aprovado no navegador do
> usuário na primeira rodada, "ficou muito bom, nada a mudar"). `ZephyrRig`
> despacha Nv.1 = `src/models/wind/wind_model_lvl1.glb` (4,4 MB, 24.662
> verts, export do trimesh a partir de .ply) / Nv.2+ = WindRig. Mesma arquitetura
> do fogo (esqueleto de código `root→spine→head→fin0→fin1`, volumetria do
> figurino no osso spine com a SUCÇÃO da inalação, invólucro por eixo com o
> WIND_FRAG literal do `windShaders` — o fragment do figurino reaproveitado
> palavra por palavra —, motes em espiral + poeira fria do pool, clarão frio).
> O sopro FLUTUA (`FLOAT_Y` 0,34, como o Nv.1 antigo; o do fogo é plantado).
> `MEDIDO.zephyr` intocado (malha escalada 0,73 × 0,62 < 0,9 × 0,88). Lição
> nova: **ao vestir um shader da casa na malha importada, confira o que ele
> LÊ da geometria** — o WIND_VERT exige `aSeed` por VÉRTICE (lição WebKit do
> bound curto: sem `setSeedAttribute` na malha, no iPhone o monstro some) e
> `uv.y` (o trimesh entrega; nem todo export entrega). O giro do invólucro é
> LENTO (uSpin 0,9) de propósito: vórtice rápido alarga a varredura do
> invólucro para fora do anel da pegada. O GLB (4,4 MB) entra no bundle como
> asset — dois modelos = ~7 MB de assets; quando a linha passar de ~3
> modelos, comprimir (KTX2/Draco) ou `import()` por espécie.

> **14/nov (3): o GOLÉM Nv.1 entrou no molde — mas só na 4ª RODADA de prints, e
> a lição é cara.** `GolemRig` despacha Nv.1 =
> `src/models/golem/golem_model_lvl1.glb` (5,7 MB, 24.992 verts, idem: trimesh
> a partir de .ply, SEM ossos e SEM animação) / Nv.2+ = StoneRig (a progressão
> rocha viva → golem → colosso → montanha continua procedural). O print 1 barrou
> o INVOLÚCRO de pedra por cima do modelo + as ESCALAS de osso (incham e derretem
> o chibi); o print 2 barrou as DEFORMAÇÕES — e a correção da rodada 3 (placas +
> máscara dura + um osso por braço) foi APROVADA na forma e REPROVADA no
> arremesso: "agora nem aparecem mais braços" + um "leque escuro" no quadril.
> Diagnóstico que fechou a questão: um **simulador offline de skinning**
> (`/tmp/opencode/golem-sim4.mjs`, replica o skinning EXATO do three —
> `boneMatrix×boneInverse×v`, Euler XYZ — nos 24.992 vértices da malha real,
> frame a frame da coreografia) provou que (a) em repouso o skinning é
> identidade e (b) TODOS os defeitos eram frames de ATAQUE: a malha gerada é
> FUNDIDA (traseira do punho COLADA na nádega — zero vão), então girar osso de
> braço 0,55–0,85 rad ABRE a superfície 0,39–0,57 (30–45 cm) e na carga o braço
> ia PARA TRÁS do corpo (medido: 6% dos vértices do braço visíveis da câmera
> contra 49% no repouso). De regra: **numa malha fundida, quem faz a volumetria
> do ataque é a ROTAÇÃO RÍGIDA do GRUPO (zero deformação); osso filho só dá
> pontinho — o teto do pêndulo do braço medido é ±0,14 rad.** CAPs nos Euler de
> cada junta do corpo (coluna 0,10 / peito 0,08 / cabeça 0,14 / coroa 0,12),
> porque sem cap o ATRASO de torção chegava a 0,68 rad na GARGANTA e a cabeça
> (que não tem pescoço) amassava na própria base. O braço na carga ABRE para
> FORA (`shZ` +0,14), senão afunda atrás do quadril e SOMES da câmera. Osso do
> braço filho da COLUNA (`ARM_PARENT 2`), não do peito: divide a tração da
> junção fundida (o rasgo da carga caía pela metade). Resultados medidos: rasgo
> ≤0,13 (antes 0,39–0,57), dobra global ≤0,13, braço 32%→96% visível no ciclo
> inteiro. Armadilhas do próprio simulador: `rot[i]` com 2 componentes faz
> `eul(...)` receber `undefined` e o log inteiro sai NaN (métrica limpa =
> medida com ruído); `pkill -f <nome>` casa com a linha de comando do PRÓPRIO
> shell que o invoca e derruba sua chamada. Se os próximos modelos gerados
> tiverem os BRAÇOS SEPARADOS do corpo (vão/vinco de verdade), o arremesso volta
> a ter braço independente grande — hoje o teto é da malha, não da coreografia.
> Testes de progressão para as malhas continuam FORA até aprovação visual de
> cada uma (o que há é o `debug-spawn-` + olho do usuário).
>
> **15/nov (4): a NEREIA Nv.1 entrou no molde de primeira no visual — e duas
> armadilhas DA CASA caíram no caminho** (detalhes na seção da Nereia, abaixo).
> (a) O `BloomGate` **amassava** o `onBeforeCompile` dos materiais que patcheia e
> fixava `customProgramCacheKey = () => 'qtBloomEncode'`: na arena — único lugar
> onde o gate roda — o corpo inteiro dos rigs de malha, que MORA no
> `onBeforeCompile` do material, ficava mudo, enquanto no palco do bestiário (sem
> bloom) continuava vivo. É o "no bestiário aparece certo, mas na batalha não" que
> o usuário apontou no aquático e no golém; fogo e vento também estavam mudos
> (só que neles o visual se sustenta no osso + partículas). Conserto: **compor** —
> patch anterior em `userData.qtBloomPrev`, roda primeiro, chave de programa
> COMPOSTA, unpatch DEVOLVE o patch do rig (armadilha do three: o texto do shader
> patcheado não entra na chave do programa e `onBeforeCompile` só roda no MISS do
> cache). (b) O "amarronzado" que o usuário via em TODAS as fases não era a
> pintura da escultora nem a luz do bioma: era o ARO DE EQUIPE no fresnel do
> próprio rig (`TEAM_TINT.player` dourado, EMISSIVO ⇒ imune ao bioma; no palco do
> bestiário não há unidade e cai no `neutral` frio — por isso lá a cor estava
> certa). O caso fechou com duas sondas novas, ambas no acervo:
> `qa/probe-textura-warm.mjs` (a textura do GLB é fria em todas as faixas: 0% de
> pixels quentes ⇒ proibido pintar por cima sem medir) e `qa/probe-tone.mjs`
> (cenário TRAVADO pelo seletor da própria UI, porque o bioma é SORTEADO a cada
> partida; câmera colada no corpo; A/B de luz no mesmo quadro; números lidos dos
> próprios PNG, bloom incluso). Status da linha: **4 de 4 puros com Nv.1 em malha
> importada** (fogo, vento, pedra, água). Bundle: 4 GLB = **15,4 MB** (fogo 2,5 ·
> vento 4,5 · pedra 5,7 · água 3,4) — estourado o limiar de 3 modelos: **dívida
> aberta de comprimir (KTX2 nas texturas 2048² + Draco/Meshopt nas malhas) ou
> `import()` por espécie**; decidir antes de importar o 5º.

**PARADA ATUAL: o loop da ÁRVORE ESTÁ COMPLETO.** Todas as 22 espécies da árvore
têm figurino próprio, rig, projétil-assinatura, FX de impacto e testes de
progressão. O PRIMORDIAL (Nv.10) fechou a árvore com a decisão do BLOOM registrada
no bloco dele (pipeline PERMANENTE no canvas de batalha + só o
`UnrealBloomPass` gateado por primordial vivo + `patchBuiltins` devolvendo
ACES+sRGB aos embutidos no RT + cópia final SEM encode; proibido meter
`OutputPass`). Lição do QA de pipeline: diff de frame inteiro NÃO é sinal limpo
(câmera/tempo/times animam) — o A/B honesto é baseline same-code (`git stash -u`
dos arquivos de pipeline → run → pop → run; no teste do gelo o diff saiu < 1/255,
pipeline pixel-clean; o "piso 30% mais escuro" era o baseline VELHO, pré-`15f1c3e`
da arena grande, não o composer). Se vier trabalho visual novo, é só polimento —
nenhum monstro pendente.

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

### Lições do Colosso (montanha eterna que virou lua — as sete que os prints cobraram)

- **Anel/planeta: as pedras do anel vivem NA TANGENTE, nunca radiais.** O
matacão é um `cyl` deitado com o eixo ⊥ ao raio (`aim([-s,0,c])`) e azimutes
exatos `k·2π/13`; farpa radial virava ouriço. O ρ do anel é APERTADO pela régua
do tabuleiro: ρ 2,08 porque matacão (0,23) + lasca já chegam a 2,4 do halfX 2,6.
As três cintas do anel (matacões, placas no vão, lascas) vivem no MESMO plano
inclinado e giram juntas no pivô exportado (`q = qTilt·qSpin` e o filho vai
para `q(p − pv) + pv` — com pivô ≠ origem, sem isso o tilt jogava o anel para o
lado).
- **A inclinação do anel é DITADA PELA CARA, não pelo gosto**: tilt 0,5 é
medido de trás para frente — o arco da frente tem que passar ABAIXO do queixo
(y 1,72, folga para a goela) e o de trás aparecer POR CIMA do ombro (3,72).
Tilt curto (0,26) punha a corrente escura atravessando a boca: o print lia
"cesta por cima da lua". O print quebrou a corrente ANTES do teste.
- **Anel CLARO sobre planetóide CLARO desaparece; anel ESCURO sobre corpo
ESCURO vira só mancha.** A leitura de Saturno pede matacões `m:'dark'`
contrastando com a pedra clara e a ÚNICA lasca clara (`m:'body'`, talco) deitada
rasteira no ombro do matacão. E **nunca colar de seixos em volta de um tambor
claro no projétil**: no probe a cinta de pedras engolia a silhueta do bloco
(sobrava um caroço de 0,5u) e era a MESMA peça do anel do dono — o olho não
sabia onde acabava o monstro e começava o tiro. Cauda solta ATRÁS em talco
claro, espaçada 0,22 (pontilhada), desenha o rumo sem sujar o tambor.
- **Olhos: o contraste inverte conforme a máscara.** No Astral a máscara era
clara e o olho precisou ser BREU; no Colosso a caloura é ESCURA e o olho é
DISCO CLARO (`m:'body'` + escala achatada) com pupila de breu na frente. Peça
de face CHATA deitada: `r: [1.5108, 0, 0]` (eixo do `cyl` apontando +z) senão
ela fica em pé atravessando a cara.
- **Pedra CLARA some no voo**: o tambor de regolito `#9a95a3` ficou ESCURO no
probe porque a key light da arena é lateral-superior (`keyDir` 7,13,5) e o
tambor mostra ao jogador a FACE LATERAL (nos figurinos o olho lê as faces do
TOPO). Não clarear o `rockA` no figurino nem trocar a pedra do tiro por uma
escura (lia como o boulder do Geodo): `moon: 1,5` multiplica sky/ambient SÓ no
material do bloco. A pedra mais clara da arena É o tiro — é isso que faz o voo
ler lua.
- **O print honesto de um projétil que NASCE DENTRO do corpo** (a goela do
Colosso está em ρ 1,44, dentro do anel em ρ 2,08): o recorte do probe sempre
aparecia atravessado pelas pedras do próprio dono. Ferramenta: `SHOT_HIDE` em
`qa/probe-projectile.mjs` esconde as peças não-instanciadas do dono cuja cor
casa com a lista de hexes dada (os pools `InstancedMesh` nunca são escondidos) e
o frame passa a mostrar SÓ o tiro. `SHOT_BURST=N` repete a janela N vezes (170ms
de passo) para tentar pegar a detonação — mas a extrapolação de velocidade do
probe (~10-15 u/s medidos) erra o tempo de impacto; decisão do usuário: print do
projétil isolado + console limpo BASTAM, não caçar frame de impacto.
- **Identidade em pedra clara = veio CONTIDO e FINO**: com treze lâmpadas +
treze fissuras + treze brasas + goela acesas ao mesmo tempo, glow/boost soltos
lia "lâmpada de lava" (fogueira riscada de laranja). No corpo:
`glow 0,34 × boost 0,62 = 0,21`; no tambor em voo (que ainda recebe o `uCharge`
do motor somando até +1,5 no `pulse`): `0,3 × 0,45 = 0,135` e `crackWidth`
0,026 num tambor de 0,7 de diâmetro. Veio largo serra a pedra; veio fino a veiá.

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
e se compara com o tiro de uma espécie já aprovada; alças por variável de
ambiente: `SHOT_W`/`SHOT_H`/`SHOT_ZOOM` (recorte), `SHOT_LATENCY` (instante do
disparo), `SHOT_HIDE="hex,hex,..."` (esconde as peças do DONO daquelas cores —
os pools instanciados nunca são escondidos; é o único jeito de imprimir
honestamente um tiro que NASCE DENTRO do corpo, caso do Colosso e de sua goela
dentro do anel) e `SHOT_BURST=N` (repisa a mesma janela N×, 170 ms de passo,
para tentar pegar a detonação — a extrapolação do probe não dá o tempo certo de
impacto) ·
`qa/probe-veil*.mjs` / `probe-quad.mjs` (sondas de material/cena) ·
**`qa/probe-footprint.mjs [especie[@nv] ...]`** — a sonda do ENCAIXE: entra no
modo debug, cria as espécies no tabuleiro (default: as pesadas da árvore; aceite
`especie@nv` para os puros) e mede a caixa de cada unidade NA CENA VIVA (só as
malhas do figurino: `hud`/`selring`/`hitbox` ficam de fora). Imprime por unidade
o invólucro **EM MUNDO REAL** (o que o jogador vê: trás/frente, esq/dir, topo, a
partir do centro do slot) e ao lado a medida **AUTHORED** (autoral × escala da
raiz — é essa que alimenta a tabela), com dois vereditos: "no buraco?" (cabe na
célula `QA_SLOT_X_HALF`/`QA_SLOT_Z_HALF`, hoje 2,6 = meia célula de 5,2) e "no
anel?" (cabe em `QA_FOOT_R` = `MONSTER_FOOT_R` 2,5, a regra de projeto). Meta:
tudo SIM + `SOBREPOSIÇÕES de invólucro entre unidades: 0`. Uso padrão já certo:
`node qa/probe-footprint.mjs`. O arquivo `data/footprints.ts` (`MEDIDO`) é a
tabela que nasceu dessas medições — quando um rig muda, rode a sonda e atualize a
linha correspondente. ·
**`qa/probe-framing.mjs`** — a sonda do ENQUADRE e do arraste: (1) projeta o
chão dos 24 buracos e checa com `document.elementFromPoint` se cai no CANVAS —
painel DOM engole o `pointerdown` e o buraco fica sem conserto (meta: "buracos
alcançáveis pelo ponteiro: 24/24"); (2) faz um ARRASTE REAL de fusão no canvas
(mover → abaixar → arrastar → soltar) e confirma que o filho Nv.2 nasce no slot
do ALVO e que o buraco de origem some; (3) entra em combate e verifica os quatro
cards da loja `FECHADA/em combate`. Se o `QA_URL` vazar do shell, a sonda vai
para o servidor morto — `Remove-Item Env:QA_URL` (erro inofensivo se não existir)
e rode sem variável. Prints em `%LOCALAPPDATA%\Temp\opencode\*`. ⚠️ sonda: só
roda o `wheel` de zoom no
centro do canvas — `page.mouse.click` no tabuleiro ANTES do `start-battle`
agarra unidade e hijacks a luta (a sonda dispara um tiro só). Pré-requisito:
`npm run dev` + chromium do Playwright (já instalado). Para o iOS há três sondas
irmãs no WebKit (o motor do Safari do iPhone): `qa/probe-webkit.mjs` (caps +
console), `qa/inspect-webkit.mjs <especie> [aliada]` (o mesmo roteiro do
inspect-species no WebKit) e `qa/audit-bestiary.mjs [chromium|webkit] [saida]
[especies...]` (enciclopédia inteira: printa CADA CARD como o usuário vê, conta os
contextos WebGL da página e cataloga erros do console). Requer
`npx playwright install webkit` (instalado). A quarta sonda roda SEM dev
server: `qa/probe-audio-webkit.mjs [webkit|chromium]` — dois fluxos de autoplay
(resume sozinho vs resume+amostra muda no gesto) com console; cai para Chromium
com gate estrito quando o WebKit não está na máquina. A quinta,
`qa/probe-turbo.mjs [webkit|chromium] [saidaDir]` (dev server + `QA_URL`), é a
sonda do botão de turbo: mede o FAB vivo (só no combate, ciclo 1×→3×→5×→1×,
gradientes, zonas medidas da rail em três janelas — 1200×700, 1280×610 e
390×844 — com o check FAB×loja sem sobreposição) e pincha o conteúdo do
`styles.css` via
`fetch('src/styles.css?raw')` — relativo à página porque o servidor tem base
`/element-merge/`. A sexta, `qa/probe-fog.mjs [webkit|chromium] [saidaDir]`
(dev server + `QA_URL`), é a sonda do fog adaptivo: collector de cena via
`__THREE_DEVTOOLS__` montado com `addInitScript` ANTES do bundle (three só
registra a Scene; a câmera sai de qualquer filho via `o.__r3f.root.getState()`,
a cena com mais descendentes é a da batalha), varre as matrizes de instância
dos ambientes na faixa r∈(R+4, R+104) com −2<y<26 (lua/céu começam a y 32),
projeta na direção da câmera e aponta a PIOR folha (t=1 some no fog) em cada
cenário nas três calibrações — retrato 390×844, desktop-janela-larga 1600×900 e
zoom máximo (empurra a câmera além do teto; o OrbitControls a puxa de volta no
`maxDistance` do cenário = pior caso real). Meta: pior t ≤ 0,55; prints para
aprovação visual. A sétima, `qa/probe-eco.mjs [saidaDir]` (dev server +
`QA_URL`), é a sonda do modo econômico: mede fps REAL via contagem
`gl.info.render.frame` do renderer achado no `__r3f`, dpr efetivo, flags de
`shadowMap.autoUpdate`, o radiogroup do painel Gráficos, o flick de câmera no
combate (o teto de 30 Hz precisa valer TAMBÉM na cauda pós-arraste; no menu
mobile a canvas é coberta pela UI, então a órbita ali não existe para medir)
e — com Chromium emulando UA de iPhone — se o AUTO acende o eco sozinho. O
headless não tem o teto de 60 Hz do vsync: vale a RAZÃO cheio→eco e os flags
exatos. As duas últimas que entraram em 15/nov pagam o pedágio da linha de
modelos importados: `qa/probe-tone.mjs [ice underwater volcanic]` (trava o
cenário pelo seletor da própria UI — o bioma é SORTEADO a cada partida, então
A/B entre execuções sem travar compara BIOMAS, não code —, cola a câmera no
corpo via `controls.target` + `minDistance`, fotografa a caixa delimitadora
projetada e faz A/B de luz no mesmo enquadre; os números saem dos PNG
decodificados no Node, ou seja do quadro COMPOSTO que o usuário vê, bloom
incluso — `readPixels` com `gl.render` na mesma thread desenha o NÃO-composto) e
`qa/probe-textura-warm.mjs [glb...]` (decodifica o PNG do chunk BIN do GLB e dá
a cor média + % de pixels quentes por faixa horizontal: antes de pintar por cima
da cor de um modelo importado, medir a pintura). O viewer do GLB puro (sem arena
nem bloom) é `mesh-viewer.html` + `qa/mesh-viewer-shot.mjs`.

---

## 📏 TAMANHO DOS QUATRO PUROS NORMALIZADO PELA ÁREA DE SILHUETA (16/nov/2026 — rodadas 6+7 do tabuleiro; pendente de aprovação visual no navegador do usuário)

O usuário cobrou duas vezes: "a escala de tamanho deles é muito desproporcional… os monstros devem sempre caber no seu spot" (com o Nv.1 do vento como padrão) e, depois da 6ª rodada, "o lvl3 de fogo está menor que o lvl2". Rodada 6 tentou igualar o RAIO DO ANEL por nível; o print provou que a métrica estava errada: nas formas de corpo comprido no rumo, o max-axis cai na PROFUNDIDADE que a tela quase não mostra — o fogo Nv.3 "enchia 45% do anel" e tinha METADE da área dos vizinhos. Rodada 7 trocou a régua.

- **A métrica é a SILHUETA QUE O OLHO VÊ na fileira**: largura (X do mundo) × altura. Escada de área: Nv.1 = a LARGURA aprovada do sopro do vento (1,24 de mundo, o padrão); Nv.2 ≈ 4,4 · Nv.3 ≈ 6,2 · Nv.4 ≈ 8,5; Nv.5 = cada família sobe ao TETO do buraco (anel r=2,5 com o abraço), sem cortar quem já o enche. O `formTops` de cada espécie (`data/monsters.ts`) é a alavanca — a malha sobe ao degrau no encaixe da família (`s = min(formTop/spanY, MEDIDO/(meia-caixa+abraço))`); `MEDIDO` (`data/footprints.ts`) é assinado no ponto fixo da rig.
- **Rumo 3/4 liberado (aprovação explícita do usuário)**: as formas de corpo comprido no rumo entraram na diagonal para o comprimento aparecer na fileira sem estourar o anel nem esticar altura — fogo Nv.3 (π/2 − 35° ≈ 35° de viés à esquerda) e Nv.5 (−π/2 + 45°, viés à direita), nereia Nv.4 (−35°). A FRENTE continua no +Z do slot (jato/canhão não mudam; a máscara de cara do shader e a boca da névoa são locais ao modelo). `MODEL_YAWS`/`NEREIA_MODEL_YAWS` nos rigs.
- **AABB ROTACIONADA EXATA** nos encaixes dos rigs (`hx·|cos yaw| + hz·|sin yaw|` nos dois eixos do mundo, nos 4 rigs de malha): substituiu a heurística `|sin yaw| > 0,5` da rodada 6, que com rumos 3/4 caía no meio do caminho e assinava o MEDIDO no eixo errado. Com yaw 0 (golém, vento, 3 das 5 formas de fogo/água) a fórmula é o resultado antigo — contrato comum agora.
- **Pinos que a tabela tem que respeitar (testes intocados)**: janela de formTop medida dos testes — água/terra/VENTO têm janela bidirecional `formTop ∈ [maxY_parts − 0,4, maxY_parts + 0,35]` (a nota antiga "vento só piso" estava ERRADA: `windProgression:101-102`); fogo tem só PISO (`maxY ≤ formTop + 0,35`). E o canhão: `board.test:171` pino ESTÁTICO `formMuzzleY(IGNIS,5) > formMuzzleY(IGNIS,1) + 1` ⇒ gap de tops > 2,2222 (o teste vivo `fireProgression:196` é auto-consistente porque o engine cospe de `worldMuzzleY` declarado). Tops ignis [1.89 … 4.18] resolvem os dois (0,45·gap = 1,03).
- **Degraus aceitos (tetos documentados nos comentários)**: nereia Nv.1, golem Nv.2 e golem Nv.3 ficam um dedo abaixo da área-alvo porque o TETO da janela das parts amarra o formTop (maxY + 0,35). A ALTURA do fogo recua em degraus (tocha Nv.2 2,90a → salamandra 2,36a; dragão quadrúpede Nv.5 2,69a) — largura e área sobem sempre; a forma das malhas manda. A área residual do Nv.5 difere (ignis ~10,4 vs nereia ~21,7): anel + abraço 0,13 + quadrúpede baixo é estrutural, não escala.
- **Fits por família** (`min(2,5/(maior MEDIDO + 0,08), 1,15)`): ignis/golem/zephyr 0,87 · nereia 0,96; MED·fit do Nv.5 ≈ 2,42-2,43 encostado no anel.
- **Estado/verificação (16/nov):** `tsc` limpo · `npx vitest run` 504/504 (45 arquivos) NA PRIMEIRA tentativa com a tabela nova · sonda ao vivo das 4 espécies × 5 níveis + a fileira do Nv.1: todas SIM no buraco / SIM no anel, SOBREPOSIÇÕES 0, console limpo. Larguras de mundo Nv.3: ignis 2,52 = nereia 2,52 (antes 1,24); spread de área no Nv.4 = 9%; fileira Nv.1 = 1,12-1,24 uniforme; máximos do Nv.5: ignis 3,94 vs gigantes 4,37-4,83 de largura. Deriva medição×previsão ≤ ~10% (AABB conservadora, direção segura — nenhuma correção multiplicativa no MEDIDO). Prints por espécie e da fileira em `/tmp/opencode/footprint/{ignis,nereia,golem,zephyr,nv1}`; calculadora da régua em `/tmp/opencode/round7-calc.mjs` (fit+u+top+janela resolvidos em conjunto, revalida com a tabela arredondada). FALTA: aprovação visual no navegador do usuário.

---

## 🪨 A ÁRVORE INTEIRA DA PEDRA EM MALHA 3D — Nv.3-5 viram FÉRES (16/nov/2026 — 10ª da linha "modelos 3D"; aprovada no navegador do usuário: "ficou muito bom, pode versionar")

O usuário adicionou o resto da árvore: `golem_model_lvl3/4/5.glb` — Nv.3-5
("golem de pedra" → "colosso de pedra" → MONTANHA MUSCULAR) agora são FÉRES
QUADRÚPENDES importadas (bicho-gorila cabisbaixo, dragão de pedra alado e dragão
de asas abertas com cristais e cauda-martelo; ~25-28 mil vértices, 40 mil
triângulos, UMA malha com UMA textura cada; SEM osso nem animação no arquivo,
caixas baixas e fundas: y 1,98→1,52, z ±0,77→±1,0). O dispatcher `GolemRig`
inteiro vira malha (`MESH_MAX_LEVEL` morreu; o StoneRig só segura o palco no
`Suspense`), `MESH_FIGURINOS.golem = [true × 5]`. A frente (focinho/olhos) está
no +Z local — conferida no viewer offline (`qa/mesh-viewer-shot.mjs`, prints dos
três GLBs em 16/nov) — e a escada veio na ordem CERTA (diferente da água, sem
inversão): `GOLEM_MODEL_YAW = 0` da casa segue.

- **SKIN em três modos** (`ensureSkin(geo, mode, jointY, bandW)`): `head` (Nv.1 —
placa única na cara + capuz de musgo, sem máscara de braço), `body` (Nv.2 —
juntas absolutas lidas na textura + máscara de braço fundido; TODAS as
calibrações das rodadas 1-4 intactas porque o GLB é byte a byte o de antes) e
`beast` (Nv.3-5 — a MESMA loop de placas, mas juntas e faixas em PORCENTAGEM da
caixa de cada malha: `BEAST_JOINT_FRAC` [0→0,92] e `BEAST_BAND_FRAC` [0,16→0,08]
— o molde do `BODY_FRAC` do fogo, pois as caixas mudam entre si e a régua
absoluta do penedo não serve). Sem máscara de braço na fera: quadrúpede fundido
nas patas; os ossos de braço continuam no esqueleto com ZERO vértices de peso de
propósito.
- **ARREMESSO das feras amortecido**: bicho de quatro patas plantado não torce
1,4 rad nem rola como bípede — o grupo carrega só 30% do `twist` (0,72→0,3) e o
rolamento cai a um terço (0,06→0,02). A pedra nasce por TELECINESE na FRENTE DO
FOCINHO (ponto local `(0, min.y + 0,52·spanY, max.z + 0,06)` — como no Nv.1, só
que em altura de fera) e o POUSO passou a ser medido do ponto de partida
(`fly.z0`; a regra antiga, absoluta 2,4 no berço da arena, faria a pedra do Nv.5
sumir no instante em que nasce — spawn z ~2,8 escalado). O taco de rocha engorda
na régua do catálogo (`lvK = formTop ÷ 1,5`: 0,085 no Nv.1 → ~0,24 na montanha)
— senão a pedra do figurino encolheria contra o corpo que cresceu.
- **ENCAIXE — o pior caso da família mudou de dono**: o dragão Nv.5 espalha a
caixa ~±1,0 nos três eixos. `MEDIDO.golem` Nv.3-5 reassinado pela regra da linha
(`s_a·(half + abraço)`, abraço proporcional à caixa): fera 1,33 × 1,08, colosso
2,00 × 2,19 (asas abertas + cauda comprida no eixo profundo), dragão 3,09 ×
3,09. `familyRadius` 1,77 → 3,17 e **`slotFit` 1,15 → 0,79** — a família INTEIRA
encolhe para o buraco, o precedente aceito do fogo (0,72) e do vento (0,82);
world top do Nv.5 fica 4,15 × 0,79 ≈ 3,27. Sonda ao vivo `golem@1..5`: as cinco
SIM no buraco / SIM no anel, maior invólucro em mundo real 2,21 ≤ anel 2,5,
SOBREPOSIÇÕES 0, topo 3,30. O pin de monotonicidade do `board.test` continua
verde (o degrau Nv.2 < Nv.1 é −0,055, tolerância −0,1).
- **Pino de jogabilidade acompanhado**: `earthProgression.test.ts` media o canhão
Nv.1→Nv.5 com metro fixo (> 1) — com o `slotFit` novo dava 0,92. A régua passou
a ser a PRÓPRIA escada do catálogo × encaixe da família (`worldMuzzleY × 0,9`),
o MESMO tratamento que o teste do vento levou quando as asas do dragão encolheram
o `slotFit` dele (7ª entrada).
- **Estado/verificação (16/nov):** `tsc` limpo · `npx vitest run` 504/504 (45
arquivos) · `npm run build` limpo (os cinco `.glb` do golém saem como assets:
5,3-6,0 MB) · sonda de invólucro ao vivo (acima) · spawn dos três níveis novos na
arena via depuração sem erro/warning de console; prints de arena em
`/tmp/opencode/shots-golem/nva{3,4}` mostram a fera plantada, sem rasgo de placa
nem derretimento, e a pedra nascendo na frente do focinho. Teste visual feito no
navegador do usuário e APROVADO ("ficou muito bom, pode versionar").

---

## 🪨 GOLÉM DE MALHA AGORA TEM ESCADA — cabeça no Nv.1, corpo no Nv.2 (15/nov/2026 — 9ª da linha "modelos 3D")

O usuário trocou os GLBs do golém: `golem_model_lvl1.glb` passou a ser **SÓ A
CABEÇA** do Nv.2 (esfera de olhos verdes e musgo no topo, 24.633 vértices) e o
`golem_model_lvl2.glb` é o **corpo completo que antes vestia o Nv.1** — byte a
byte o arquivo antigo (md5 bate com o do commit). Então o Nv.2 ("rocha viva")
saiu do StoneRig e vestiu a malha: `GolemRig` (`src/scene/GolemMeshRig.tsx`)
despacha **Nv.1-2 = mesh** com `<Suspense fallback={<StoneRig level={n}/>}>`;
Nv.3..5 (golem → colosso → montanha) continuam StoneRig. Como o Nv.2 É o
modelo antigo, TODAS as calibrações das rodadas 1-4 (juntas, máscaras de braço,
caps, arremesso-assinatura) valem nele sem tocar em nada.

- **A malha nova (cabeça) tem FIGURINO PRÓPRIO no mesmo arquivo**: a bola não
  tem braços nem pernas — `ensureSkin(geo, headOnly)` pinta tudo no osso da
  CABEÇA (placa RÍGIDA) com o capuz de musgo atrasando na coroa (faixa 0,46→0,58
  da malha); a máscara de braço do corpo NUNCA entra na cabeça (cisalharia a
  face — a mesma lição da cabeça que não tem pescoço). Arremesso: sem punho, o
  taco se solta por TELECINESE da frente da cara (`HEAD_FIST_*`, z 1,12 = fora
  da superfície) e a volumetria é o grupo girando a bola inteira. A cabeça
  BOIA um dedo do chão (`FLOAT_HEAD_Y` 0,05); o corpo continua PLANTADO. O taco
  engorda 18% por nível (0,085 → 0,10 no Nv.2).
- **ENCAIXE mudou de molde — agora é o do zéfiro** (teto de largura pela tabela):
  `fit = min(formTop/spanY, footprintOf/(meia-extensão + abraço))`, abraço 0,10
  do relevo de erosão + respiração (a sonda lê a caixa CPU e não vê o vertex
  shader). `MESH_FIGURINOS.golem = [true, true, false, false, false]` e as duas
  primeiras linhas de `MEDIDO.golem` foram REASSINADAS para as malhas: cabeça
  1,05 × 1,05 (esfera — hoje é ela que aperta o encaixe da forma) e corpo
  0,98 × 0,62 (largo e raso). O pior caso da família continua o Nv.5 (1,69) →
  `familyRadius`/`slotFit` (1,15) e o resto da tabela intocados. ⚠️ A linha do
  Nv.1 antiga (0,75 × 0,63) vinha do penedo de corpo; em perfil de Nv.1 só com
  ESCALA de altura a cabeça derramaria ~0,92 × 0,93 do buraco — por isso a
  tabela é o teto, não a régua antiga.
- **Rumo conferido no viewer** (`mesh-viewer.html` + `qa/mesh-viewer-shot.mjs`):
  os olhos verdes das DUAS malhas estão no +Z local → `GOLEM_MODEL_YAW = 0`
  segue.
- **Estado/verificação (15/nov):** `tsc` limpo · `npx vitest run` limpo (504/504)
  · `npm run build` limpo (os dois `.glb` do golém saem como assets: 5,5 + 5,7
  MB) · `qa/probe-footprint.mjs golem@1..5`: todas SIM no buraco / SIM no anel,
  SOBREPOSIÇÕES: 0, autoral medido 0,94×0,94 (cabeça) e 0,87×0,52 (corpo) —
  dentro das linhas novas com o abraço de folga · spawn dos dois níveis na arena
  via depuração sem erro/warning de console. Ajuste fino de cara (órbita/zoom do
  usuário) por conta do teste visual dele.

---

## 💧 A ÁRVORE INTEIRA DA ÁGUA EM MALHA 3D — Nv.1..5 (15/nov/2026 — 8ª da linha "modelos 3D"; aprovada no navegador do usuário: "já testei e visualmente já está bom, pode encerrar os testes e versionar")

Nereia virou a TERCEIRA família com a árvore inteira na malha importada (fogo e
vento vieram antes — entradas logo abaixo). `NereiaRig`
(`src/scene/NereiaMeshRig.tsx`, reescrito) despacha **Nv.1..5 = mesh**
(`src/models/water/water_model_lvl1..5.glb`; o lvl1 já estava na casa, lvl2..5
novos, 4,5-5,3 MB cada, um mesh/uma textura, SEM ossos) com
`<Suspense fallback={<WaterRig level={n}/>}>`; o `WaterRig` procedural segue
vivo só como fallback de carga.

- ⚠️ **OS GLBs CHEGARAM DA ESTEIRA INVERTIDOS em relação às artes 2D**: o
  `water_model_lvl2.glb` era o DRAGÃO ALADO da arte `water_lvl5_1` e o
  `water_model_lvl5.glb` o AXOLOTL da `water_lvl2_1` (o lvl3 era o draco
  musculoso da arte 4 e o lvl4 o hippocampão da arte 3). Os arquivos foram **RENOMEADOS**
  (lvl2↔lvl5 e lvl3↔lvl4) para casar com a escada da referência: gotinha →
  axolotl → hippocampão → draco → dragão alado. Se a esteira entregar de novo com
  a numeração trocada, é RENOMEAR ARQUIVO — não remapear `WATER_URLS` por cima.
- **Esqueleto nasce em código** (`root→belly→face→shoulder→tip`), pesos de pele
  por faixa de Y com rampas SUAVES (`ensureSkin`, uma vez por geometria — a
  máscara DURA do golém não vale para água, que flui), TODOS os marcos (juntas,
  faixas e cara) leem da bbox de CADA malha na régua porcentual (`BODY_FRAC`:
  juntas 0,0008/0,193/0,5313/0,7851/0,9014, faixas 0,1728/0,4309/0,5827/0,8205,
  meia-rampa 0,0658).
- **O "glow" de água em movimento do Nv.1 (a onda descendo pelo corpo, aprovado
  na rodada anterior) virou o tratamento de TODOS os níveis** — foi o pedido do
  usuário. Diferente do vento e do fogo, a água NÃO ganha casca por fora: a vida
  mora no shader da MESMA malha, com as faixas de corrente/onda em PORCENTAGEM da
  bbox (`uFBase`/`uFModelH` substituíram o −1,0 engessado que só servia à gotinha)
  e a fervura na MESMA medida de mundo em qualquer malha (`uFA = RIPPLE_AMP ×
  SPAN_NV1/spanY`, `SPAN_NV1` = 1,9762 m do Nv.1).
- **FERA DA CARA por nível** (`FACE_BANDS`): a janela (altura × frente +Z, em %
  da bbox) onde a vida da água DESAPARECE — sem ela os olhos tremem e a boca
  "derrete" (a queixa da rodada do golém, mesma causa). Nv.1 é a janela EXATA
  aprovada nos prints da gotinha (y 0,294→0,617, frente 0,376); nos níveis novos a
  cara migra para cima (axolotl 0,52→0,9 · hippocampão 0,58→0,96 · draco
  0,62→0,95 · dragão 0,55→0,9) e os ornamentos (barbatanas, chifres, cristas,
  brânquias de lado) ficam FORA da janela e seguem vivos.
- **Regra `MEDIDO` da linha "modelos 3D"** (a mesma do vento, validada de novo):
  linha da tabela = `s_a·(half + abraço)` com `s_a = formTop/spanY` e
  `WAVE_HUG 0,02` (metro do Nv.1, proporcional por malha; o FOOT_MARGIN cobre o
  resto — a sonda lê a caixa CPU e NÃO vê o deslocamento do vertex shader).
  Nereia: `{0,58;0,58} {1,2;1,2} {1,48;1,39} {1,05;2,12} {2,39;2,32}` — o axolotl
  abre as brânquias pros dois lados, o draco Nv.4 deita a cauda longa no FUNDO do
  buraco (2,12 de profundidade, 1,05 de largura) e o dragão alado Nv.5 é o pior
  caso (2,39): puxa o `familyRadius` 2,21→2,47 e o `slotFit` 1,13→1,01, então a
  família quase não encolhe e a escada autoral sobrevive quase inteira.
- **Ataque escala com o nível** (também pedido): a lança d'água do
  `ProjectileField` vai a `0,8 + 0,45·(n−1)` (0,80→2,60; era 0,80→1,84) e a
  explosão do `Effects` engrossa por nível — respingo `10+3n`, azul `8+2n`, espuma
  `4+n`, anéis molhados no chão `1,5+0,3n` e `0,9+0,24n`, **ANEL NO AR NOVO
  `0,8+0,2n`** (a coroa de respingo no ponto do impacto, espelhando o anel duplo
  do vendaval) e névoa d'água `3+2n` com `size 0,07+0,018n` / `life 0,8+0,12n`. No
  rig: respingo `10+8n`, névoa da boca `4+2n` saindo da frente crua escalada
  (`mouthZ = fit.s × halfZ`) e glow `1,0+0,18n`.
- `MESH_FIGURINOS.nereia` = cinco `true` (`speciesModels.ts`): o pino "a tabela
  de invólucros não envelheceu" do `board.test` PULA figurinos de malha — a AABB
  analítica das peças procedurais não é mais a referência da silhueta; a sonda
  viva é.
- 🛠 **A SONDA MENTIU E FOI CONSERTADA (não reverter)** — duas fontes de leitura
  INFLADA em `qa/probe-footprint.mjs`, ambas dando o falso "NÃO no anel" no
  Nv.4/Nv.5 da nereia:
  1. **PUNCH DE SPAWN**: o `UnitView` faz `scale = fit × punch` e o punch
     ESTOUROU (até 1,25×) nos primeiros 0,45 s do relógio de JOGO; como o overlay
     de descoberta PAUSA esse relógio, o ÚLTIMO bicho spawned é fotografado no
     meio do estouro. A sonda agora espera as escalas baterem na MEDIANA (máx.
     +8 s; bicho morrendo encolhe e fica fora da conta).
  2. **DECORADO ≠ FIGURINO**: o anel de bônus de cenário e os ícones de
     queimadura/lentidão/veneno vivem a `footR + 0,3` DO LADO DE FORA da silhueta
     e entravam na caixa — quase um metro a mais (3,37 em vez de 2,43). Os quatro
     sprites ganharam `name="statusicon"` no `UnitView` e a lista de pulados da
     sonda é `{hud, selring, hitbox, bonusring, statusicon}`: um CONTRATO entre as
     duas pontas, escrito nos dois lados.
  Medida limpa final (`qa/probe-footprint.mjs nereia@1..5`): tudo SIM/SIM,
  SOBREPOSIÇÕES 0, console limpo, escada MONÓTONA (topo mundo
  1,52→2,30→2,88→3,56→4,51; invólucro 0,58→1,21→1,47→2,07→2,43; autoral bate com
  a tabela em ±0,06). A sonda consertada NÃO mexe em veredito já aprovado: zéfiro
  e ignis seguem SIM/SIM com os números de sempre.
- 💰 **Dívida de assets piorou de novo**: 16 GLBs ≈ 68 MB em `src/models` (água
  22, vento 22, fogo 20, golém 5,5). Compressão KTX2/Draco ou import por espécie
  continua em aberto.

---

## 🌪️ A ÁRVORE INTEIRA DO VENTO EM MALHA 3D — Nv.1..5 (15/nov/2026 — 7ª da linha "modelos 3D"; commit `4c20bb8`, aprovada no navegador do usuário: "aprovado, pode versionar")

Zéfiro virou a SEGUNDA família com a árvore inteira na malha importada (o fogo
veio antes — ver a entrada do Ignis logo abaixo). `ZephyrRig`
(`src/scene/ZephyrMeshRig.tsx`, reescrito) despacha **Nv.1..5 = mesh**
(`src/models/wind/wind_model_lvl1..5.glb`; o lvl1 já estava na casa, lvl2..5
novos, 3,7-4,6 MB cada, um mesh/uma textura, SEM ossos) com
`<Suspense fallback={<WindRig level={n}/>}>`; o `WindRig` procedural segue vivo
só como fallback de carga.

- **Esqueleto nasce em código** (`root→spine→head→fin0→fin1`), pesos de pele por
  faixa de Y (`ensureSkin`, uma vez por geometria), TODOS os marcos (juntas,
  rampas, umbigo, barbatanas) leem da bbox de CADA malha na régua porcentual do
  sopro (`BODY_FRAC`) — a coruja Nv.4 é larga/baixa, o dragão Nv.5 cresce de novo.
- **Glow de vento em TODO nível** (o pedido do usuário): casca da MESMA malha
  vestida com o `WIND_FRAG` literal, deslocamento pelo EIXO (lição das
  "rachaduras"), abraço proporcional (`SHELL_HUG 0.12`, régua `SPAN_NV1/spanY`).
  Nv.1 conserva a revolução contínua aprovada (twist 0,8 / spin 0,9); nas formas
  de asas (Nv.2..5) o giro 360° varreria o buraco, então virou **varredura
  oscilante com teto de ângulo** (`SHELL_SPIN`: `uSway`+`uAngMax` no vertex).
- **Regra MEDIDO nova (validada reproduzindo a tabela do fogo)**: linha da
  tabela = `s_a·(half+hug)` com `s_a = formTop/spanY` — assim o encaixe fica
  ALTURA-mandante e a largura morre exatamente na sobra do footprint. Zephyr:
  `{0.84,0.73} {1.49,0.86} {1.97,0.83} {2.65,2.02} {2.96,2.34}` (puxam
  `familyRadius` 1,45→3,04 e `slotFit` 1,15→0,82 — a família encolhe pro buraco,
  como no dragão de fogo).
- ⚠️ **ARMADILHA DE EIXO consertada no fit (não reverter)**: com o bicho virado
  pra +Z (yaw 0 — os cinco modelos do vento e do fogo nascem assim), a
  envergadura é o X do modelo = X do mundo; o código antigo do `fit` pareava
  `foot.x` com o Z da caixa — e isso capava a ALTURA pela sobra errada: no print
  da sonda o Nv.3 saía MENOR que o Nv.2 (escada invertida). `halfAlong` agora é
  o Z do modelo em yaw 0 (e o X quando sideways). **O `IgnisMeshRig` commitado
  tem o mesmo pareamento trocado** (o fogo desenha MENOR que a tabela promete; o
  look foi APROVADO assim — trocar exige aval novo do usuário, ficou devendo).
- Ataque escala com o nível: lâmina do `ProjectileField` em `0.9+0,45·(n−1)`
  (0,90→2,70) e explosão zéfiro do `Effects` engrossada por nível (anel duplo de
  ar, anel de chão maior, mais partículas/fumaça).
- `MESH_FIGURINOS` (`speciesModels.ts`): o pino "a tabela de invólucros não
  envelheceu" do board.test PULA figurinos de malha — a AABB analítica das peças
  procedurais não é mais a referência da silhueta; a sonda viva é.
- Pinos re-ancorados: o degrau do canhão Nv1→Nv5 do windProgression agora é a
  PRÓPRIA escada `worldMuzzleY` (o `slotFit` encolheu com as asas; um metro
  absoluto envelheceu). E o smoke do App (VERMELHO desde o HEAD, não é desta
  rodada): `AdaptiveFog` é filho do `<Canvas>` no App e chamava `useThree` no
  mock da fiber → `GLBoundary` engolia a cena; `vi.mock('../scene/AdaptiveFog')`
  no app.test (mesmo critério do BattleScene/BloomGate).
- Sonda: `qa/probe-footprint.mjs zephyr@1..5` — tudo SIM/SIM, SOBREPOSIÇÕES 0,
  console limpo, escada MONÓTONA (topo mundo 1,74→2,23→2,66→3,24→3,85; X
  0,62→1,15→1,46→1,92→2,41). Suite 507 verdes + build.
- 💰 **Dívida de assets piorou**: 10 GLBs ≈ 41,4 MB no bundle (compressão
  KTX2/Draco ou import por espécie continua em aberto).

---

## 🔥 A ÁRVORE INTEIRA DO FOGO EM MALHA 3D — Nv.1..5 (15/nov/2026 — 6ª da linha; commit `96035a5`, aprovada no navegador: "ficou muito bom pode versionar" — esta entrada do HANDOFF tinha ficado devendo)

`IgnisRig` (`IgnisMeshRig.tsx`) despacha os CINCO níveis na malha importada
(`src/models/fire/fire_model_lvl1..5.glb`), fallback procedural só na carga.
Mesmo molde do Nv.1 piloto: esqueleto em código + pesos por faixa de Y, marcos
por bbox porcentual, invólucro de chama abraçando (hug proporcional), coreografia
`attackPose` idêntica. Os dragões Nv.4/5 abrem asas: `footprints.ignis`
`{0.82,0.68}…{3.41,2.2}` puxam `familyRadius` 3,49 e `slotFit` 0,72 — o dragão é
LARGO, não alto. Projétil e explosão escalam por nível. (Detalhe conhecido hoje:
o pareamento de eixos do `fit` herdou a inversão descrita na entrada do vento
acima — o fogo desenha menor que a tabela; look aprovado assim, mexer exige aval.)

---

## 💧 NEREIA Nv.1 DE MALHA 3D IMPORTADA + onda descendo pelo corpo (15/nov/2026 — 5ª da linha "modelos 3D", aprovada no navegador do usuário: "o efeito ficou muito bom" / "ficou ótimo")

Quarta malha da linha (mesmo molde de Ignis/Zéfiro/Golém): `NereiaRig`
(`src/scene/NereiaMeshRig.tsx`) despacha **Nv.1 = mesh**
(`src/models/water/water_model_lvl1.glb`, 3,4 MB, 20.860 vértices, UMA textura
2048², bbox local y −1,00..+0,97, **SEM ossos e SEM animação no arquivo**) com
`<Suspense fallback={<WaterRig level={1}/>}>`; **Nv.2+ = WaterRig** inteiro (a
progressão gotinha → maré → tsunami segue procedural, intocada).
`speciesRigs.ts` troca `nereia: WaterRig` por `NereiaRig`.

- **Encaixe**: `fit` escala para o `formTop` Nv.1 e PLANTA no chão;
  `NEREIA_MODEL_YAW = 0`. `MEDIDO.nereia[0]`: 0,51 × 0,50 → **0,58 × 0,58**
  (autorais 0,57 × 0,56 medidos por `qa/probe-footprint.mjs` na malha escalada —
  a gotinha procedural era mais magra).
- **Material**: `MeshStandardMaterial` + `map` do GLB, `roughness 0,42` /
  `metalness 0,06` (molhado: o brilho é o fresnel da receita, não metal falseado)
  e `onBeforeCompile` vestindo a casa dentro do modelo novo: o WATER_VERT do
  figurino nas MESMAS escalas (`uFSwell`/`uFBend`/`uFSurge`, `gfrac` = fração da
  **ALTURA LOCAL** da malha — 1,977 — porque usar o `formTop` do mundo comprime a
  fração e a metade de cima fica CONGELADA, sem gradiente vertical) e as ONDAS
  BRANCAS no **DIFUSO**, não só no emissivo.
- **A onda tem de morar no difuso** (lição que custou três prints): o figurino é
  um shader OPACO e a receita dele SUBSTITUI o albedo
  (`col = mix(col, uFoam, waves·foamAmt)`); sobre a textura azure CLARA da malha,
  só emissivo não se lê. `vANer` (o `vAng` do figurino) entrou no varying para a
  onda QUEBRAR AROUND o corpo em vez de descer em faixa horizontal perfeita; a
  cara fica de fora da vida do shader (`vFaceMask`: y −0,42..0,22 e z > 0,3).
- **Dosagem na malha ≠ dosagem no figurino** (mesma fórmula, leitura outra): a
  gota ocupa ~90 px de tela e a crista estreita `smoothstep(0,0→0,13)`/
  `(0,13→0,30)` do figurino + ondinhas `ribMask × 0,35` viravam LISTRAS DE
  CÓDIGO DE BARRA. Na malha: crista `0,0→0,18` / `0,18→0,42`, ondinhas `× 0,18`,
  `WAVE_AMT 0,55` (0,65 estourou as cristas), `GLOW_REST 0,15` /
  `GLOW_CHARGE 1,1`, `RIPPLE_AMP 0,05`.
- **Esqueleto de código** (`ensureSkin`, o GLB não traz nenhum): 5 juntas
  `root→belly→face→shoulder→tip` com `NEREIA_JOINT_Y [-1, -0,3, 0,02, 0,34, 0,7]`
  e bandas SUAVES (`TRANS_Y [-0,66, -0,15, 0,15, 0,62]`, `RAMP_HALF 0,13`) — a
  gota é MOLE: squash/stretch mora no osso `belly` e rampa larga é o acerto aqui,
  o OPOSTO do golém (pedra: dobra estreita). Esqueleto por instância, geometria
  com pesos compartilhada (`geo.userData.nereiaSkin`), `frustumCulled = false`.
- **Coreografia = a MESMA partitura do figurino**: `WaterRig` exportou
  `AttackPose`, `attackPose`, `WATER_WINDUP` e `makeSprayGeo` e a malha dança
  com eles (puxão + achato na carga, estico + gotas em arco na liberação, morte
  escorre); gotas/clarão no pool compartilhado.

### ⚠️ ARMADILHA DA CASA QUE A MALHA EXPÔS — o BloomGate AMASSAVA o shader do rig (conserto vale para as quatro malhas e qualquer rig futuro; NÃO reverter)

Sintoma reportado pelo usuário: **"no bestiário aparece certo, mas na batalha
não"** (ele viu no aquático e no golém; fogo/vento também estavam mudos — só que
neles o visual se sustenta no osso + partículas + emissivo da textura, então
ninguém notou). Causa em `src/scene/BloomGate.tsx`: `patchOne` fazia
`p.onBeforeCompile = (shader) => {…}` **trocando** a função do rig pela dele e
fixava `customProgramCacheKey = () => 'qtBloomEncode'`; e o `unpatchBuiltins`
ainda `delete p.onBeforeCompile` (ligar/desligar o bloom matava o monstro em
definitivo). Fatos do three (r16x) que explicam o estrago:

- a chave do programa é `shaderID + parâmetros + customProgramCacheKey()` — o
  **texto** do shader patcheado NÃO entra na chave — então chave fixa cola dois
  rigs diferentes no MESMO programa;
- `onBeforeCompile` **só roda no MISS** do cache de programas (three.cjs ≈
  30408); `Material.copy()` não copia `onBeforeCompile`.

O gate só roda na ARENA (é o palco do bloom) — o palco do bestiário não tem
BloomGate, logo o patch do rig sobrevivia lá. Conserto: **compor, nunca
amassar** — o patch anterior do material vai para `userData.qtBloomPrev`
(`PREV_KEY`), roda PRIMEIRO dentro do patch do gate (o gate só mexe em
tonemapping/colorspace do fragment), a chave vira
`chaveDoRig + '|qtBloomEncode'` e o unpatch **DEVOLVE** o patch do rig. Prova na
cena viva: antes, 46 programas no renderizador da arena e **zero** com o patch do
rig; depois, `userData.shader` presente e `uFT` avançando nos três (ignis 2,49 ·
golém 1,77 · nereia). jsdom não tem WebGL, então o contrato está pinado no fonte
em `src/tests/renderSettings.test.ts`. Consequência visual esperada: golém volta
com a veia de magma na batalha e ignis/zéfiro ganham a vida de shader no corpo
que nunca tiveram na arena.

### ⚠️ "Amarronzado" não era a escultora — era o ARO DE EQUIPE (lição de método: medir antes de pintar)

O usuário apontou um tom cáqui no corpo que "permanece em todas as fases". A
primeira tentativa (esfriar o albedo quente no fragment, uniforme `uFWarm`) foi
**no-op medido** e foi apagada. Motivo: `qa/probe-textura-warm.mjs`
(desenvolvedor de PNG embutido no chunk BIN do GLB, sem dependency) mostra a
textura **FRIA em todas as 10 faixas** — média ~(75,182,207), `r−b` entre −110 e
−151, **0% de pixels quentes**. O quente vinha do próprio rig, no fresnel:
`uFTeam * pow(1−ndv, 2,2) * 0,3` com `uFTeam = TEAM_TINT.player = #f5c451`
(dourado). Isso fecha o caso todo: é **emissivo**, então ignora a luz do bioma
(igual em todas as fases); some no palco do bestiário porque lá não há unidade e
o tint cai no `TEAM_TINT.neutral` (`#c8dcff`, frio); fogo/vento não denunciam
nada (dourado sobre laranja/pálido); e no figurino opaco de base azul-**escura**
o aro largo lia como luz de contorno, enquanto na malha PBR clara — barriga
gorda quase sempre quase de perfil para a câmera — o expoente 2,2 banhava metade
do corpo (dourado por cima de azure = cáqui). Emenda em
`NereiaMeshRig.tsx`: `RIM_POW 4,2` (aro apertado na silhueta) + `RIM_COOL 0,78`
de mistura para `vec3(0,70, 0,90, 1,00)` + `RIM_DOSE 0,34` ⇒ jogador fica
**menta**, IA **lavanda** (a identificação de equipe continua; água
Fresnel-reflete o céu da arena, não a lanterna da equipe). Se o aro dourado
largo incomodar em bioma frio no **golém** (pedra marrom: lá é característico), é
a mesma alavanca no `GolemMeshRig`.

### QA de tom que fica na casa (as duas sondas novas)

- `qa/probe-tone.mjs [ice underwater volcanic]`: **TRAVA o cenário** pelo seletor
  da própria UI (Configurações → 🌄 Cenário → `[data-testid="scenario-<id>"]`)
  porque o bioma é SORTEADO a cada partida (`resolveArenaScene` usa
  `Math.random`) — A/B entre execuções sem travar compara BIOMAS DIFERENTES e não
  code. Cola a câmera no corpo (`controls.target` = unidade + `minDistance 3`),
  fotografa o recorte da caixa delimitadora projetada e faz A/B de luz no MESMO
  enquadre (point mais quente apagada / trocada por branca / todas as point
  lights apagadas). Os números saem dos PNG decodificados no Node: é o quadro
  COMPOSTO que o usuário vê, bloom incluso — `readPixels` na arena engana, porque
  `gl.render(scene, camera)` na mesma thread desenha o NÃO-composto. Resultado do
  caso: pixels quentes do corpo 2% → **0%** (Gélido) e 1% → **0%** (Subaquático).
- `qa/probe-textura-warm.mjs [glb...]`: calor da pintura por faixa horizontal
  (obrigatório antes de tocar na cor de um modelo importado).
- Viewer do GLB puro (sem arena/bloom): `mesh-viewer.html` na raiz +
  `qa/mesh-viewer-shot.mjs` — abre em `http://localhost:5173/element-merge/mesh-viewer.html`;
  separa "o modelo" de "o pipeline".
- Nota de ferramenta (poupando a próxima rodada): o **chrome-devtools MCP presta
  para DOM/offline** (foi assim que o SW/PWA foi atestado) mas o Chromium dele vem
  **SEM WebGL** (`webgl1:false webgl2:false`, só WebGPU) ⇒ o jogo cai em
  `gl-missing` e ele não gruda no Chrome do Windows do usuário (sem endpoint de
  debug remoto). Para cena 3D: Playwright com
  `['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']`.
  Acesso à cena viva nas sondas: `window.__THREE_DEVTOOLS__` (EventTarget
  registrado em `addInitScript`) → o scene tem `__r3f.root.getState()` com
  `{gl, scene, camera, controls}`.

**Estado/verificação (15/nov):** `npx tsc --noEmit` limpo; `npm run build` limpo
(6,3 s; o GLB aquático entra como asset de 3,4 MB); suíte 45 arquivos / 505
testes / **500 passando**, 2 falhas CONHECIDAS (as duas smoke de `app.test.tsx`:
jsdom não tem WebGL ⇒ cai no `gl-missing`), 3 skipped. `qa/probe-footprint.mjs` e
`qa/probe-front.mjs` consertados para Linux (perfil limpo SEMPRE abre o tutorial:
`[data-testid="tutorial-skip"]` é obrigatório; fechar o bestiário antes de medir;
flags `QA_*`). Nenhum teste de progressão escrito para a malha (a regra da linha
"modelos 3D": pino só depois de a linha pegar de vez).

**Fora da linha do modelo (infra de teste, vai em commit próprio):** Node ≥22
instala um GETTER global `localStorage` (o webstorage experimental) que devolve
`undefined` sem `--localstorage-file`; no jsdom do vitest
`window === globalThis === document.defaultView` (sondado), então o getter
sombreia o storage do jsdom e **107 testes caíram de uma vez** (persistência,
save, roster, UI). `src/tests/setup.ts` agora instala um storage em memória
**quando o ambiente não entrega um** (em Node mais velho nada roda). A casa só usa
`getItem/setItem/removeItem/clear` (medido por grep).

---

## 🪨 GOLÉM Nv.1 de MALHA 3D IMPORTADA + arremesso-assinatura (14/nov/2026 — 4ª rodada, aprovada no navegador do usuário)

Terceira malha da linha "modelos 3D" (mesmo molde do Ignis/Zéfiro): `GolemRig`
(`src/scene/GolemMeshRig.tsx`) despacha **Nv.1 = mesh**
(`src/models/golem/golem_model_lvl1.glb`, 5,7 MB, 24.992 vértices / ~40 mil
triângulos, UMA textura 2048², export trimesh de .ply, **SEM ossos e SEM
animação no arquivo**) com `<Suspense fallback={<StoneRig level={1}/>}>` (o
figurino procedural segura o palco enquanto o GLB carrega); **Nv.2+ = StoneRig**
inteiro (a progressão rocha viva → golem → colosso → MONTANHA MUSCULAR segue
procedural, intocada). `speciesRigs.ts` troca `golem: StoneRig` por `GolemRig`.

- **Encaixe**: `fit` escala para `formTop` Nv.1 = 1,5 e PLANTA no chão (o penedo
  não flutua, diferente do zéfiro); meia-envergadura escalada ~0,63 × 0,37 <
  `MEDIDO.golem` (0,75 × 0,63) → `footprints.ts` intocado. Frente da malha =
  +Z (confirmado amostrando a textura: todo pixel verde-olho em z > 0) →
  `GOLEM_MODEL_YAW = 0`. Braço que arremessa = `-X` local (`THROW_SIDE -1`; se
  o print apontar o braço errado, vira a constante).
- **Material**: `MeshStandardMaterial` + `map` do GLB e `onBeforeCompile`
  vestindo a casa dentro do modelo novo: relevo de erosão do STONE_VERT ao
  longo da normal (seguro aqui: malha OPACA de face única — a lição das
  "rachaduras" valia para a CASCA dupla), respiração do monólito (×1,014),
  veios de magma na escala LARGA com `uFGlow = base × (VEIN_REST 0,22 +
  charge × VEIN_CHARGE 2,4)` (apagado parado, ACENDE carregando — o "embrulho"
  de renda de lava do print 2 saiu), bioluminescência do musgo/olhos
  (verde-dominante da textura) e flash branco de dano.
- **Esqueleto de código** (`ensureSkin`, o GLB não traz nenhum): 6 PLACAS
  raiz→quadril→coluna→peito→cabeça→coroa com juntas LIDAS DA TEXTURA
  (`JOINT_Y [-1, -0,62, -0,2, +0,12, +0,34, +0,76]` — a garganta em +0,34: o
  penedo NÃO tem pescoço, cabeça em +0,62 amassava a pedra da cabeça) e bandas
  ESTREITAS `BAND_W [0,14, 0,14, 0,14, 0,2, 0,1]` (rampa larga = osso manda em
  meio corpo e a pedra amassa — causa nº 1 do print 2; dobra estreita cai em
  cima da linha de rachadura que a própria textura desenha); BRAÇO = lobo
  RÍGIDO com UM osso por lado (`ARM_NEG 6` / `ARM_POS 7`, filhos da COLUNA,
  `ARM_PARENT 2`) e máscara dura `armBlend` (rampa |x| 0,46→0,51 + teto e chão
  INCLINADOS lidos da silhueta + cápsula 0,28/0,34 da linha ombro→punho). A
  máscara é o que a sonda (`/tmp/opencode/golem-skin.mjs`) atesta: pesos somam
  1,0000; peso de braço zero em perna/solado/cabeça/coroa; 364/377 vértices do
  punho com peso pleno do osso.
- **ATAQUE = ARREMESSO DE ROCHA** na MESMA janela do figurino
  (`STONE_ATTACK_WINDOW 0,52` / carga até `STONE_WINDUP 0,44`; `attackPose`,
  `STONE_WINDUP`, `makeChipGeo`, `CHIP_VERT` e `CHIP_FRAG` exportados do
  StoneRig para a malha dançar o MESMA partitura de relógio — mas com ângulos
  próprios, ver cabeçalho RODADA 4): a torção de 1,39 rad mora no GRUPO
  (rígida, zero rasgo) e o punho varre ~1 unidade; osso do braço em ±0,14;
  `shZ` +0,14 ABRE na carga (visibilidade da câmera) → −0,10 FECHA na
  liberação; CAP por junta (`cap()`); morte desaba o penedo RÍGIDO (grupo
  afunda/inclina; sem wilt grande em osso). O TACO de rocha nasce no punho
  LOCAL do osso (`ARM_FIST` ±0,29/−0,57/−0,02 — o repouso do mundo não mudou
  com o reparent para a coluna, então a origem continua correta), material do
  figurino com o aro da equipe (`TEAM_TINT`), poeira da mão + nuvem dos pés +
  lascas (`makeChipGeo`) tudo no pool compartilhado.
- **Aprovado visualmente em 14/nov** ("ficou ok, mas está bom por enquanto" — o
  usuário aceita o teto atual e quer seguir para os próximos modelos). Nada de
  testes de progressão para as malhas experimentais.
- **Sondas**: visual via `debug-spawn-golem` (testid do card do bestiário; o
  card E a arena renderizam a malha) + Ctrl+Shift+R antes de avaliar. Se mexer
  em pose/máscara/osso de novo, **não voltar ao print-cego**: o simulador
  offline mede rasgo/dobra/visibilidade antes (`golem-sim4.mjs` roda em ~3 min
  com variantes `CUR/A/E/F/G` no rodapé).

## 🔥 Ignis Nv.1 de MALHA 3D IMPORTADA + invólucro de chama (14/nov/2026 — piloto da linha "modelos 3D")

Pedido do usuário: trocar o figurino procedural do **Ignis Nv.1** ("faísca")
pelo mesh texturizado que ele criou fora do jogo (`src/models/fire/
fire_model_lvl1.glb`, ~2,5 MB, 21.451 vértices, UMA malha com UMA textura,
gerado no Hunyuan3D — **SEM ossos e SEM animação no arquivo**). Nv.2+ continua
o FlameRig normal. O resultado foi aprovado no navegador do usuário ("ficou
excelente"); é EXPERIMENTAL e serve de molde para os GLBs das outras espécies
que o usuário vai gerar. Branch: trabalho segue em `dev`.

**Peças:** `src/scene/IgnisMeshRig.tsx` (novo: dispatcher + esqueleto + shader
+ invólucro), `speciesRigs.ts` (`ignis: IgnisRig`), `flameShaders.ts` (brasas
compartilhadas: `makeEmberParticles`/`makeEmberGeo`/`EMBER_VERT`/`EMBER_FRAG`
migraram do FlameRig — comportamento idêntico), `FlameRig.tsx` (exporta
`attackPose`/`AttackPose`/`ROLE_LOOK`/`ATTACK_WINDOW`; embers importados do
compartilhado). `FlameRig` continua o fallback durante o load do GLB e o rig
de Nv.2+.

**A forma em camadas (o que o usuário aprovou, nesta ordem de feedback):**
1. malha texturizada com `emissiveIntensity` base **1,0** e `emissiveMap` =
   própria textura ("o brilho ficou muito bom");
2. crina de fogo no VÉRTICE do material (`onBeforeCompile` + ruído de
   `flameShaders`): cada ponta do leque com FASE PRÓPRIA (fase = azimute em
   torno do eixo) — mollejo em 2 harmônicos, línguas que alongam/encolhem,
   dobra radial, grão de brasa CORRENDO PARA CIMA, e as pontas piscam emissivo
   (`vHair` no frag). Abaixo de y local 0,42 é SÓLIDO: rosto/olhos firmes;
3. ESQUELETO EM CÓDIGO (o GLB não traz nada): `root(−1,0) → spine(−0,15) →
   head(0,30) → hair0(0,42) → hair1(0,72)` (`JOINT_Y`), pesos de pele por
   FAIXA de Y com 2 influências/vértice (`ensureSkin`, rampas suaves, o rosto
   < 0,28 NUNCA herda osso da crina); follow-through real: `hair0` amostra a
   coreografia de ataque **70 ms** e `hair1` **140 ms** no passado;
4. VOLUMETRIA DO ANTIGO nos ossos: o `spine` carrega a FÓRMULA EXATA de
   stretch do FlameRig (flick de 3 harmônicos 5,7/11,9/2,3 + `surge` lento) e
   o XZ espreme em contrafase — escala de grupo nenhum passa essa contrafase;
5. ENVOLTÓRIO DE CHAMA (o feedback vencedor, "o novo envolto das
   características do antigo"): uma CASCA da mesma malha vestida com o shader
   do FlameRig (cores `ROLE_LOOK`, fervura que NASCE NA BASE e CORRE para o
   topo, gradiente de calor e alfa do antigo), aditiva/`depthWrite:false` por
   cima da textura — o rosto lê ATRAVÉS do véu; sem ossos próprios, cola no
   beat do osso `spine`; `uAmp` base 0,11, folga 0,13, `uAlpha` base 0,55.

**ENCAIXE:** modelo escalado para `formTop(ignis,1)` = 1,95, base no chão,
centralizado; `MODEL_YAW = 0` (orientação aprovada nos prints). O invólucro da
malha (~0,68 × 0,53 de meia-envergadura) é MENOR que o `MEDIDO.ignis` da
faísca (1,01 × 1,27) — `slotFit`/buracos/HUD seguem sem tocar em
`data/footprints.ts`. Se um GLB futuro for MAIOR que o `MEDIDO` da espécie, a
regra da casa continua: sonda `qa/probe-footprint.mjs` + atualizar `MEDIDO`.

**Lições duras (não re-aprender):**
- **Import de GLB no Vite: `import url from '...glb?url'` + `useGLTF(url)` do
  drei + `useGLTF.preload(url)`** no corpo do componente. Não precisa de
  `assetsInclude` (o `?url` resolve sozinho); o build emite o `.glb` como
  asset com hash. O card do bestiário é uma janela do palco compartilhado
  (`BestiaryStage`/`View` do drei), então o Nv.1 de malha também aparece lá e
  a animação de demonstração é o `demoAttackSeq` — o dispatcher trata os dois
  canais de ataque (`lastAttackAt` do motor + `demoAttackSeq` do bestiário).
- **Deslocar casca AO LONGO DA NORMAL rasga pontas finas:** nas pontas da
  crina as duas faces empurram para lados opostos, viram na quina e nascem
  "rachaduras" (linha escura no lip da dobra) — as duas faces DA MESMA ponta
  têm sinal trocado e os harmônicos do ruído não se cancelam ali, só se somam.
  Fix: folga + fervura ao longo de um EIXO suavizado (`pos − centro(0,−0,15)`
  com y espremido ×0,3) — as faces andam juntas e a ponta ainda cresce para
  cima (gesto de língua de fogo). No figurino procedural antigo isso nunca
  apareceu porque as peças eram GROSSAS; a lição da casa ("o shader desloca
  vértice ao longo da normal") vale para peça grossa, não para casca de malha
  finíssima (também é o oposto exato do fix do Colosso: lá o anel pedia
  matacões NA TANGENTE; aqui a casca pede eixo radial suavizado).
- **Osso com `position` animado na mão: o valor de repouso SEMPRE entra na
  conta** — o `root` descansa em y −1,0 (`JOINT_Y[0]`), e escrever
  `bone.position.y = oscilação` no `useFrame` arranca o esqueleto inteiro do
  lugar. Padrão: `b.root.position.y = JOINT_Y[0] + osc`.
- **Esqueleto é POR INSTÂNCIA; a geometria (com os pesos) é compartilhada.**
  `ensureSkin` roda uma vez por geometria (pino `geo.userData.ignisSkin`), mas
  cada unidade cria o SEU `SkinnedMesh` + `Skeleton` — dois Ignis em cena
  nunca dançam sincronizados. `skinned.frustumCulled = false` (crina + shader
  viajam além da esfera da malha).
- **Não dispor a textura do `useGLTF`** — ela é do cache compartilhado do
  drei; dispose só os materiais por instância + `skeleton.dispose()`.
- **HMR não recompila material three** com `onBeforeCompile`/`ShaderMaterial`
  (já era armadilha da casa; aqui pega EM CHEIO: sem Ctrl+Shift+R o usuário
  vê o shader velho e o feedback vira fantasma).
- **`*:Zone.Identifier`**: os GLBs que o usuário baixa/generated no Windows
  trazem o stream alternativo NTFS junto; `.gitignore` agora cobre
  `*:Zone.Identifier`.
- jsdom não carrega viewer 3D, então a suíte não exercita o caminho do GLB;
  quem valida o visual é o laço de prints/console (o dev server + spawn do
  bestiário) — `npx tsc --noEmit` + `npm run build` cobrem o resto.

**Estado/verificação (14/nov):** `tsc` limpo; `npm run build` limpo (o `.glb`
sai como asset de 2,5 MB; chunk único de ~1,78 MB já era assim antes); suíte
505 testes com as falhas CONHECIDAS do ambiente local Node 26 (as 2× smoke do
`app.test.tsx` WebGL/jsdom + a contaminação de timers de música no
`audioUnlock.test.ts` — "expected 2 to be 1"; as duas isoladas passam:
rodadas separadas 64/64). Nenhum teste novo escrito (a casa pinça teste de
progressão DEPOIS de aprovado visualmente; aqui a aprovação foi no navegador
do usuário e é experimental — pinos vêm quando a linha "modelos 3D" pegar de
vez). Nada de `MEDIDO` tocado.

---

## 🧬 Prévia de fusões do arraste (12/nov/2026 — NÃO reverter)

Segurar uma criatura **em cima de uma aliada** abre um painel DOM que persegue
o ponteiro/toque e lista TUDO que aquela criatura pode fundir naquele nível:

- **linha 1** — `arrastada + alvo = resultado` do "se eu soltar agora". Essa
  linha é SEMPRE revelada (miniatura 3D + nome), mesmo espécie inédita: levar a
  criatura até a parceira é o que compra a prévia (a árvore continua selada na
  enciclopédia). Par que NÃO funde → linha com ✕ + o motivo legível
  (`FUSION_MSG[reason]`).
- **resto** — as outras fusões da criatura na mão, no MESMO nível dela. O par já
  mostrado na linha 1 não se repete; parceira e resultado ainda não descobertos
  entram como no bestiário: `???` + silhueta escura (`SpeciesRig locked`) na
  caixa pontilhada.
- **nunca cobre os monstros** — o painel escolhe entre quatro apoios (direita,
  esquerda, acima, abaixo) o que cabe na janela E tapa menos os corpos na tela
  (`RAIO = 62 px` em volta do ponteiro, do slot mirada e do corpo flutuante que
  vai na mão), com um custo de troca para não tremer no meio do gesto. É
  `pointer-events: none`: o botão flutuante de venda continua vendo o chão pelo
  `elementFromPoint` do `BattleScene`.

Regra ÚNICA de "o que funde": `mergeOptionsFor(espécie, nível)` em
`fusionRules.ts` pergunta para o próprio `checkFusion` (nada de tabela paralela
de receitas), e `mergeOptions.test.ts` confere equivalência de conjunto com
`checkFusion` nas 23 espécies × 10 níveis.

Telas do arraste ficam no store — `dragScreen` (ponteiro), `dragTargetScreen`
(slot mirada) e `dragCarriedScreen` (o corpo que vai na mão, em
`UNIT_BASE_Y + DRAG_LIFT + 0.6`). Quem PROJETA é o `BattleScene`, porque só a
cena vive dentro do `<Canvas>`; o painel é DOM e não enxerga three. `DRAG_LIFT`
passou a ser exportado do `UnitView` (o lift é o que muda o corpo de lugar na
tela durante o arraste).

Miniaturas 3D: `MergeStage` + `MergeThumb` — um **único** canvas WebGL (o teto
de contextos do iOS) recortado em janelas pelo `View` do drei, montado só
enquanto `dragId !== null` (z 36 o painel, z 37 o palco). Reusa `SpeciesRig` e
`Turntable` do `MonsterViewer` e `ClearBuffer` do `BestiaryStage`.

---

## 🗑 Venda por arraste: botão flutuante (12/nov/2026 — NÃO reverter)

A venda NÃO é mais um filete no dock (a "lixeira" da loja media ~200×30 px, ficava
no canto oposto ao polegar e sumia quando a loja dobrava). É agora um **FAB de 72 px
(52 px no compacto) que só existe enquanto o jogador segura uma criatura**:

- `src/components/SellFab.tsx` monta dentro do bloco `inGame` do `App` e devolve
  `null` quando `sellValue(espécie, nível) === 0`, quando a criatura na mão é do
  lado inimigo ou quando ela está `dying` — fora do arraste não há botão na tela.
- **Pulso**: `@keyframes sell-breath` (2,6s, escala 1 → 1,075 + halo dourado).
  Quando o arraste para em cima dele, `data-hot='true'` encurta
  `animation-duration` para **0,62s** e acende o disco em ouro→fogo; o chip troca
  `+{reembolso}` por **`solte`**. `prefers-reduced-motion`: sem pulso, o hot
  continua legível por cor/borda.
- **Não se clica**: sem `onClick`, `tabIndex={-1}`. Quem detecta "o dedo está em
  cima" é `BattleScene.isOverSellFab` → `document.elementFromPoint(...)` +
  `closest('[data-sell-target]')` (no arraste por toque o canvas captura o
  ponteiro, então `pointerenter` não existe). Soltar em cima cai no `endDrag` do
  store, que vende e devolve `sellValue` (Nv.2 = 2×Nv.1, híbrido = 2× o nível).
- **Z 38**: acima do HUD/dock (20) e dos FABs de navegação (35,40), acima da
  prévia de fusões (36) e do palco dela (37) — durante o arraste os três convivem
  e o alvo da venda tem que estar por cima do que o arraste mostra (a prévia é
  `pointer-events: none`, então não engole o hit-test do botão).
- **Zonas medidas** (`qa/probe-sell-fab.mjs`, `deviceScaleFactor: 1.5`):
  - ramo largo → `right: 14px; top: calc(50% - 36px)` (centro na metade da
    altura). Medições: 1373×749 → x 1284..1362, y 336..413; o rail ESQUERDO já
    está tomado (livro em 14..86 no meio da altura, turbo em 50%−150).
  - compacto `(max-aspect-ratio: 17/10), (max-width: 760px), (max-height: 560px)`
    → `right: 10px; top: calc(164px + env(safe-area-inset-top))`, 52 px. No
    compacto o meio da borda direita É tabuleiro/loja: 1280×610 (paisagem, porém
    curto) mede `.battle-controls` em y 544..598 e a loja sobe para y 324; em
    390×844 o botão fica em x 326..382, y 162..218, abaixo da HUD (y 8..60),
    acima da loja (y 641) e na MESMA altura do turbo (outro lado da tela).
  - Regra inegociável conferida pela sonda nos três tamanhos: **nenhum dos 24
    buracos pode cair em cima do botão** — se caísse, apontar ali acenderia a
    venda e soltar VENDIA a criatura em vez de pousá-la.
- Glifo: `SellIcon` em `src/components/icons.tsx` (lixeira com uma moeda entrando
  — vender devolve moeda), em `currentColor` como os outros (`BookIcon`,
  `ClockIcon`, `CoinIcon`).
- `isOverSellBin` → `isOverSellFab` (renomeado junto); os comentários que diziam
  "lixeira" no store/`DropSpot`/`Effects`/`MergePreviewPanel` agora falam do botão
  de venda. A aba **Regras** das configurações (`SettingsMenu`) foi reescrita para
  descrever o FAB (o teste pincha `'custou para existir'`).
- Testes: `src/tests/ui.test.tsx`, describe *Botão flutuante de venda* (8
  cenários: some fora do arraste, `data-sell-target` + `tabIndex -1`, inimigo na
  mão não arma, `dying` não arma, valor do Nv.2, `data-hot` + chip `solte`, venda
  real devolvendo moedas, sair de cima cancela). `SellFab` entrou no `renderAll()`.
- Sonda nova: `qa/probe-sell-fab.mjs` → 34 checks SEM FALHAS (pulso 2,6s → 0,62s
  medido por `getComputedStyle`, `elementFromPoint` no centro do FAB resolvendo
  para o alvo, 24/24 buracos livres nos três tamanhos, venda real nos dois
  cenários, console limpo). Ela também tem marcos em stderr + relógio de bordo:
  sem isso um hang da sonda chegava sem stack nenhum.

---

## 🎓 Tutorial da luvinha (12/nov/2026 — NÃO reverter)

A primeira partida do jogador novo é guiada por uma **mão de luva** que ensina os
cinco primeiros gestos, e **nenhuma outra jogada é liberada** enquanto ela não
terminar. Feito depois do pedido do usuário e corrigido por ele: a luva
**ilustra**, quem joga é o jogador.

**Os cinco passos (`TUTORIAL_STEPS` em `src/game/tutorial.ts`):** `escolher`
(toque no card destacado da loja) → `inpecionar` (toque no monstro **em cena**
para abrir os status) → `comprar` (compre OUTRO IgNIS) → `arrastar` (arraste uma
criatura SOBRE a outra) → `vender` (arraste até o botão dourado). O passo
seguinte fecha o anterior; o último encerra.

**Arquitetura em três camadas, sem ciclar:**

- `src/game/tutorial.ts` é a máquina de passos **PURA** — sem React, sem three,
  sem localStorage. Guarda `TUTORIAL_STEP_DEF` (frase, `action`, `target`,
  `mime?`, `delayMs`, `rules`) e a régua `gateTutorial(step, kind, {species})` +
  `tutorialBlockMsg`. É a única fonte do "o que pode neste passo".
- `src/store/gameStore.ts` **aplica e avança**: `allowTutorial(kind)` chama
  `gateTutorial` em cada ação que muda a partida (`summon`, `beginDragCandidate`,
  `beginTapCandidate`, `endDrag`/drop, `sell`, `startBattle`, `spawnDebugUnit`),
  e `tutorialPlayDone(kind)` só é chamado pela jogada REAL do jogador. Estado no
  store: `tutorialStep`, `tutorialDone`, `tutorialReplay`, `tutorialPrompt`.
- `src/components/TutorialHand.tsx` **só desenha** (faixa + luva + aro +
  fantasma). Nunca chama ação do store.

**Mímica ≠ jogada (a correção que o usuário cobrou).** O `TutorialMime`
(`{ de, ate }`) faz a mão percorrer o trajeto **em loop**, sem tocar no store:
o componente só escreve `transform`/`opacity`/`data-fase` na `<div>` da luva
(`apontar|espera|pegar|carregar|soltar|voltar`, durações `MIME = {pegar 750,
carregar 950, soltar 850, voltar 750}`). Nos passos 4 e 5 o passo só fecha com o
`drop`/`sell` verdadeiro do jogador — os testes pinam que durante a mímica
`dragId`/`pendingDrag`/`sellHover` seguem `null` e criaturas, buracos e saldo não
se mexem.

**A luva virou sprite (13/nov — pedido do usuário).** O glifo deixou de ser SVG
desenhado no código: `GloveIcon` é agora um `<span>` que recorta a folha
`src/assets/tutorial-glove-sheet.png` (3 frames lado a lado — punho fechado →
mão abrindo → indicador apontando — em 648×216, importada pelo Vite), e o
**pedido foi animar os 3 frames**: `luva-frames` no styles.css gira o recorte em
loop via `background-position-x` + `steps(1,end)`; parado, o recorte mostra
sempre o frame de apontar (o glifo pequeno da faixa e da pergunta). As fases da
mímica **casaram com os frames**: `pegar` fecha/abre o punho
(`luva-pegar-frames`), `carregar` atravessa a tela de punho fechado (carga não
se aponta), `soltar` abre o indicador em cima do destino. A PONTA do dedo no
frame de apontar mora em **(85.3%, 11.4%) do recorte** — `TIP_X`/`TIP_Y` no
`TutorialHand` ancoram esse pixel no alvo, o `transform-origin` do pulso é o
mesmo ponto, e a sonda mede a ponta por essas duas frações (antes: 13,5% do
SVG). `prefers-reduced-motion` congela frames e pulso no frame de apontar.

**Luva sem pulo entre passos (13/nov — pedido do usuário).** O
`<TutorialLuva>` não é mais remontado por passo (o `key={step}` saiu): um ref
`ultimaRef` guarda a última posição que a mão ocupou e o efeito reaberto do
passo novo apanha a mão ali — nos passos de apontar o lerp de posição (dt×7) já
faz o trajeto; nos de mímica um deslize de entrada (`guia`, ~650 ms de
`TRANSICAO_MS`) leva a mão até a origem do loop, e passado o intervalo o
trajeto manda sozinho, sem atraso. O reinício da mímica a cada passo continua
garantido pelos deps do `useEffect` (o `t0` nasce do carimbo do rAF), não pela
remontagem. O primeiro passo ainda nasce no alvo (a mão não estava em lugar
nenhum antes).

**Marcas de ensino (tudo `pointer-events: none`, nada engole ponteiro):**

- `.tutorial-aro` — anel pontilhado no buraco de DESTINO da fusão (passo 4).
- `TutorialFabFantasma` — aro no MESMO lugar onde o FAB dourado nasce no
  arraste; reaproveita a classe `.sell-fab` do styles.css, então herda a geometria
  e as regras de mídia do botão real (52 px no compacto, mesma borda direita).
  Id/seletor: `TUTORIAL_FAB_ALVO_ID = 'tutorial-fab-alvo'` / `TUTORIAL_FAB_ALVO`.
- Z-index dos overlays: aro **64**, faixa **65**, luva **66**, pergunta **75**
  (todos acima do FAB de venda, que é 38).
- Quem projeta mundo→tela é `src/scene/worldToScreen.ts` (extraído do
  `BattleScene`, que é quem vive dentro do `<Canvas>`; a luva é DOM).

**Barreira e recados.** O tutorial é a ÚNICA fase que barra jogada fora do rota.
Regra de fusão que ditou os passos: dois puros **diferentes** Nv.1 NÃO fundem
(`CROSS_FUSION_MIN_LEVEL = 5`) — por isso o passo 3 compra OUTRO IgNIS (iguais:
Nv.1+Nv.1 → Nv.2), e o arraste ensinada é `TUTORIAL_SRC_TILE = 1` sobre
`TUTORIAL_DST_TILE = 0`. **🎓 UMA pressionada de dedo, UM recado:** `UnitView`
abre candidato de toque E de arraste na mesma teclada, e como a UI tem **um slot
de toast só**, as duas barreiras juntas apagariam a mensagem boa (a que diz o
passo). Então `pressaoSeq`/`recadoDestaPressao`/`toqueDestaPressao` fecham a
segunda reclamação do mesmo gesto (a jogada continua barrada; a pressionada
seguinte volta a avisar). O `drop` está fora disso (dispara no `pointerup`).

**Cofre intocado (moeda virtual).** O tutorial monta a arena com
`max(save.coins, TUTORIAL_COINS)` e **nunca escreve no save**: `summon`, `syncUi`
e `returnToMenu` pulam a gravação de moedas enquanto `tutorialStep !== null`.
`TUTORIAL_COINS = 500` cobre as duas invocações (2×100) e ainda deixa a venda
dar reembolso. Por isso não existe máquina de snapshot/restore.

**Sempre começa vazio, devolve o time guardado no fim.** `startTutorial` limpa a
arena; se já existe time guardado, `play()` abre antes a pergunta
(`TutorialPrompt`, `tutorial-prompt-go/no`) — nunca apaga nada sem perguntar, e
quem recusar entra direto com `tutorialDone = true`. No fim, `closeTutorial` só
chama `startNewMatch()`: como o cofre nunca foi tocado, o time volta **nos
mesmos buracos** (a sonda mede `x7.8 z3.1` de volta). A despedida chega
`TUTORIAL_FAREWELL_DELAY_MS = 1500` depois e só se o tutorial continua fechado —
senão ela atropelaria o recado da venda (`… vendido — +N moedas`), que é a
recompensa do passo. O texto depende de `save.retainedRoster.length` ('Loja e
combate liberados — bom jogo.' quando não há time guardado).

**Persistência e repetição.** `tutorialDone: boolean` no save (v12; save antigo
não tem o campo → `!!parsed.tutorialDone` = falso, tutorial roda). Marcado em
`startTutorial` E quando o jogador recusa a pergunta. Repetir: Configurações ▸
Progresso ▸ **Repetir tutorial** (`tutorial-replay` → confirm →
`tutorial-replay-go`), que também começa com a arena vazia e por isso pede
confirmação.

**Três armadilhas de implementação que custaram horas de sonda:**

1. **Câmera travada só nos passos com mímica** (`CameraController`):
   `cameraTravada = tutorialStep !== null && TUTORIAL_STEP_DEF[step].mime !==
   undefined`, no `enableRotate={!dragActive && !cameraTravada}`. É
   concorrência pura: quem pega a criatura é o `pointerdown` da cena 3D, que só
   escreve no store — o `enableRotate={!dragActive}` do frame seguinte chega
   tarde, o OrbitControls já embolsou o gesto e a câmera gira junto com o dedo. O
   destino foge da tela no meio do arraste e a fusão não sai. Fora desses dois
   passos (e depois do tutorial) a órbita é livre.
2. **O card de status fecha na entrada do passo de arraste**
   (`set(next === 'arrastar' ? { tutorialStep: next, selectedId: null } : …)`).
   No layout compacto (≤900px) o `.inspector` é uma folha CENTRADA sobre a arena
   (regra do styles.css: na lateral ele brigaria com a loja) — em 390×844 ele
   mede 16..374×285..560 e os buracos vão de y 334 a 548, ou seja, o card aberto
   engole os 24 buracos. O jogador leu os status no passo 2 e pode reabrir quando
   quiser.
3. **Relógio da animação = o carimbo da própria frame do rAF**, nunca
   `performance.now()` para `t0`: em alguns ambientes as origens são diferentes
   (jsdom marca a frame desde a navegação, Node desde o processo) e misturar os
   dois fazia a mímica nunca começar.

**Faixa que não tapa nada.** `posicionarFaixa` mede a própria caixa, testa **7
apoios** (acima do dock, abaixo do HUD, cantos esquerdo/direito em ambos os
níveis, último recurso no rodapé) e escolhe por custo
`fora×60 + tapa×10 + pisa×18 + i×1,5`. Os buracos vêm da projeção da cena
(raio derivado do espaçamento real na tela, então vale em qualquer zoom); o
botão de venda **real ou o fantasma** entra como obstáculo sólido (`solidos`,
`.sell-fab`) — senão a faixa sentava em cima do FAB dourado exatamente na hora
da venda no celular.

**`prefers-reduced-motion`:** o CSS mata pulso/respiração e a luva **fica parada
em cima do destino** do gesto (`semMovimento` via `window.matchMedia`); o aro e o
fantasma continuam ensinando o resto.

**Testes e sonda:**

- `src/tests/tutorial.test.tsx` — **20 testes**, incluindo o describe *A luva
  ilustra, quem joga é o jogador* (faz o `registerWorldBridge` falso projetar,
  roda frames de rAF de verdade e exige `data-fase` chegar em `carregar`+`soltar`
  enquanto nada é arrastado/fundido/vendido) e *uma pressionada de dedo barrada
  dá UM recado*. Rodar com `--localstorage-file` **novo** a cada execução (arquivo
  reaproveitado vaza `settings` e causa falso negativo).
- `qa/probe-tutorial.mjs` — **90 checagens, 0 falhas** (`QA_OUT=/tmp/opencode/
  tutorial node qa/probe-tutorial.mjs`, ~4 min). Cobre: arena vazia na primeira
  vez, os 5 passos com a mímica e o gesto real, 24/24 buracos livres no passo 1,
  4 e 5 e depois do tutorial (desktop e retrato), aro/fantasma coincidentes com o
  FAB real (`1323,374.5` vs `1323,374.5`; retrato `354,190`, 52 px), ponta do
  dedo a ≤1 px do destino, cofre intacto, time de volta no mesmo slot, repetir
  tutorial reesvazia a arena, pergunta com save, ordem dos recados. Três
  utilitários que consertaram falsas culpas do jogo: `cenaQuieta()` (só lê
  posição quando a cena para de mexer — depois de um drop recusado a criatura
  VOLTA VOANDO para o buraco, e ler nesse instante faz o `mouse.down` cair no
  vazio e virar órbita de câmera), `arrastar()` que promove o arraste com um
  primeiro movimento de `(+14,−8)` e devolve se o FAB dourado armou (sem isso o
  gesto foi órbita, não arraste, e a sonda culpa a si mesma) e `frenteEm()`
  (`elementFromPoint` no corpo da criatura antes de pegar).

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
4. **NaN na cena HDR → quadrado preto via bloom (corrigido em 03/nov — NÃO
   reverter).** Report do usuário no iPhone: "o monstro inteiro e seus ataques são
   quadrados pretos". A causa NÃO era pipeline/msaa/clear/blend — era o JATO do
   Primordial escrevendo NaN: `along = vUv.y` passa de 1,0 em ULPs (interpolação
   perspectiva), `pow(1.0 - along, 1.35)` com base negativa é **INDEFINIDO em GLSL
   (= NaN no ANGLE/D3D11 e no Metal do WebKit)**, e `if (a <= 0.002) discard` é
   FALSO pra NaN — o texel podre PASSA e escreve. Seis texels bastam: o highpass
   do bloom os pesca e CADA borrão da escada de mips MULTIPLICA a mancha (6 → 91 →
   912 → 6.992 → 48.096 → 309.132 texels), o compósito somatório do
   `UnrealBloomPass` devolve pro buffer da cena e a cópia final **amostra NaN como
   preto puro** — um retângulo sólido de exatos 560x556 px (a caixa do mip
   contaminado), meio eixo-alinhado, que nenhum scissor/viewport/blit explica.
   Corrigido na RAIZ (clamp do `along` + discard invertido `if (!(a > x))` — NaN
   não passa em NENHUMA comparação — no `JET_FRAG`/`DISK_FRAG` do
   `PrimordialRig.tsx`; o anel `exp(-pow(d,2.0))` virou `exp(-d*d)` porque pow de
   base negativa é indefinido mesmo com expoente inteiro) e de CINTO no composer:
   o pass de resolve do multisample virou `SANITIZE_SHADER` (cópia + zero de
   não-finito + teto 65504 = máx do HalfFloat), no primeiro
   leitura-depois-da-cena do pipeline, gateado junto com o bloom. A/B no MESMO
   frame doente (mesmos uniforms, só o shader do slot trocado): rt2 NaN 311.360 →
   0. Mediações: `probe-nansource.mjs` cena NaN 0/20 tentativas;
   `probe-frozen.mjs` 0/14 blocos; `probe-blackfix.mjs none` 0/20 blocos;
   `audit-bestiary webkit` CONSOLE 0; e o usuário confirmou no navegador.
   Curiosidade medida: com `NoBlending` o ANGLE **clampa** o fragment output
   não-finito na escrita; é com `AdditiveBlending` (o caso do jato) que o NaN
   fura pro buffer float. Pino estático (jsdom não roda WebGL): os três testes
   `?raw` no fim de `primordialProgression.test.ts` (discard ao natural proibido,
   base de pow clampada, `SANITIZE_SHADER` + `samples: 4` no composer). As sondas
   que carregam a lição ficaram em `qa/`: `probe-nansource.mjs` (congela o
   composer e caça o autor do NaN por ablação/bissecção com uniforms parados),
   `probe-frozen.mjs` (leitura float exata de cada buffer da cadeia + print do
   frame congelado), `probe-blackfix.mjs` (A/B de bloco preto no print por
   variante do pipeline), `probe-blockshape.mjs` (geometria do retângulo em
   qualquer PNG, offline). Locais com pow de subtração SEM clamp, auditados e
   LATENTES (sem NaN medido; o cinto só roda com o quasar vivo): `waterShaders.ts`
   (ndv cru em `pow(1.0 - ndv, …)`), `flameShaders.ts:93`, `windShaders.ts:108`,
   `lightningShaders.ts:329`, `iceShaders.ts:136` — ao mexer nesses rigs, clampar
   antes do pow é a regra. (**04/nov: todos clampeados**, ver lição 5 abaixo.)
5. **Zéfiro: anéis e lâminas pretos no iPhone (04/nov — NÃO reverter).** Print do
   usuário no iOS: os anéis (toros) e as lâminas cônicas ("espinhos") do zéfiro
   desenhavam PRETO. O site é exatamente um dos LATENTES acima — `windShaders.ts`
   com `pow(1.0 - abs(dot(normalized…)), 1.5)`: em face de frente o `abs(dot)`
   estoura 1.0 em ULPs → base negativa → NaN no Metal → o discard ao natural é
   FALSO pra NaN → texel podre escreve → bloom amplifica → preto. Sanado em
   FAMÍLIA (11 bases de pow clampeadas: wind, water, flame, lightning×2, ice×2,
   stone, sand, wood, steam; 5 discards invertidos: wind, lightning×2, steam e
   o dos estilhaços em `WindRig.tsx`). Pinos estáticos novos em
   `windProgression.test.ts` (`?raw`, padrão dos do primordial).
   **Medição nova que muda o QA:** `probe-powsemantics.mjs` prova que o WebKit E
   o Chromium do Windows (ANGLE/SwiftShader) CLAMPAM `pow(base<0, fracionário)`
   para 0.0 — `step(c,c)=1`, o discard ao natural nem dispara. O NaN preto é
   EXCLUSIVO do Metal do iPhone; nenhum gate daqui (console 0, print headless,
   injeção de eps com `probe-windnan.mjs` via `__QT` — a malha continua
   colorida) consegue reproduzir ou confirmar esta classe de defeito. A defesa
   local é o pino ESTÁTICO; a confirmação visual vem do aparelho do usuário.
   **Regra de casa nova: backtick NUNCA dentro de comentário de template literal
   GLSL** — ele fecha a string JS e o build quebra (`esbuild: Expected ";"`);
   ao escrever lições no texto desses shaders, use aspas simples.
6. **Som mudo no iOS: destravamento do áudio reescrito (05/nov — NÃO
   reverter).** Report do usuário: no iPhone o jogo inteiro mudo (efeitos e
   trilha), no desktop funciona. Dois defeitos da política de autoplay do
   WebKit em `audio/core.ts`:
   - `resume()` sozinho DENTRO do gesto: no iOS a promessa resolve e o
     contexto **CONTINUA suspenso** — o WebKit só libera a porteira quando
     uma fonte TOCA dentro do gesto. Corrigido com `warmUp()` em core.ts:
     fonte `AudioBufferSourceNode` de 1 amostra muda disparada no próprio
     gesto (pointerdown OU touchend — iOS 9–11 só destravavam no touchend),
     o destravamento clássico do iOS; em Chromium é supérfluo, mas inofensivo.
   - Estado **'interrupted' EXCLUSIVO do WebKit** (chamada, Siri, app em
     segundo plano): o código antigo só olhava 'suspended' e nunca reabria
     depois de uma interrupção → mudo para sempre. Corrigido: `statechange`
     no contexto (o ready sai do estado REAL, nunca de palpite); `resumeCore()`
     exportado — sfx/música tentam reabrir em todo `playFx`/`tick`/`playMusic`
     com o bus morto (destravado o autoplay UMA vez, o iOS dispensa gesto
     novo; resume DURANTE a interrupção RECUSA com InvalidStateError —
     capturado; insistência fora de gesto throttada em 300 ms, o gesto jamais
     é bloqueado); `visibilitychange` reabre a aba escondida.
   - Corolário da porta: o contexto agora só nasce **dentro de gesto**
     (unlockAudio); `playMusic`/`playFx` só leem o core (`getCore`) — criar
     AudioContext fora de gesto era o que o iOS antigo punia com suspensão
     eterna. A faixa do menu fica "desejada" e acende no `onAudioReady`.
   - Seguro de contadores: se o `onended` falhar (histórico do WebKit com
     `start(t0, offset, dur)`), o teto de vozes (26 sfx / 32 música) trava e
     o jogo INTEIRO emudece — `track()`/`count()` liberam a voz também por
     timeout (5 s / 12 s; nenhuma voz do sintetizador passa disso).
   - **Chave física de mudo do iPhone não tem conserto em código**: com ela
     ligada o WebKit silencia até o Web Audio (no Android o volume vai no
     bus de mídia). Aviso adicionado em Configurações → Som.
   - Verificação local: `src/tests/audioUnlock.test.ts` (6 testes) com
     AudioContext fake na **política do WebKit** — resume sem warmUp NÃO
     abre o contexto, interrupted recusa resume e o statechange reacende o
     ready sem gesto novo, touchend rearma; pinos estáticos `?raw`: sfx e
     música jamais chamam `ensureCore`, core contém warmUp+touchend+
     'interrupted'. A sonda do motor, `qa/probe-audio-webkit.mjs`, rodou no
     WebKit headless (libs via `sudo npx playwright install-deps webkit`,
     05/nov): Web Audio presente (sr 44100) e **CONSOLE 0 nos dois fluxos**
     (so-resume vs resume+amostra muda). Medição honesta: o headless **não
     reproduz o gate do iOS** — lá o contexto abre sozinho sem gesto. A
     sonda vale como saúde de API/console no motor; quem pincha o contrato
     do iOS é o fake da política nos testes. **Confirmação no iPhone do usuário: FEITA em 05/nov** — o som funcionou
     perfeitamente no aparelho após o deploy (`d720741` no GitHub Pages).

---

## 🔋 Modo econômico + pipeline de preview da branch dev (novidade de 05/nov/2026 — NÃO reverter)

Report do usuário: "em dispositivos com bateria, ela está drenando muito
rápido". O diagnóstico do pipeline (medido por sonda, ver abaixo) apontou cinco
freios pesados: dpr 2 no iPhone (4× os pixels), shadow map 2048² recalculada em
TODO frame (até no menu, onde a ilha é estática), `frameloop` sempre a 60 fps,
bloom via compositor (RT HalfFloat MSAA + escada de mips ≈ 6 passes fullscreen)
e ~3 mil instâncias de vegetação sombreando sem nunca entrar na caixa de sombra.
A resposta é o **modo econômico**, ligado sozinho em aparelho de bolso pelo modo
AUTO, com override manual em Configurações → Gráficos.

- **Detecção (`src/game/perf.ts`, puro e testável):** `perfMode` persistido
  `'auto' | 'full' | 'eco'` (default auto; parse tolerante no save) → o store
  resolve `ecoActive` (`handheldNow()` uma vez por sessão: UA
  iPhone/iPad/iPod/Android; iPadOS moderno entrega pelos múltiplos pontos de
  toque + pointer grosseiro quando o Safari o disfarça de Mac). A ação
  `setPerfMode` espelha nos dois; a UI (aba Gráficos) reaproveita o grid
  `diff-btn` com hint explicativo e o pino vivo `perf-eco-active`.
- **As alavancas do eco** (no modo cheio o jogo continua idêntico ao de sempre):
  1. **dpr** do Canvas: `[1, 1.25]` (era `[1, 2]`) ≈ 39% dos pixels no iPhone;
  2. **frameloop `'demand'` + `src/scene/EcoHeartbeat.tsx`** — o canvas só
     renderiza quando `invalidate()`; o batimento a 30 Hz mantém a cena viva
     (metade do frame). ARMADILHA achada na sonda: o showcase `autoRotate` do
     menu disparava `'change'` no OrbitControls a cada giro, que invalidava o
     frame e derrubava o teto (menu eco media 62 fps em vez de 30) — no eco o
     auto-rotate do menu dorme (`autoRotate={menuMode && !ecoActive}`).
     ARMADILHA 2 (cobrada pelo usuário no desktop: "leve ficou a 60 fps"): a
     INÉRCIA do OrbitControls (`enableDamping`, factor 0,08) continua
     emitindo `'change'` depois que o dedo SAI da tela, e cada 'change'
     revalida o canvas demand — a sonda mediu **53,5 fps na cauda de 2 s
     pós-arraste** no combate (o teto só valia com a cena parada). No eco a
     damping morre (`enableDamping={!ecoActive}`): câmera 1:1 com o dedo e
     cauda nenhuma — re-medido **28 fps**. FATO do menu mobile: a canvas fica
     COBERTA pela UI do menu (elementFromPoint entrega `.menu-card` em todo
     canto), então a órbita do menu não existe e a sonda mede o flick no céu
     aberto do tabuleiro em combate;
  3. **motor** (`useGameDriver`): `setInterval` de 30 Hz no eco (dt real, mesmo
     teto 0,05 s) no lugar do rAF de 60 Hz;
  4. **bloom**: o COMPOSER INTEIRO sai do caminho no eco (`BloomGate`:
     `useComposer = !QA_NO_COMPOSER && !ecoActive && …`) — não adianta só zerar
     a intensidade; o RT HalfFloat MSAA + a escada de mips é que pesam;
  5. **sombras**: no eco, `gl.shadowMap.autoUpdate = false` em MENU (no jogo
     volta; `needsUpdate = true` uma vez a cada troca de tela/cenário —
     `BattleScene`) e `mapSize 1024²` no eco (prop `eco` na Lighting,
     renasce por `key` ao trocar de modo — mudar mapSize em luz viva não
     recria o buffer);
  6. **CSS**: eco desliga o `backdrop-filter` dos painéis sobre o canvas
  (blur por cima do 3D é caro no iOS; `--panel` já é 0,82 de opacidade).
- **Desbaste de vegetação só no eco** (mesmo PRNG com seed, mesma distribuição
  de raio — só a contagem cai; anéis de horizonte NÃO mexem, são a silhueta):
  floresta mata 96→63 + arbustos 110→73; gelo árvores 32→21 (o ângulo usa
  `treeRing`, senão o anel ocuparia só ⅔ da circunferência) + rochas 82→54;
  vulcão rochas 140→92; subaquático rochas 128→84 + corais 42→28 + algas
  58→38. Floresta mantém as 58 rochas e os 36 troncos distantes.
- **CORREÇÃO GERAL (fora do eco também, visual idêntico)**: castShadow REMOVIDO
  da vegetação que nunca esteve na caixa de sombra (`SHADOW_BOX = ARENA_R×1,15
  ≈ 26,6`): muralha da floresta (troncos/copas/raízes/galhos r 86+, distant r
  110+), anel de gelo (r 32+) e cumes (53+), árvores do entorno vulcânico
  (31–43) + montanhas do horizonte (75+), monumentos subaquáticos (31–41) e
  recifes distantes (61–83). Elas só desenhavam milhares de instâncias no passe
  de profundidade sem sombrear nada visível. Rochas/agulhas/coral do PERTO da
  ilha continuam projetando.
- **Verificação:** `src/tests/perf.test.ts` (22 testes: detecção pura com UA
  injetada, pinos de fiação em App/BloomGate/BattleScene/Lighting/driver/
  camera/sw e os tags `instancedMesh` com/sem castShadow por cenário);
  `qa/probe-eco.mjs [saidaDir]` mede o VIVO (WebKit render real + Chromium
  emulando UA de iPhone): cheio menu 511 fps headless → **eco menu 28 fps**,
  dpr efetivo = clamp(window dpr, eco 1,25), `shadowMap.autoUpdate` false no
  menu eco / true no combate eco, voltar ao cheio sobe o fps ≥1,4×, UA de
  iPhone acende o eco SOZINHO (`data-eco='on'` no shell), radiogroup funciona
  (`perf-eco-active` some no cheio, aparece no eco) e a sonda FLEXIONA a
  câmera no combate (arraste na canvas, `camDelta` ≈ 40) medindo a cauda de
  2 s pós-soltar: **53,5 → 28 fps** com a damping morta no eco — **CONSOLE 0**
  (os avisos `GL Driver Message / GPU stall due to ReadPixels` são do readback
  do próprio Playwright nos screenshots, filtrados: não são do jogo). ⚠️ o
  headless não tem o teto de 60 Hz do vsync: lá 'cheio' sai com centenas de
  fps; no iPhone real cheio=60, eco≈30 — a sonda confere a razão (eco ≤
  0,85×) e os flags. `probe-fog` e `probe-turbo` reconfirmados verdes; a sonda
  do turbo agora monta um time de 3 ignis (um ignis sozinho morria antes do fim
  do ciclo e derrubava o clip do FAB; a ordem spawn→descoberta→spawn foi
  consertada com o overlay fechado entre spawns).
- **🔋 Rodada de 05/nov (2) — "melhorar ainda mais" (a cobrança do usuário:
  "investigue se é possível melhorar ainda mais a otimização").** O diagnóstico
  achou dois freios ainda vivos no eco (o modo cheio continua byte-idêntico):
  1. **Pausa em segundo plano (`visibilitychange`)** — no modo CHEIO o motor já
     congela sozinho em background (o rAF do navegador para), mas no ECONÔMICO o
     canvas é `frameloop="demand"` + `setInterval` (o batimento do `EcoHeartbeat`
     e o passo do `useGameDriver`), que seguem acordando CPU/GPU com a aba/app
     ESCONDIDA — um dreno real quando o usuário troca de app sem fechar o jogo.
     Os dois loops agora param em `document.hidden` e retomam ao voltar (no
     driver, `last` é zerado para o passo não emendar o tempo parado num dt — o
     teto de 0,05 s já protege, mas isso mantém a cadência limpa). Zero mudança
     visual/enquanto visível.
  2. **dpr do MENU econômico cai a `[1,1]`** (era `[1,1.25]`); o COMBATE eco
     continua `[1,1.25]`. No menu o palco é ESTÁTICO (o auto-rotate do showcase
     já dorme no eco) e a canvas fica atrás do overlay quase-opaco do menu
     (`--panel` 0,82, `elementFromPoint` entrega `.menu-card` em todo canto) — é
     exatamente onde o celular fica parado olhando. A ~39% de pixels a menos não
     se vê ali. Fiação em `App.tsx`: `dpr={ecoActive ? (inGame ? [1,1.25] :
     [1,1]) : [1,2]}`.
  - **Verificação:** novos pinos em `perf.test.ts` (a expressão split do dpr +
     `visibilitychange`/`document.hidden` no heartbeat e no driver) e
     `qa/probe-eco.mjs` atualizado: `ecoMenu` espera dpr `clamp(winDpr,1,1)`,
     `combateNoEco` espera dpr `clamp(winDpr,1,1.25)`. Run ao vivo:
     **tudoVerde:true, CONSOLE 0** (cheio menu 495 fps headless → eco menu
     27,5, sombra do menu eco `autoUpdate:false`, combate eco `autoUpdate:true`,
     razão cheio→eco ok, órbita cap 28 fps, UA iPhone acende eco). ⚠️ **o split de
     dpr NÃO é medível em headless**: lá `window.devicePixelRatio` é 1 (o
     `deviceScaleFactor` do Playwright não vira `devicePixelRatio`), então
     `clamp(1,1,1.25)=clamp(1,1,1)=1` — menu e combate dão o MESMO 1. O split só
     pega num aparelho real (winDpr 2–3): menu 1,0 × combate 1,25. Confirmado
     estaticamente (pino da expressão + clamp padrão do r3f no mesmo prop `dpr`
     que já casa `[1,1.25]`/`[1,2]`); reconfirmar na mão no iPhone.
  - **Alavancas AVALIADAS e REJEITADAS (por que não fiz):** sombra 512² no eco →
     serrilhado visível na ilha; `BasicShadowMap` (sem PCF) → dureza feia no
     vidro; desacoplar a cadência da sombra da do render (sombra a 15 Hz × frame
     a 30 Hz) → sombra atrasa a criatura que anda; baixar o batimento do menu
     para ~12–20 Hz → o headless dá ~fps da própria Hz e a sonda (janela 20–36)
     fica instável + a anim ambiente da ilha (motes/cristais) fica em saltos;
     cortar draw calls dos rigs → risco alto ao figurino autoral, custo/benefício
     ruim sem profiler real no aparelho. O ganho real que sobra para a próxima
     rodada é **orçamento adaptativo por fps** (dpr/dinâmico quando o quadro
     estoura) — exige um profiler no iPhone, não da headless.
  - 🪤 **NOTA DE AMBIENTE (não é regressão):** em `vitest run` LOCAL com **Node
     26** aparecem ~74 falhas em 7 arquivos de UI/persistência, todas
     `localStorage` → `Cannot read properties of undefined (reading 'clear')`.
     Causa: o Node 26 traz um `localStorage` global nativo que exige
     `--localstorage-file` (o warning "localStorage is not available because
     --localstorage-file was not provided" aparece) e o jsdom recusa `localStorage`
     em origem opaca. Em CI (Node 20/22) e com `--localstorage-file` passa. As
     suítes relevantes para esta tarefa estão verdes isoladas: `perf` 21, `fog`
     5, `turbo` 11. Não é do código de otimização.
- **Pipeline dev (GitHub Pages) — a versão ingênua FALHOU e foi corrigida:** a
  primeira leitura achou que o `deploy-pages` transformava push de branch em
  "deploy de preview" com URL própria. **Não existe**: o parâmetro `preview` da
  action está em alpha FECHADO para repositórios públicos (action.yml diz
  "not available to the public"; discussões da comunidade até nov/2025
  confirmam), e por padrão QUALQUER branch que roda o workflow vira o site de
  produção — o push da dev **sobrescreveu a main no mesmo endereço** (cobrança
  do usuário, 05/nov). O GitHub Pages tem UM site por repositório, então o
  preview foi lavrado DENTRO dele: cada execução faz os DOIS builds e monta um
  único artifact — `main` na raiz `/element-merge/` (`VITE_BASE=/element-merge/`)
  e `dev` na subpasta `/element-merge/dev/` (`VITE_BASE=/element-merge/dev/`,
  builds via `npm run build -- --outDir dist-main|dist-dev`, checkout explícito
  `ref: main` + `ref: dev` no MESMO job). A raiz nunca é construída a partir de
  branch de feature, e um push na main reimplanta o preview da dev junto (o
  artifact é um só). Concurrency agora é o grupo único `pages` com
  `cancel-in-progress: false` (fila, não cancelamento: as duas branches publicam
  o mesmo site). O step "Publicado" imprime as DUAS URLs no sumário da execução:
  produção e `…/element-merge/dev/` (preview estável, não expira).
- **🪤 `git merge` sem argumento NÃO funde a dev na main (12/nov):** com
  `refs/remotes/origin/HEAD → origin/main` no clone, o `git merge --no-ff` rodado
  na main usa a ref simbólica do remote como ramo — e devolve **"Already up to
  date"** sem criar merge nenhum, porque a main já é ela mesma. O push seguinte
  diz `Everything up-to-date` e o deploy nem dispara. Fundir é sempre
  `git merge --no-ff dev -m "Merge branch 'dev' — …"` (ramo NOMEADO), e depois
  `git push origin main`; conferir `git --no-pager log --oneline -2` na main antes
  de empurrar.
- **🪤 ARMADILHA do segundo `actions/checkout` (custou 4 deploys quebrados em
  silêncio):** com o padrão `clean: true`, o checkout da dev roda
  `git clean -ffdx` no mesmo diretório — e o `-x` APAGA IGNORADOS: o
  `node_modules/` instalado pelo `npm ci` some (o build da dev morre em
  `sh: 1: tsc: not found`, exit 1 SEM mensagem de erro de código — só
  "Process completed with exit code 1", por isso o log público era inútil) e o
  `dist-main/` recém-construído também iriam embora. Visto no fonte do action
  v4 (`git-directory-helper.ts`: `if (settings.clean) flags.push('--force')`
  com `-ffdx`). Localmente NUNCA reproduz: `git checkout <ref>` comum não apaga
  ignorados. Correção: `clean: false` no checkout da dev (o checkout só troca
  os rastreados; `node_modules` e `dist-main` sobrevivem de propósito). Run
  verde da dev: 42124161513 (sha `40cc006`). ⚠️ O mesmo bug estava no
  deploy.yml da main no commit `c3609b2` (run 42115822657 falhou); a main só
  fica verde depois do port do workflow corrigido.
- **🪤 ARMADILHA 2 do segundo `actions/checkout` — build COMMITADO envenena o
  artifact (custou ~14h de produção velha em silêncio, 06/nov):** o
  `clean: false` preserva os IGNORADOS, mas não faz nada contra os RASTREADOS.
  `dist-main/` e `dist-dev/` tinham sido commitados sem querer em `f2d65a7` (o
  `.gitignore` só cobria `dist/`). Sequência envenenada: o job constrói
  `dist-main/` da main → o 2º checkout (`ref: dev`) **troca os rastreados** e
  restaura o `dist-main/` COMMITADO, um build de dias atrás →
  `cp -r dist-main/. dist/` sobe a versão velha → raiz do Pages com código
  antigo, job VERDE, zero erro. O `/dev/` escapava porque o build da dev roda
  DEPOIS do último checkout. Evidência no log do run 42206198828: o checkout
  imprime `D dist-main/assets/index-D3DKVsWT.js` (o build recém-feito apagado)
  e o bundle publicado `index-D3DKVsWT.js` não tinha `perf-mode-` (nada do modo
  econômico), enquanto o `/dev/` tinha. Correção em camadas: (1)
  `git rm -r --cached dist-main dist-dev` + `.gitignore` cobrindo os dois
  outDirs; (2) os builds são engarrafados em `$RUNNER_TEMP/site-main` e
  `$RUNNER_TEMP/site-dev` — fora do alcance de qualquer `git checkout`/`clean`
  — e a montagem do site sai de lá; (3) tripwire no topo do job:
  `git ls-files | grep -E '^(dist|dist-main|dist-dev)/'` → vermelho se alguém
  commitar build de novo; (4) step "Conferência" compara bytes (`cmp -s`) de
  cada asset do build da main com a raiz montada e confere que os dois
  `index.html` apontam para os bundles desta execução — produção velha passa a
  ser job VERMELHO, não susto do usuário. Pinos estáticos em `perf.test.ts`
  (describe `deploy: a raiz do Pages é sempre o build da main desta
  execução`). CACHE do SW subiu para `ebma-${SITE_DIR}-v6` para expulsar dos
  aparelhos a casca velha que eles já tinham guardado.
- **🪤 `deploy.yml` inválido derruba o run em 0s SEM log:** nome de step é um
  *plain scalar* YAML — dois-pontos + espaço dentro dele (`- name: 🛡️
  Tripwire: nenhum build…`) é erro de parse (`mapping values are not allowed
  here`). Sintoma: o run falha em 0s, sem job nenhum, e o nome do workflow na
  listagem cai para o caminho do arquivo (`.github/workflows/deploy.yml`) em
  vez de "Deploy no GitHub Pages" — é o sinal de que o YAML nem foi lido.
  Correção: cercar de aspas duplas os nomes que têm `:` (`- name: "🛡️
  Tripwire: …"`). Local:
  `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))"`
  antes de subir (não há action de lint no repo).
- **👁️ Sonda do site publicado (`qa/probe-site-live.mjs`, 06/nov):** abre
  Chromium nos DOIS mundos do Pages (raiz e `/dev/`), fura o `max-age=600` do
  CDN com `?probe=<ts>`, recarrega uma vez para passar pelo caminho do service
  worker (é o cache do aparelho que segura casca velha pós-deploy), abre
  Configurações → ✨ Gráficos e exige `perf-mode-auto|full|eco`, os três
  `[role=radio]` do radiogroup, os dois sliders de bloom, `perf-mode` no bundle
  publicado e `sw.js` encontrado. Roda MANUAL (o runner do deploy não tem
  navegador do Playwright instalado; as actions do Pages também não instalam).
  `QA_BASE` p/ apontar p/ outro host. Checagem ao vivo depois do conserto:
  raiz `index-CJbWdxie.js` e `/dev/` `index-yFbP8FyL.js`, os dois com a aba
  Gráficos e "Automático" marcado, `sw` em `ebma-${SITE_DIR}-v6` → os dois
  mundos ok. Rodar a sonda é o que fecha o ciclo do bug de produção velha: o
  job verde não prova o conteúdo entregue, o navegador no endereço público prova.
- **SW com dois mundos no MESMO domínio:** caches são compartilhados por
  ORIGEM, então o activate que apaga "tudo que não é o próprio cache" destrói
  o cache offline do outro (produção ↔ preview). O `activate` do sw.js purga só
  a família do diretório de instalação (`ebma-${SITE_DIR}-*`, SITE_DIR = último
  segmento do caminho: `element-merge` na produção, `dev` no preview) mais os
  legados sem diretório (`/^ebma-v\d+$/` = ebma-v2/v3). CACHE subiu para
  `ebma-${SITE_DIR}-v5` (3º bump), o que também expulsa os ebma-element-merge-v4
  que os aparelhos pegaram durante o incidente.

---

## 🌫️ Fog adaptivo (novidade de 05/nov/2026 — NÃO reverter)

Report do usuário: "o FOG nas árvores está muito forte, no mobile nem é
possível ver árvore nenhuma". Causa: o fog era **FIXO** (near 2–2,36×ARENA_R,
far 5,5–7,5×) e as distâncias do fog são medidas a partir da **CÂMERA** — o
mesmo cenário tinha densidades incompatíveis entre as calibrações: o desktop de
janela larga começa a câmera BAIXA a 1,316R, enquanto o celular começa a ~2,3R
(`CAMERA_POS`) e a órbita sobe até 2,55R; a vegetação do anel externo afundava
em 60–100% de neblina (a muralha da floresta media 0,82–1,0 no enquadre do
celular = invisível). Radii REAIS medidos na cena viva: muralha da floresta r
86,5–116,5 (`TREE_RING_INNER` sai do teto de zoom + copa 24 + folga 3 —
desenho antigo preservado; É a vegetação mais distante do jogo), conos do
vulcão r 75–98, recife subaquático r 61–83, anel de gelo r 53–74.

- **Componente:** `src/scene/AdaptiveFog.tsx` substitui o `<fog attach>` estático
  do App (import de `ARENA_R` e a flag `scenic` saíram do App). O fog acompanha
  a câmera a cada frame: `near = dist(câmera→ORBIT_TARGET) + 0,4R` — a linha
  inimiga do tabuleiro (a ~0,37R além do alvo) fica limpa em QUALQUER
  fase/janela/zoom — e `far = near + ARENA_R * FOG_SPAN[variante]`. Spans
  CALIBRADOS pela sonda (personalidade por medição, não intuição): subaquático
  5,0 (a névoa mais densa), arcana 4,6 (sem vegetação; só o vazio esmaece),
  gelo 5,5, vulcão 6,0, floresta 8,0 (bruma leve POR UNIDADE porque a muralha é
  muito longe); fim-do-universo segue SEM fog (guarda do App + span 0).
- **Armadilha do TypeScript:** `scene.fog` é tipado `Fog | FogExp2` (FogExp2 não
  tem near/far) e o React re-renderiza ao trocar `variant` sem re-rodar o
  effect — a instância própria mora em `useRef` (`ownRef`), criada/destruída no
  `useEffect([scene, color])`.
- **Verificação:** `src/tests/fog.test.ts` (5 testes) — pinos de near/far que
  seguem a câmera, spans pinados nos números medidos, ciclo de vida do fog e o
  pino de regressão "o fog fixo morreu" (App não contém `<fog` nem
  `ARENA_R * número`). Densidade VIVA: `qa/probe-fog.mjs` (WebKit, duas rodadas
  para vencer o layout aleatório): floresta 0,41/0,49/**0,54**, subaquático
  0,50/0,50/**0,54**, gelo 0,43–0,47, vulcão 0,51–0,53, arcana 0,18–0,25,
  fim-do-universo sem fog — mobile/desktop/zoom, **CONSOLE 0**, tudo ≤ 0,55.
  A sonda também revela o teto de câmera por cenário (gelo/vulcão/subaquático já
  COMEÇAM no maxDistance). Prints aprovados: `/tmp/opencode/fog/fog-*-390.png`,
  `fog-forest-1600.png` e a muralha legível no pior caso `fog-forest-390-
  horizonte.png`. Lição: spans curtos (≤4R) afundam a muralha — o span tem de
  cobrir o OFFSET câmera→vegetação (até ~2,55R + 5R), não só o raio da cena.

---

## ⏩ Turbo de combate (novidade de 05/nov/2026 — NÃO reverter)

Report do usuário: com muitos monstros no campo a partida vira uma fila de
ataques indo e vindo por minutos. Novelidade: um **botão flutuante de relógio**
na rail esquerda que cicla a cadência da troca de tiros **1× → 3× → 5× → 1×**,
respeitando a cadência própria de cada monstro (intervalo 2 s vira 0,67 s no
3× e 0,4 s no 5×; 3 s vira 1 s e 0,6 s — proporcional, não uma cadência global
fixa).

- **Motor (o coração):** `GameEngine` ganhou `turboScale` privado,
  `setTurbo(scale)` (aceita qualquer número ≥ 1; os degraus 1/3/5 são escolha da
  UI) e o getter público `turbo`. O ÚNICO ponto escalado é o dreno do relógio de
  tiro em `combatTick`: `unit.cooldown -= dt * this.turboScale`.
  Projéteis, dano, status, regen e `battleTime` seguem no tempo real — o que
  muda é a frequência dos tiros, não a força deles. Nota aceita:
  `DOUBLE_SHOT_DELAY` (pendingShots em `world.time`) não é escalada — deslocamento
  relativo menor, deliberado.
- **Store:** `turbo: TurboScale` (`1 | 3 | 5`, tipo exportado) **não persiste**
  (é alívio da partida em curso, não preferência salva); `setTurbo(scale)`
  espelha em `engine?.setTurbo(scale)`; `startNewMatch` reseta `turbo:1` — cada
  partida começa em 1×.
- **UI:** glifo SVG próprio `ClockIcon` em `components/icons.tsx` (aro + disco
  sombreado + ponteiros na tinta `currentColor`, mesmo desenho de aro do
  CoinIcon — consistência com HeartIcon/SwordsIcon/CoinIcon); `components/
  TurboFab.tsx` monta APENAS em `phase === 'combat'` (preparação não tem tiro,
  resultado não tem partida), testid `turbo-fab`, cada toque avança o degrau em
  `TURBO_STEPS = [1,3,5]`; estado por `data-on` (>1) + `data-scale` +
  `aria-pressed` + contador `1×`/`3×`/`5×`. Montado no App ao lado do CodexFab.
  `.turbo-fab` é a segunda peça da MESMA rail do livro, mas ACIMA dele: desktop
  `left:14px; top:calc(50% - 150px)` 64px — a loja mora no canto INFERIOR
  esquerdo (na janela 1280×610 do usuário, painel começa em y≈256) e a versão
  antiga "abaixo do livro" (centro em 50%+84) MORDIA o canto da loja em janelas
  comuns (folga livro→loja = H/2−289; só caberia um FAB a partir de ~740px de
  altura) — sobreposição cobrada pelo usuário em 05/nov. Medido novo: clock
  14,155..219 · chip do header até ≈95 · livro 14,269..341 · loja 12,256 (sem
  toque em nada; idem em 1200×700: clock 14,200, livro 14,314, loja 12,346).
  Compacto ≤760 `left:10px; top:calc(164px + env(safe-area-inset-top))` 52px
  (caixa medida 10,164 — abaixo da faixa do toast ~100–150, debaixo do livro
  no topo da coluna e longe da loja do rodapé ~655 — zona medida no iPhone). Estados: 1× discreto; 3× acende no
  ouro do tema (`var(--gold), var(--fire)`); 5× esquenta do ouro para o
  perigo (`var(--gold), var(--danger)` — regra `[data-scale='5']` escrita
  DEPOIS da do 3×: mesma especificidade, a ordem vence) — a escalada de calor
  lê a intensidade sem ler o contador.
- **Verificação:** `src/tests/turbo.test.ts` (11 testes) — cadência medida num
  duelo ignis×ignis com intervalos gravados em 2 s/3 s: gaps médios ≈2/3 s em
  1×, ≈0,67/1 s em 3× e ≈0,4/0,6 s em 5×, ciclo 3→5→1× no meio do combate
  restaura a cadência, morte continua por acerto de projétil; fiação da store
  (motor novo nasce em 1×, `setTurbo` espelha o degrau) e pinos estáticos
  `?raw`. **Pino do CSS mora na sonda, não no vitest**: o pipeline de CSS do
  vitest stubbeia importações de CSS (`?raw`, glob e diretas devolvem vazio),
  então `qa/probe-turbo.mjs` busca `src/styles.css?raw` do dev server (caminho
  RELATIVO à página — o servidor tem base `/element-merge/`, absoluto dá 404)
  e mede o FAB vivo. Rodou no WebKit: 0 FABs na preparação, FAB no combate,
  ciclo 1×→3×→5×→1× confirmado nos atributos e nos gradientes calculados
  (escuro↔ouro↔ouro-perigo), os quatro pinos de CSS verdes, e a rail conferida
  SEM sobreposição em três janelas (1200×700, 1280×610 e 390×844): FAB×loja
  nunca se tocam, FAB abaixo do chip do header e acima do livro no desktop
  (debaixo dele no compacto), na coluna esquerda — **CONSOLE 0**. Prints
  aprovados do FAB: `/tmp/opencode/turbo3/turbo-{off,3,5}.png` + a coluna
  inteira `rail-1280x610.png`.

---

## 📲 PWA instalável (novidade de 04/nov/2026 — NÃO reverter)

O jogo virou app instalável (desktop/Android via manifest+Service Worker; iOS
via `apple-touch-icon` 180 + metas `apple-mobile-web-app-*`; instalar do
Safari ≥ 16.4 com Compartilhar → Adicionar à Tela de Início). Peças e regras:

- `public/manifest.webmanifest`: `start_url`/`scope` **relativos** (`"./"`) —
  resolvem para `/element-merge/` no GitHub Pages; caminhos absolutos
  quebrariam o subcaminho. `display: standalone`, tema/bg `#0a0e1a`, ícones
  192/512 `any` + `maskable-512` (losango a 78% = safe-zone do mask).
- `public/sw.js`: **escrito à mão** (sem Workbox nem `vite-plugin-pwa` — o
  build gera hashes e o runtime cache resolve sozinho). Navegação é
  network-first (deploy novo entra na hora) com fallback offline no shell
  `./`; GETs same-origin são stale-while-revalidate (o jogo inteiro entra no
  cache na primeira partida online e roda depois sem rede). Mexeu no SW →
  **subir o `CACHE`** (`ebma-v1` → `ebma-v2`); o `activate` purga versões
  antigas. (**05/nov: bump ebma-v1→ebma-v2 feito** — o usuário reportou o botão
  de turbo sumido no iPhone e o site publicado estava correto (bundle/CSS ao
  vivo pinchados: FAB no combate, ciclo 1×→3×→5×→1× e posições medidas pela
  sonda `probe-turbo` contra a URL de produção); o culpado provável é o shell
  antigo pré-turbo que o cache do aparelho revalida devagar. O `activate` do v2
  varre os caches velhos na primeira visita online. **05/nov: bump ebma-v2→
  ebma-v3 feito junto do fog adaptivo** — `sw.js` inalterado não gera diff de
  bytes e o aparelho seguiria servindo o shell pré-fog; o v3 purga isso.)
- Registro no `src/main.tsx` com gate `!import.meta.env.DEV`: **SW NUNCA em
  dev** — SW servindo módulos no dev server é a armadilha do transform
  obsoleto que envenena silenciosamente as sondas `qa/` (lição de 03/nov).
  Em produção o caminho vem de `import.meta.env.BASE_URL + 'sw.js'`.
- Favicon/ícones: `favicon.svg` (donut de fusão: meio-fogo/meio-água, costura
  dourada) + PNGs rasterizados do SVG (one-off com Playwright; script
  descartado). `index.html`: `icon` SVG + `alternate icon` PNG + `manifest` +
  `theme-color` + metas iOS. (O 404 de `/favicon.ico` no console das sondas
  morreu junto.)
- Verificado no Chrome real (chrome-devtools MCP) servindo `vite preview`:
  SW `activated` controlando o escopo `/element-merge/`, manifest parseia
  com os 3 ícones e **recarga OFFLINE carregou o menu do cache `ebma-v1`**
  (7 entradas: shell, CSS+JS com hash, ícones, manifest). Em dev (5173) o
  gate foi verificado: NENHUM SW registrado.

---

## 🌄 Bônus de cenário + trava anti-congelamento do UnitView (04/nov/2026 — NÃO reverter)

**Bônus de terreno:** cada cenário favorece um elemento de linhagem
(`src/data/terrainBonuses.ts`): vulcânico→fogo, floresta→terra, gélido→água,
subaquático→água, fim-do-universo→ar, ilha arcana→nenhum. `TERRAIN_BONUS =
0.12` é aplicado num ponto único — `GameEngine.createUnit` — então invocação,
time persistido, exército da IA e filhos de fusão entram todos pela mesma
porta. A marcação mora na unidade (`CombatUnit.terrainBoost`) e é espelhada no
store (`UiUnit.terrainBoost`) para o Inspetor mostrar os números honestos. A
troca de cenário no meio da partida é hot-swap (`setScenario` escreve
`engine.world.scene`): vale para quem NASCER depois; quem já está em campo
mantém o bônus que embutiu no nascimento. UI: chip de cenário (`terrain-hint`)
é FILLED e mora FORA do painel do header — filho absoluto do `<header>`
pendurado logo abaixo e alinhado à borda esquerda do painel (nunca dentro do
flex do header: dentro ele disputava largura com moedas/botões e estourava o
lado direito no iPad retrato — 768px, que ficava exatamente de fora do compacto
≤760 — e no celular). Conteúdo: `⬡elemento +12% ♥/⚔` (glifos SVG
`HeartIcon`/`SwordsIcon` CHEIOS e simétricos, todos herdando a tinta do chip —
o override `.hud-terrain .el-glyph { color: inherit }` é essencial, senão o
`.el-*` pinta o ícone com a MESMA cor do fill e ele some); fundo = cor do
elemento, tinta escolhida por luminância (`inkOn` no HUD: branca em fogo/água,
escura em terra/ar); a frase por extenso mora só no `title`. Header responsivo
regra nova: `@media (max-width: 900px)` esconde `.hud-btn-text` (botões viram
ícone — cobre o iPad retrato que antes quebrava); no compacto ≤760 escondem-se
também `.hud-logo`, a pílula de dificuldade quando a partida está de pé
(`.hud--live .hud-diff`) e o rótulo "Combate" do timer (`.hud-timer-label`,
só o número fica), e o toast desceu para 100px para não cobrir o chip.
**NÃO reverter:** o chip fora do header + o ≤900 de botões-ícone foram
medidos no Chrome (390 emulação mobile, 768 retrato, 1024 paisagem, 1280):
tudo dentro da borda e sem scroll horizontal. linha no Inspetor, badges no
menu Cenário, anel colorido no chão + ícone ▲ no figurino
(`terrainIconTexture`, cache por cor).

**O congelamento (bug reportado pelo usuário):** `useFrame` do `UnitView`
dereferencia todos os meshes com `useRef(null!)` — se QUALQUER mesh faltar
num frame (commit parcial, módulo obsoleto de HMR, ou script externo tipo
userscript pilotando o loop de frames com uma cópia velha do código — o
stack trace do usuário mostrava `window.__frameLoop` do Tampermonkey
"elemental-merge-save-editor" dirigindo os callbacks), o callback joga
`TypeError: Cannot set properties of null (setting 'visible')` TODO frame e
o r3f nunca chega no `gl.render()` — a tela congela com o console em chamas.
**Fix:** um único guard no topo do `useFrame` aborta o frame daquela unidade
se qualquer ref obrigatório estiver ausente (ver comentário "TRAVA
anti-congelamento" em `src/scene/UnitView.tsx`). Verificado no Chrome real:
4 ciclos partida↔menu com invocações, fusões em combate e status (burn/slow)
rodando = zero erros no console, ~76fps.

---

## 🎚️ Calibração de dificuldade — estado e dívida aberta (04/nov/2026)

Objetivo da linha: **nenhum modo pode ser impossível** — o MESMO time do
jogador acaba vencendo em todas as dificuldades; o que muda é a FREQUÊNCIA de
vitórias por modo.Harness novo: `src/tests/difficultyCalibration.test.ts`
(SEEDS=16, guard `while (!eng.world.summary && guard++ < 5200) eng.update(1/30)`).

**Medições que mandam (foram o chão das decisões, não intuição):**
- Só ler o gráfico mente: o valor real da carta é `dps×hp` — golem ≈ 2096,
  ignis ≈ 1547, nereia ≈ 1371, zephyr ≈ 900. O motor luta em formação estática
  com gate de alcance, então o golem precisa de compensação de stats (hoje
  185/18 nos dados; a varredura sugere ~200/18).
- Orçamento de time é quantizado: `budget = round(coeff×valor/100)×100`. Com
  coeff ≥ ~1.09 em valor 600 vira 700 → entra **+1 unidade** — para times
  pequenos isso é um muro imbatível, não um ajuste.
- `duelScore` (escolha ciente do duelo) e `counterChance` (variância por seed)
  já implementados no composer.

**Veredito da varredura v2 (n1.0/cc.65 + h1.08/cc.85, G185/200/210×dmg18):**
difícil nunca fica 0 para naive (1–5w+e) nem espec (1w), MAS `misto4x3`,
`board12x1` e `terra12x1` perdem TODAS em normal E difícil nas 4 combinações —
a árvore da IA é eficiente demais em valor (base ≈1.3× vs puro) e esmaga boards
grandes puros. Conclusão: os 3 pins de faixa NÃO verdeiam só assando
coeficiente — precisa de decisão no modelo de valor do teamComposer (ou
identidade de posicionamento) antes de assar `TEAM_RULES` em `balance.ts`.

**Estado atual:** os 3 pins dependentes dessa decisão estão `test.skip` com
comentário apontando para esta seção (normal-faixa, difícil-faixa, cenário
fogo×pedra saturado 20×20). Candidatos de coeficientes: normal 1.0/0.65,
difícil 1.08/0.85 (se fechar em 1.08, ajustar o pin de orçamento 500→400 no
`ai.test` e o DIFF_DESC do SettingsMenu). O harness temporário de varredura
(`zz-probe.test.ts`) foi apagado depois de registrar as tabelas aqui —
recria-se da seção da tarefa quando necessário.

---

## 🏟️ Arena, encaixe e regras de partida (reescrito em 02/nov/2026 — NÃO reverter)

Seis regras novas, todas com pino de teste (unitário ou sonda). Elas nasceram de
dois defeitos reais: o Colosso Nv.9/10 cobria três buracos e derramava sobre a
plataforma inimiga, e havia a possibilidade de ninguém conseguir atacar
(softlock).

**1. O monstro CABE no próprio buraco (e nunca encosta no vizinho).**
`game/board.ts` é a única fonte de layout: `MONSTER_FOOT_R 2,5` (raio máximo do
invólucro em mundo real), `TILE_SPACING_X 5,2 = ROW_DEPTH 5,2` (buraco quadrado),
`FRONT_ROW_Z 3,1`, `SLOT_FIT_MAX 1,15`, `SLOT_SNAP = ROW_DEPTH × 0,5`, e
`ARENA_R = hypot(PLATFORM.halfX, PLATFORM.backZ) + 2,3 ≈ 23` — ilha, luz, câmera
e fog derivam de `ARENA_R` (`Arena.tsx`, `Lighting.tsx`, `app/App.tsx`,
`CameraController.maxDistance = ARENA_R × 2,76`). Como `2 × MONSTER_FOOT_R
(5,0) < 5,2`, dois invólucros vizinhos **jamais** se tocam — horizontal,
profundidade ou diagonal.

**2. A tabela de invólucros é medida, não chutada.** `data/footprints.ts` guarda
`MEDIDO`: meia-envergadura (X) e meia-profundidade (Z) da silhueta REAL de cada
forma, medidas na cena viva a partir do centro do slot pela sonda
`qa/probe-footprint.mjs` (HUD/anel/hitbox fora). O antigo
`scale = 1 + 0,07 × (nível−1)` era um chute CEGO: escalava por nível um rig que
já nasce autoral no tamanho final, então as árvores Nv.6–10 renderizavam a
1,35–1,63× (o Colosso tinha 7,3 × 7,0 de mundo num buraco de 3,2 × 2,3).
Regra do encaixe: `slotFit(species) = min(MONSTER_FOOT_R / familyRadius,
SLOT_FIT_MAX)` — **por família**, para a escada 2→1 nunca inverter (o filho é
sempre maior que os pais). Só os deslocamentos de MUNDO (`worldAimY` /
`worldMuzzleY` / `worldTopY`) recebem o fator; `formTop` / `formMuzzleY` /
`formAimY` continuam autorais. Extremos que o teto de 2,5 realmente encolhe:
astral X 2,56 / Z 2,94, abissal Z 3,11 (tentáculos de um lado só), ignis forma 5
Z 2,80 (daí `fit(ignis) = 0,868`, `worldMuzzleY('ignis', 5) = 1,896`).
Pinos em `tests/board.test.ts`: envelope ≤ `MONSTER_FOOT_R`, escada não inverte
(toleração de 0,1 — as medições têm vaivém de ~2 cm entre formas puras vizinhas),
`slotFit ≥ 0,55` (ninguém é esmagado até virar brinquedo) e a tabela confere com
o invólucro analítico das `parts`.

**3. Alcance NÃO é porteira: todo mundo ataca todo mundo de qualquer buraco.**
`game/combat/targeting.ts` — `pickTarget` considera todo inimigo vivo e a regra
de targeting da criatura manda sozinha. `inRange` e `BOARD_RANGE_SCALE` foram
removidos; sobrou só `BOARD_PROJECTILE_SCALE = 1,5` (tempo de voo no tabuleiro
fundo). Motivos: com vão fundo-a-fundo de ~27 e alcances de 8–13, duas unidades
atrás ficariam paradas para sempre (softlock), e a CPU planta no fundo — travar
o ataque daria a ela uma vantagem de posicionamento sem resposta. Também não
existe "preferir alvo ao alcance": para um `farthest` (franco-atirador) isso
inverteria a regra. Distâncias novas: frente-a-frente 6,2 · frente↔fundo inimigo
16,6 · fundo-a-fundo 27,0. Pino: `combat.test.ts` 5d (gólem do fundo atira e
machuca) e 5e (alcance nunca sobrepõe `lowestHp`).

**4. A fusão nasce no slot do ALVO.** `tryMerge(aId, bId)` significa "A foi
carregada e largada SOBRE B": o filho nasce em `b.tile` (`destTile = b.tile`), o
fx `mergeDone`/`primordial` fica ancorado nesse ponto e o buraco de origem fica
livre. Senão a criatura "pula de volta" para o buraco de onde saiu. Pino:
`fusion.test.ts` 1b e `ui.test.tsx` ("o filho nasce no slot do ALVO").

**5. Preparação fecha no combate; vitória E derrota devolvem o time inteiro.**
- **Tudo é montado antes da luta**: `engine.summon` só na fase `preparation` —
  em combate devolve `reason: 'COMBAT_STARTED'` e emite `summonBlocked` (o
  jogador vê o aviso). Nem jogador nem IA invocam reforços no combate (o
  exército inimigo já nasce inteiro no `startBattle`, por `createUnit`, sem
  passar pelo portão). Mover, fundir e VENDER continuam liberados durante o
  combate; é a leitura tática da partida, não a compra de força. Na UI a loja
  fica desabilitada com "em combate" no card (`ShopPanel`: `active =
  phase === 'preparation'`). Pino: `economy.test.ts` (bloqueio dos dois lados,
  sem unidade nova e sem moeda gasta + evento) e `ui.test.tsx` (cards
  desabilitados e aviso na tela).
- **Vitória = time inteiro de volta**: `engine.restoredRoster('player')` devolve
  tudo o que o jogador pôs em campo com destino `alive` **ou `dead`** (ordem de
  nível decrescente, teto `TILES_PER_SIDE` = 12). Ficam de fora os FUNDIDOS (o
  filho de nível seguinte já carrega o valor deles) e os VENDIDOS na lixeira (o
  valor virou moeda). O motor mantém o livro de bordo `deployed[]` com o `fate`
  de cada unidade (`createUnit` / `killUnit` / `removeUnit(fate)` /
  `sellUnit('sold')`). Assim evoluir um monstro deixa de ser aposta com a morte
  dele na partida vencida. Pino: `fullMatch.test.ts` (morto volta, fundido e
  vendido não; nível decrescente) e `ui.test.tsx` ("VITÓRIA devolve o time
  inteiro").
- **Derrota = resgate anti-softlock (regra nova, 02/nov/2026 — não reverter)**:
  quem perder e quiser continuar jogando recebe de volta o time INTEIRO daquela
  rodada — o mesmo `restoredRoster` da vitória — mas o prejuízo financeiro
  fica: nenhuma moeda gasta na rodada é devolvida além da recompensa padrão
  (`DEFEAT_REWARD` = +50). O softlock que a regra mata: comprar 5 monstros na
  1ª rodada (5×100), perdê-los todos e começar a próxima só com as 50 moedas
  da recompensa — sem criatura guardada e sem pagar nem a invocação (100),
  sem como recomeçar. Com o time de volta o jogador pode trocar de
  dificuldade, vender criaturas na lixeira (o valor delas vira moeda) e
  montar outra estratégia sem ser severamente penalizado. EMPATE com
  sobreviventes mantém a regra antiga (só os vivos voltam); empate com o
  tabuleiro do jogador zerado cai no mesmo resgate da derrota. A escolha
  vive no `finishMatch` do `store/gameStore.ts` — o motor continua sem
  credentar moeda nenhuma e sem conhecer a regra. Format do save NÃO mudou
  (sem bump de `SAVE_VERSION`). Pino: `defeatRoster.test.ts` (estória
  completa: zerou → os 5 voltam, saldo só +50, vende 1 → volta a invocar;
  derrota com sobrevivente → mortos também voltam; empate com vivos →
  mortos NÃO voltam) e `ui.test.tsx` ("derrota total devolve o time
  inteiro").

**6. Enquadramento: os 24 buracos têm que estar alcançáveis pelo ponteiro.** O
dock (loja/controles) é DOM e engole o `pointerdown`; se o chão de um buraco é
projetado em cima do painel, a criatura daquele slot fica impossível de segurar,
mover ou fundir — e com a arena ampliada a linha de fundo do jogador caía em
cima da loja. A correção é geometry + CSS, travada em `board.ts`: `ORBIT_TARGET
= [0, 1,4, PLATFORM.centerZ × 0,3]` (alvo da órbita deslocado para o lado do
jogador) e `CAMERA_POS = [0, ARENA_R × 1,6, ORBIT_TARGET.z + ARENA_R × 1,7]`
(dist ~53, inclinação ~43°), usados por `app/App.tsx` (`camera={{ position:
CAMERA_POS, fov: 42 }}`) e `CameraController` (`target={ORBIT_TARGET}`). No CSS,
`.shop` tem `min-width: 0` / `max-width: 400px` e `.shop-note` `max-width:
290px` — antes, uma nota longa esticava o painel flex a ~608 px e tapava a
coluna esquerda do tabuleiro. Sonda: `node qa/probe-framing.mjs` → "buracos
alcançáveis pelo ponteiro: 24/24" (projeta o chão dos 24 slots,
`document.elementFromPoint` tem que cair no CANVAS) + o arraste real de fusão
(filho nasce no slot do alvo) + a loja fechada em combate.

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
  formMuzzleY`, alturas de mundo via `worldAimY/worldMuzzleY`), morte/fusão
  animadas, fim por extermínio/160s (fração de HP). **Alcance não trava ataque
  nenhum** (`targeting.ts`); `BOARD_PROJECTILE_SCALE 1,5` só compensa o voo no
  tabuleiro fundo.
- **IA honesta** (`game/ai/teamComposer.ts` + `fusionPlan.ts`): exército no
  `startBattle`, orçamento `coeff × Σ sellValue`; `sellValue = 100·2^(nv-1)`
  vale p/ TODAS as espécies; `TEAM_RULES`: easy 0 / normal 7 / hard 10
  (`treeMaxLevel`), `hybridChance` 0/0.3/0.6, contra-escolha e tanques na
  frente (normal+), seed determinística.
- **Economia fixa**: 100/invocação, +100 vit / +50 derrota-empate, fusões
  grátis, venda devolve custo acumulado, saldo nunca negativo. **Invocar só na
  preparação** (`COMBAT_STARTED`): o exército fecha quando o combate começa.
- **Persistência** (`persistence/saveGame.ts`, chave `elemental-merge-save-v1`,
  `SAVE_VERSION 3`): moedas, descobertas, `retainedRoster` (vitória E derrota: todo
  o time plantado, vivas e mortas em combate — na derrota sem reembolso, o prejuízo
  fica; empate com sobreviventes: só vivas — ≤12, fundidos e vendidos ficam de
  fora; ver a regra anti-softlock na seção de partida), settings (dificuldade,
  saldo inicial, debugMode), estatísticas; load defensivo com migração.
- **Modo debug**: Configurações → Depuração → botão "Criar no campo" em todo
  card do bestiário (`engine.addRetainedUnit`, só na preparação, sem descoberta);
  puros têm seletor de forma Nv.1–5; card selado mostra rig real.
- **Puros com figurino completo e aprovado**: ignis (FlameRig; **Nv.1 piloto de
  malha 3D importada desde 14/nov — ver a seção do Ignis Nv.1**), zephyr
  (WindRig; **Nv.1 também de malha importada, mesmo molde**), golem (StoneRig —
  o padrão físico modelo; **Nv.1 de malha importada desde 14/nov, seção do
  Golém Nv.1 — arremesso-assinatura com o corpo, não o braço**), nereia
  (WaterRig; **Nv.1 de malha importada desde 15/nov, seção da Nereia Nv.1 — onda
  branca descendo pelo corpo no DIFUSO, e a lição do BloomGate/aro de equipe**) —
  5 formas visíveis cada, gateadas por `minLvl/maxLvl`.
- **Arena**: ilha flutuante, plataformas derivadas de `game/board.ts`
  (`TILE_SPACING_X 5,2 · ROW_DEPTH 5,2 · FRONT_ROW_Z 3,1 · UNIT_BASE_Y 0,28 ·
  MONSTER_FOOT_R 2,5 · ARENA_R ≈ 23 · 12 slots/lado`), enquadramento travado em
  `ORBIT_TARGET`/`CAMERA_POS` do `board.ts` (dist ~53, inclinação ~43°, alvo
  deslocado para o jogador — 24/24 buracos alcançáveis pelo ponteiro), câmera
  orbital 360° (dist 3–`ARENA_R×2,76`, polar 0,35–1,32) e fog/luz derivados de
  `ARENA_R`. Loja com `max-width: 400px` no CSS para o dock não cobrir o board.
- **QA visual automatizado** (laço Playwright descrito acima), 382 testes/36.

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
npx vitest run            # 357 testes, 34 arquivos
npm run build             # tsc + build de produção
npm run dev               # http://localhost:5173/element-merge/ (HMR; hard refresh ao mexer shaders)
node qa/inspect-species.mjs <especie> [aliada]
node qa/probe-footprint.mjs            # encaixe/no-overlap (veredito "no buraco?"/"no anel?" + SOBREPOSIÇÕES: 0)
node qa/probe-framing.mjs              # enquadramento (24/24 buracos) + arraste real no slot do alvo + loja fechada
node qa/probe-merge-preview.mjs        # prévia de fusões do arraste (revelar/selar, persegue o ponteiro, SEM FALHAS)
node qa/probe-sell-fab.mjs             # FAB de venda: só no arraste, pulso devagar→rápido, 24/24 buracos livres (1373×749, 1280×610, 390×844)
node qa/probe-tutorial.mjs             # 🎓 luvinha: 5 passos, mímica que NÃO joga, 24/24 buracos (desktop+retrato), cofre intacto, time de volta (92 checagens, ~4 min)
# visual das malhas (IGNIS, ZÉFIRO e GOLÉM — no golém, Nv.1 = a cabeça e Nv.2 = o corpo, dá para escolher o nível com `debug-level-golem-<n>` no bestiário): dev server → Configurações ▸ Depuração → enciclopédia → "Criar no campo" (`debug-spawn-ignis` / `debug-spawn-zephyr` / `debug-spawn-golem`); o card do bestiário E a arena renderizam a malha; Ctrl+Shift+R (hard refresh) SEMPRE antes de avaliar feedback de material/shader
```

> As sondas que NÃO testam o tutorial (`probe-framing`, `probe-sell-fab`,
> `probe-merge-preview`, `probe-footprint`) marcam `tutorialDone: true` no save
> **dentro do `addInitScript`** — em perfil limpo é o tutorial que abre no `play`
> e ele barra spawn de depuração/arraste fora do passo, o que derrubaria a sonda
> por um motivo que ela não está testando.

## Armadilhas (resumo)

- **Gate de pós-processamento NUNCA substitui o `onBeforeCompile` de um rig:
  compõe.** O `BloomGate` patcheia os materiais EMBUTIDOS da arena (devolve a
  eles o ACES+sRGB que o three pula no render target) e já chegou a TROCAR a
  função do rig pela dele, fixar `customProgramCacheKey = () => 'qtBloomEncode'`
  e ainda `delete p.onBeforeCompile` no unpatch. Fatos do three (r16x) que fazem
  disso uma armadilha invisível: a chave do programa é
  `shaderID + parâmetros + customProgramCacheKey()` — o TEXTO do shader
  patcheado não entra na chave — e `onBeforeCompile` **só roda no MISS** do cache
  (three.cjs ≈ 30408). Sintoma pago em 15/nov: o corpo dos rigs de malha 3D
  (que MORA no `onBeforeCompile` do material) ficava mudo na arena e vivo no
  palco do bestiário — "no bestiário aparece certo, mas na batalha não". Pinos do
  contrato em `src/tests/renderSettings.test.ts`; prova viva: `userData.shader`
  presente e o uniforme de tempo do rig avançando.
- **Cor de modelo importado: medir antes de pintar.** O "amarronzado" que o
  usuário via em todas as fases do aquático NÃO era a textura (fria em 100% das
  faixas — `qa/probe-textura-warm.mjs`) nem a luz do bioma (o corpo continuava
  frio com todas as point lights apagadas — `qa/probe-tone.mjs`): era o ARO DE
  EQUIPE no fresnel do rig, EMISSIVO (`TEAM_TINT.player` dourado sobre azure =
  cáqui, imune ao bioma, ausente no palco do bestiário porque lá o tint cai no
  `neutral`). Antes de encostar na cor de um modelo novo, as duas sondas.
- **Rodando os testes num Node ≥22: se metade da suíte cair com
  `Cannot read properties of undefined (reading 'clear')`, a culpa é do Node, não
  do seu diff.** Node instala um GETTER global `localStorage` (webstorage
  experimental) que devolve `undefined` sem `--localstorage-file`, e no jsdom do
  vitest `window === globalThis === document.defaultView` — o getter sombreia o
  storage do jsdom (107 testes de uma vez em 15/nov). `src/tests/setup.ts` já
  instala um storage em memória quando o ambiente não entrega um; não remover.
- **NUNCA reintroduzir `scale = 1 + 0,07 × (nível−1)` no `UnitView`**: os rigs da
  árvore já nascem autorais no tamanho final e isso escalava 1,35–1,63× por cima
  do figurino (foi o que fez o Colosso derramar sobre a plataforma inimiga). O
  fator de escala é `slotFit(species)` (por família) e ele só se aplica aos
  deslocamentos de mundo (`worldAimY/worldMuzzleY/worldTopY`). Mudou um rig →
  rodar `qa/probe-footprint.mjs` e atualizar `MEDIDO` em `data/footprints.ts`.
- **Não recriar gate de alcance** em `targeting.ts` nem "preferência por alvo ao
  alcance": o vão fundo-a-fundo (27) passa de qualquer alcance (8–13) e isso é
  justamente o pino anti-softlock; para `farthest` a preferência inverte a regra.
- **A loja fecha no combate** (`COMBAT_STARTED`): se algum fluxo novo de spawn
  aparecer, ele tem que passar pelo portão de `preparation` do motor (o modo
  debug usa `addRetainedUnit`, que já checa a fase). Mover/fundir/vender seguem
  liberados em combate.
- **Vitória devolve até 12 unidades** (time cheio na próxima partida, e o
  jogador pode vendê-las por moedas) — é o trade-off de snowball aceito pelo
  usuário para "evoluir monstro não ser aposta". Fundidos/vendidos nunca voltam.
- **Não apagar `ORBIT_TARGET`/`CAMERA_POS` do `board.ts` nem o `max-width: 400px`
  de `.shop`**: o dock DOM engole `pointerdown` e, se o chão de um buraco cai em
  cima do painel (ou a nota longa estica o flex), aquela criatura fica travada no
  slot. Ao mexer câmera/CSS/layout, rodar `qa/probe-framing.mjs` e exigir 24/24.
- **Dom de venda é hit-test, não área desenhada**: `sellHover` vem de
  `elementFromPoint` sobre `[data-sell-target]`. Qualquer flutuante novo no lado
  direito (o `SellFab` é o de hoje) tem que ser medido contra os 24 buracos —
  `qa/probe-sell-fab.mjs` faz isso em três janelas e falha se algum chão cair em
  cima do botão (soltar ali venderia em vez de pousar).
- HMR preserva `useMemo` de material three → reiniciar dev ou Ctrl+Shift+R ao
  editar shaders/cores.
- GLSL silencioso: vírgula antes de `)` quebra compilação e a mesh SUMIA (hoje
  o laço Playwright pega pelo console; ainda assim escanear GLSL editado).
- **Não deslocar casca de malha AO LONGO DA NORMAL se a malha tem pontas
  finas** (cabelo/crista de chamas): as duas faces da MESMA ponta empurram
  para lados opostos, viram na quina e nascem "rachaduras" no print. A lição
  da casa ("relevo vem do deslocamento na normal", régua do Astral
  `amp = min(uAmp, rMin·0,25)`) vale para peça PROCEDURAL GROSSA; para casca
  de malha finíssima, deslocar por EIXO suavizado (a regra está na seção do
  Ignis Nv.1).
- **Osso de esqueleto animado na mão carrega o valor de repouso na conta**:
  `bone.position.y = oscilação` apaga o repouso e arranca o esqueleto do
  lugar (o `root` do ignis descansa em −1,0). Padrão: `JOINT_Y[0] + osc`.
- **Textura do `useGLTF` NÃO se dispõe** (cache compartilhado do drei): ao
  desmontar um rig de malha importada, dispose só os materiais por instância
  e o `skeleton`.
- **Vestindo shader da casa em malha importada: confira o que o shader LÊ da
  geometria** — `aSeed` precisa ser carimbado em TODO vértice
  (`setSeedAttribute`; bound curto = o WebKit não desenha nada — a lição do
  iPhone) e `uv.y` precisa existir (o trimesh entrega; nem todo export
  entrega). O `WIND_VERT` lê os dois.
- `<sprite>` sem `map` = quadrado sólido.
- Pipeline de cor: hex dos catálogos já compensam a linearização do three;
  não "corrigir" um material isolado.
- Flaky ocasional: `ui.test.tsx` "tempo persistido" (sync de 0,14s).
- **Painel DOM da prévia de fusões**: no jsdom `offsetWidth` é 0 e o CSS é
  stubbeado, então o placement só roda nos testes com `offsetWidth/offsetHeight`
  e `window.innerWidth/innerHeight` craveados à mão; o pino de
  `pointer-events: none` e o "não tapa nenhum dos dois monstros" são do browser
  real (`qa/probe-merge-preview.mjs`). O corpo que vai na mão é desenhado
  FLUTUANDO (`DRAG_LIFT`) e com lag do follow — por isso a sonda tolera folga de
  `RAIO − 2` px e é por isso que o store guarda a tela projetada dos três pontos
  (ponteiro, slot mirada, corpo na mão).
- **🎓 A luvinha ILUSTRA, ela nunca joga pelo jogador.** `TutorialHand` só escreve
  `transform`/`opacity`/`data-fase`; nenhum `mime` chama ação do store e o passo
  só fecha pela jogada real (`tutorialPlayDone`). Foi a correção que o usuário
  cobrou ("moveu o monstro um no outro e depois vendeu sozinho") — se algum
  futuro efeito da luva começar a chamar `beginDragCandidate`/`sell`, o tutorial
  volta a se auto-jogar. Pino: `src/tests/tutorial.test.tsx`, describe *A luva
  ilustra, quem joga é o jogador*.
- **🎓 Overlay DOM em cima de buraco TRAVA a criatura** (mesma regra do dock): a
  faixa/luva/aro/fantasma do tutorial são `pointer-events: none` E a faixa é
  colocada por custo que considera os 24 buracos projetados **e** a caixa de
  `.sell-fab` (real ou fantasma) como obstáculo sólido. `qa/probe-tutorial.mjs`
  exige 24/24 livres no passo 1, no 4, no 5, depois do tutorial e no retrato, e
  que a faixa não cubra o botão dourado.
- **🎓 Um slot de toast só**: `toast: {id,kind,msg}` no store — dois `pushToast`
  no mesmo tick viram o último. Daí a coalescência por pressionada
  (`pressaoSeq`/`recadoDestaPressao`/`toqueDestaPressao`: toque + arraste
  candidato nascem do mesmo `pointerdown`) e a despedida atrasada
  (`TUTORIAL_FAREWELL_DELAY_MS`) para não engolir o recado da venda.
- **🎓 Câmera travada nos passos com mímica**: `enableRotate` no frame de
  depois do `pointerdown` é TARDE — o OrbitControls já embolsou o gesto e o
  arraste vira órbita (o destino foge do dedo e a fusão nunca sai). Por isso
  `cameraTravada` vale nos passos em que `TUTORIAL_STEP_DEF[step].mime` existe.
- **🎓 O card de status aberto cobre a arena no layout compacto (dívida
  pré-existente, não é do tutorial)**: `@media (max-width: 900px)` faz do
  `.inspector` uma folha CENTRADA (medido em 390×844: 16..374×285..560 contra
  buracos em y 334..548) → com ele aberto nenhum dos 24 buracos recebe
  `pointerdown`, ou seja, no celular não dá para mover/fundir/vender enquanto o
  card está na tela. O tutorial fecha o card ao entrar no passo de arraste
  (`selectedId: null`); `qa/probe-framing.mjs` nunca abre o inspetor e por isso
  nunca viu isso. Consertar de verdade (card lateral/rodapé que não tape a
  quadra) é trabalho separado.
- **Relógio de animação: o carimbo da própria frame do rAF** para `t0` e `agora`
  — `performance.now()` tem origem diferente em alguns ambientes (jsdom marca
  desde a navegação, Node desde o processo) e misturar os dois faz a animação
  nunca começar (ou nunca terminar).
- **Sonda que mede tempo do Node pula fase**: `page.evaluate` a cada 80 ms pode
  ver uma frame a cada >850 ms com a máquina carregada, e aí a checagem culpa o
  jogo. Gravar DENTRO da aba (rAF ou `MutationObserver`) e/ou esperar a cena
  assentar antes de ler posição (`cenaQuieta()` — depois de um drop recusado a
  criatura volta voando para o buraco).
- **Rodar os testes com `--localstorage-file` NOVO**: arquivo reaproveitado vaza
  o save/settings da execução anterior (bloom 80, `tutorialDone`) e produz falso
  negativo — `NODE_OPTIONS="--localstorage-file=/tmp/opencode/ls-<novo>" npx
  vitest run --pool=forks --poolOptions.forks.singleFork`.
- UI e comentários em **PT-BR**; aprovar visual só com screenshot (nos do
  laço Playwright valem) — nunca aprovar às cegas.
