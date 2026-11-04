# HANDOFF — Elemental Battle: Merge Arena

> Estado verificado em **03/nov/2026** por inspeção direta + suíte rodando:
> `npx tsc --noEmit` OK · `npx vitest run` **360 testes / 34 arquivos, todos
> verdes** · `npm run build` OK · git em `main` (repo público
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
   antes do pow é a regra.

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
  antigas.
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
- **Puros com figurino completo e aprovado**: ignis (FlameRig), zephyr
  (WindRig), golem (StoneRig — o padrão físico modelo), nereia (WaterRig) —
  5 formas visíveis cada, gateadas por `minLvl/maxLvl`.
- **Arena**: ilha flutuante, plataformas derivadas de `game/board.ts`
  (`TILE_SPACING_X 5,2 · ROW_DEPTH 5,2 · FRONT_ROW_Z 3,1 · UNIT_BASE_Y 0,28 ·
  MONSTER_FOOT_R 2,5 · ARENA_R ≈ 23 · 12 slots/lado`), enquadramento travado em
  `ORBIT_TARGET`/`CAMERA_POS` do `board.ts` (dist ~53, inclinação ~43°, alvo
  deslocado para o jogador — 24/24 buracos alcançáveis pelo ponteiro), câmera
  orbital 360° (dist 3–`ARENA_R×2,76`, polar 0,35–1,32) e fog/luz derivados de
  `ARENA_R`. Loja com `max-width: 400px` no CSS para o dock não cobrir o board.
- **QA visual automatizado** (laço Playwright descrito acima), 357 testes/34.

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
```

## Armadilhas (resumo)

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
