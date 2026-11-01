# HANDOFF — Elemental Battle: Merge Arena

> Relatório de continuidade do projeto. Escritado a partir da **inspeção direta do
> código em 31/out/2026**, não de memória de conversa. Uma nova sessão de
> desenvolvimento deve conseguir continuar este trabalho lendo só este arquivo.
>
> **Estado da árvore no momento deste relatório (verificado):**
> `npx tsc --noEmit` OK · `npx vitest run` **164 testes / 15 arquivos, todos verdes** ·
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

> ## ⚡ ATUALIZAÇÃO — Raio com rig de shader próprio (gráficos da árvore elemental)
>
> Primeiro elemento da árvore a receber o figurino dos puros (rig próprio +
> shaders + projétil-assinatura + FX de impacto). Padrão para as próximas
> espécies da árvore:
>
> - **`scene/lightningShaders.ts`** — trio de materiais: `makeLightningShellMaterial`
>   (corpo **opaco** com luz fake da arena como o do golem, nervuras elétricas,
>   aletas que eriçam na carga e **cavidade de plasma via `discard`** que expõe
>   o núcleo no peito), `makeArcMaterial` (traço aditivo tracejado correndo ao
>   longo do uv.y + zigue-zague radial em patamar; aceita instancing via aSeed)
>   e `makeCoreMaterial` (plasma dourado pulsante).
> - **`scene/LightningRig.tsx`** (`SPECIES_RIGS.raio`): anéis orbitais viram
>   arcos elétricos nos materiais de arco (fluxos opostos), faíscas pontuais
>   que ESTALAM (points), pool de 6 rajadas curtas exalando do núcleo, ataque
>   com carga → clarão branco na frente do corpo + salva de rajadas. Peças que
>   usam material com `aSeed` recebem **clone da geometria com aSeed** (rigs
>   antigos do stone/wind não tinham isso — a falta só zera a fase).
> - **Projétil-assinatura:** `ProjectileField` tem o caso `isBolt` — fio de
>   arco (cilindro casca aberto do MESMO material da criatura) alinhado à
>   velocidade + núcleo de plasma instanciado na cabeça; clones de corrente
>   viram mini-relâmpagos automaticamente.
> - **FX de impacto (`Effects.tsx`):** novo pool de **arcos jagados**
>   (LineSegments aditivos, zigue-zague recalculado por frame). Branch `raio`
>   antes das famílias genéricas: arco de chegada + dispersão em mini-arcos
>   (`spawnScatter`) + anéis/faíscas. Motor passou a enviar `pos2` (origem do
>   projétil) no evento `impact` e `species`/`level` no evento `chain`
>   (`types.ts` já aceitava; campos aditivos não quebram consumidores).
> - **Paleta e brilho (feedback do usuário por vídeo/print):** legibilidade vem
>   da opacidade — aditivo só em arcos/plasma; mults de nervura/rim/faíscas
>   cortadas ~3× e rajadas do núcleo mantidas CURTAS (exalação, não lança; na
>   salva do ataque também). Paleta **azul+ouro** (referência do usuário): o
>   azul elétrico é a corrente principal — `uCool`/`uCoolAmt` nos três shaders;
>   anel orbital maior azul / menor dourado, nervuras azul-clara, plasma
>   dourado com orla azul, arcos do `Effects` com cauda azul + miolo
>   azul-branco + "osso" dourado só no ponto mais quente, projétil com
>   `coolAmt` 0.78. Ajuste fino é só nos uniforms/cores dos factories.
> - Testes novos: `lightningProgression.test.ts` (rig registrado, materiais
>   constroem em jsdom com blending/instancing certos, invólucro do modelo,
>   `pos2`/`species`/`level` nos eventos de FX). Total: **164 testes**.
> - Ajuste fino posterior (feito direto no editor pelo autor): aura starburst
>   sólida e sóbria ao redor do núcleo, clarões bem menores e núcleo de plasma
>   NÃO-aditivo (transparent normal com orla azul discreta) — a legibilidade
>   mandando em tudo.
>
> ## ⚡ ATUALIZAÇÃO — Madeira com rig de tronco no PADRÃO DO GOLÉM (sessão atual)
>
> Segundo elemento da árvore com figurino próprio (referência do usuário:
> tronco com asas-leque de cristal esmeralda, joias no peito/ombros/testa).
> Pedido explícito: seguir o padrão do golem (corpo opaco, peso físico,
> estilhaços), NÃO o padrão elétrico do Raio:
>
> - **`scene/woodShaders.ts`** — análogo lenhoso do stoneShaders: casca OPACA
>   (ARENA_LIGHT fake + aro da equipe), sulcos VERTICAIS de casca (ruído
>   esticado em Y), musgo nas encimadas, resina âmbar e **veios de seiva
>   esmeralda** que pulsam com a regeneração (`uSap`) e acendem na carga
>   (`uCharge`) — as "fissuras de magma" da madeira. Instanciado via aSeed.
> - **`scene/WoodRig.tsx`** (`SPECIES_RIGS.madeira`): materiais de gema
>   esmeralda (opacos, flat shading; asas-leque levemente translúcidas) que
>   pulsam com o succo da árvore; esporos/folhas caindo em flutter (points,
>   elipse de folha — não o losango de pedra); pose de ataque "catapulta de
>   seiva" igual ao soco do golem (agacha/torce/destorce, galhos com tag
>   'arm' varrem, nuvem de esporos nos pés via smoke pool); clarão sóbrio na
>   esmeralda da barriga; joias com flick de respiração; asas levantam na carga.
> - **Modelo (`MODELS.madeira`)**: +9 peças — esmeralda-mãe na barriga, joia
>   da testa, esmeraldas nos ombros, 4 cristais de asa com tag 'wing'; raízes
>   -pés levantadas 5cm (o casco rotacionado afundava sob o piso — agora o
>   invólucro da espécie é amarrado por teste como o dos puros).
> - **Projétil-assinatura:** `ProjectileField.isSeed` — semente dodecaédrica
>   de casca com seiva acesa, cambalhota pesada no ar (o MESMO shader da
>   criatura, igual ao matacão do golem).
> - **FX de impacto (`Effects.tsx`):** pool de estilhaços dividido por *kind*
>   (`rock`/`wood`): os 4 meshes do pool trocam de geometria/material conforme
>   quem disparou — a Madeira cospe **brotos de casca com seiva** ('sprout');
>   branch `madeira`: partículas de folha/casca/pó de esmeralda, anel de musgo
>   + anel esmeralda interno e esporos (fumaça fria).
> - Testes novos: `woodProgression.test.ts` (6): rig registrado, joias/asas no
>   modelo, invólucro (asas quase atravessam o tile mas cabem), material de
>   casca opaco/instanciado, FX do impacto com espécie/nível/origem, regen do
>   ancião o mantém de pé. Total: **170 testes**.
>
> ## 🌋 ATUALIZAÇÃO — Magma virado VULCÃO no padrão do golem (sessão atual)
>
> Terceiro elemento da árvore com figurino próprio (pedido do usuário: maior,
> formato de vulcão, inspirado no golem/Madeira). O print de aprovação revelou
> o problema clássico do shader de pedra em corpo grande: **textura esticada**
> (relevo deslocando vértices em malha de 9-10 segmentos rasga/distorce) e
> lava saturando tudo em laranja sólido. Corrigido assim:
>
> - **Modelo (`MODELS.magma`)**: corpo de montanha em 3 socalcos (cyl 24 seg
>   radiais × 5-6 verticais), torus de cratera (12×32), blocos-pés/braços em
>   `dodeca` subdivide 1, cabeça pequena na beirada (truque de escala). Os
>   braços saíram de box (2 tris/face rasgava) para dodeca. `formTops` [3.9]
>   preservado; `getGeometry` agora aceita subdivide em `dodeca`/`octa`.
> - **`stoneShaders`**: novos uniforms `uCrackScale`/`uCrackWidth`/
>   `uCrackBoost` (default idêntico ao visual antigo do golem — 0.45/0.58
>   ≡ 0.5±0.055). Corpo de montanha usa `crackScale` 1.35–2.2 para os veios
>   não virarem rios gigantes nas encostas e faixa larga o bastante para não
>   serrar; glow do corpo baixado de 1.5→1.15 (o 2.4 saturava).
> - **`MagmaRig.tsx`** (`SPECIES_RIGS.magma`): clone do padrão StoneRig —
>   pose de arremesso (agacha/torce/destorce, braço com tag 'arm' varre,
>   ombros 'spike' estufam), núcleo de lava na cratera com `makeCoreMaterial`
>   repaletado (gold #ff5a1f, orla QUENTE #ffcf7a — sem azul), brasas que
>   SOREM da cratera (oposto das lascas do golem), cinza ambiente + baforada
>   nos pés via smoke pool, crumble na morte.
> - **Projétil-assinatura:** `ProjectileField.isBoulder` — bloco de lava
>   (basalto `crackGlow` 2.2, fissuras respirando em voo) + coração de plasma
>   no miolo, cambalhota pesada igual ao matacão do golem.
> - **FX de impacto:** kind 'lava' no pool de estilhaços (cacos de basalto
>   incandescente quicando) + branch `magma`: bola de fogo + brasas subindo
>   + debris escuro + anéis #ff6a1f/#ffd08a + cinza quente (heat 0.25).
> - Testes novos: `magmaProgression.test.ts` (6): rig registrado, socalcos +
>   malha densa amarrada (≥20 radiais, ≥4 verticais, dodeca subdiv), cabeça
>   pequena, invólucro (pé largo < TILE_SPACING_X, minY ≥ -0.06), uniforms de
>   fissura, núcleo não-aditivo com orla quente, FX do motor. Total: **176
>   testes**.
>
> ## ❄️ ATUALIZAÇÃO — Gelo virado GOLEM DE CRISTAL branco (sessão atual)
>
> Quarto elemento da árvore com figurino próprio (pedido: maior, mais BRANCO,
> translúcido/reflexivo, expelindo flocos parado, estaca do mesmo material que
> estilhaça no alvo). WaterRig foi descartado a pedido (água não serve p/
> cristal); o figurino vem de shader novo, no padrão FÍSICO do golem:
>
> - **`scene/iceShaders.ts`** — cristal SEM aditivo nem refração real: corpo
>   quase branco com miolo denso azulado, trincas internas finas (uCharge
>   acende na carga), reflexo fake da arena (specular apertado da key +
>   varredura do "teto" via fresnel — o brilho reflexivo sem cubemap),
>   translucidez física (alpha ~0.86, depthWrite LIGADO: embacia por dentro e
>   se autobreia), glitter gelado. Instanciado via aSeed (estaca e cacos usam
>   o MESMO material).
> - **Correção do 2º print (o "esticado" à esquerda):** mesmo mal do Magma —
>   frequência FIXA de ruído em peças grandes vira onda de contorno larga.
>   `uCrackScale` (frequência por porte: body 1.9, dark 1.5, glow/accent
>   1.5–1.6) + `uCrackWidth` fina (0.02–0.024 = trinca, não borracho). A
>   lição virou uniform dos dois shaders de material físico (pedra e gelo).
> - **Modelo (`MODELS.gelo`)**: torso de glaciar octa r1.0 escalado (peça
>   mais larga do modelo), 3 torres encimadas, ombros de cristal, braços de
>   icicle (tag 'arm') com punhos de lasca, icicles-pernas, coroa de espinhos
>   (4 tags 'spike' até y≈3.6 — usa bem o formTop 3.9), 2 fragmentos
>   orbitais e placa de geada no piso (ring 'trans'). Cores VISUALS clareadas.
> - **`IceRig.tsx`** (`SPECIES_RIGS.gelo`): flocos de neve SIX-BRAços points
>   caindo em deriva lenta com giro próprio (o floco é desenhado no frag por
>   3 eixos rotacionados — parado, ele expele neve); pose de arremesso da
>   estaca (agacha/torce, braço recua com trincas acesas → varre, coroa
>   eleva, rajada de névoa fria nos pés); grupos orbitais animados; clarão
>   sóbrio no peito; crumble/estilhaço na morte via uAmp.
> - **Projétil:** `ProjectileField.isSpike` — icicle cone 6-lados com a PONTA
>   no voo e rolando no próprio eixo (o reflexo varre as facetas), MESMO
>   shader da criatura, trincas "carregadas" em voo.
> - **FX de impacto:** kind 'ice' no pool de estilhaços (cacos de cristal
>   branco quicando) + branch `gelo`: estilhaços brancos/farpas azuis/glitter
>   de pó de gelo, placa de geada (2 anéis) e névoa fria (smoke heat 0).
> - Testes novos: `iceProgression.test.ts` (6) + conserto do comentário
>   quebrado em `magmaProgression.test.ts` no commit anterior. Total: **182
>   testes**.
>
> ### ❄️ ATUALIZAÇÃO 2 — reflexo DE VERDADE no Gelo (receitas externas adaptadas)
>
> Dois trechos que o usuário trouxe foram ADAPTADOS (não copiados) ao nosso
> shader:
>
> - Tutorial GLSL de gelo: o `normalMap` virou **micro-relevo procedural** —
>   gradiente de ruído perturba a normal (passo pequeno no espaço do ruído +
>   fator discreto 0.9×uBump = vidro liso, NÃO gelo jateado), o `reflectDir.y`
>   virou mini-arena fake (céu/piso/holofotes da equipe/streak de janelas) e o
>   spec exp128 virou `uReflPow` (110 corpo, 130 estaca, 120 cacos). O difuso
>   hemisférico+key da arena foi MANTIDO (sem ele o cristal chapava).
> - Receita three `envMap: scene.background` + `MixOperation` + reflectivity
>   .5 (SO 59530709): como nosso background é cor sólida, o envMap captura a
>   ARENA — **`scene/envProbe.ts`**: CubeCamera 128px, **um tiro one-shot por
>   contexto WebGL** (recapturar = feedback inválido de sampler no RT em
>   render; arena é estática), quem dispara se esconde no tiro, placeholder
>   2px até plugar. No frag: `textureCube(uEnv, refl)` mixado a `uEnvMix`
>   (corpo 0.5 / estaca e cacos 0.6 — o "reflectivity" da receita) SOBRE o
>   fake (beirada nunca escura = legibilidade). `plugArenaEnv` espalha a
>   textura p/ estaca (ProjectileField) e cacos (Effects).
> - Calibração: `env` (peso do reflexo real) e `bump` em `ICE_ROLE_LOOK`;
>   `envMix` nos materiais de estaca/cacos; peso do fresnel `fres * 0.62` no
>   mix de ambiente.
> - Sem testes novos (regra da fase: primeiro a aparência); total segue 182.
> - Próximo passo natural: replicar o padrão para os demais Nv.6–10
>   (vapor/areia primeiro), e o pool de arcos já serve
>   para tempestade/astral etc.
>
> ### ❄️ ATUALIZAÇÃO 3 — ciclo de autoinspeção (Playwright) + acabamento do Gelo
>
> O usuário pediu: *"instala o Playwright e inspecione você mesmo as criaturas e
> entre num ciclo de melhorias até um resultado equivalente à especificação"* e
> depois *"os modelos ainda são bem low poly, isso pode melhorar"*. Então o
> loop de aprovação por print do usuário ganhou um **laço de QA automático**:
>
> - **`playwright -D` + chromium instalado** (`npx playwright install
>   chromium`). Roda com SwiftShader: `--enable-unsafe-swiftshader --use-gl=angle
>   --use-angle=swiftshader` — WebGL de verdade, e o **console do navegador é o
>   verificador de compilação de GLSL** (jsdom não compila shader; "SEM ERROS"
>   no print do script = os shaders compilam).
> - **`qa/inspect-species.mjs <espécie> [aliada]`**: liga o modo debug → nova
>   partida → spawn debug da espécie (+ aliado tanque p/ a luta durar) → close
>   no **viewer do bestiário** (câmera na FRENTE do modelo; clique sem arrasto
>   no canvas dispara a demo de arremesso: windup/release) → arena com órbita
>   180° + zoom → **rajada de 40 frames** da luta. Prints em
>   `%LOCALAPPDATA%\Temp\opencode\shots`.
> - **`qa/find-particles.ps1`**: varre os frames da rajada contando pixels
>   "gelados" (claros + azulados) agrupados em células de 40px — células
>   lotadas são o corpo do golem, células médias são projétil/cacos — e salva
>   zoom 3× no centróide. Foi assim que se achou a estaca em voo e o estilhaço
>   sem ler 40 prints. **`qa/diff-shots.ps1`** mede se duas capturas diferem.
> - IDs de teste adicionados ao fonte p/ o script: `open-bestiary` (botão 📖 do
>   HUD) e `settings-tab-debug` (aba Depuração). O card **selado** do bestiário
>   mostra o **rig real quando o modo debug está ligado**
>   (`MonsterViewer locked={!debugMode}`) — inspeção sem tocar na regra de
>   descoberta (o teste "debug não é descoberta" continua amarrando).
> - **Silhueta do Gelo em terraços de prisma** (o padrão consagrado do Magma,
>   agora em quartzo): 3 cilindros poligonais **DENSOS** (12 radiais × 5-6
>   anéis) rodados entre si (as facetas nunca alinham), cabeça octa sub 1
>   (sub 2 + deslocamento = bola de neve), coroa de icicles grossos, corcunda
>   deitada nas costas, braços de icicle PENDURADOS em ombreiras com garra de
>   lasca no punho, farpas orbitais **sub 0 alongadas** (sub 2 = bolinha de
>   beisebol) e halo de geada. Regra anti low-poly amarrada em teste: peça com
>   deslocamento exige malha densa (`a[3] ≥ 10`, `a[4] ≥ 4`).
> - **Trinca de gelo reescrita**: ruído **dobrado** (`abs(v*2-1)` = cume
>   estreito) segmentado por um segundo ruído (`seg` fbm) → traços que param e
>   recomeçam, não a onda de contorno do mármore. `uCrackWidth` agora é a
>   **meia-largura do cume** em unidades de ruído (0,035–0,07).
> - **Normais planas** no IceRig (`index ? toNonIndexed() : clone()` +
>   `computeVertexNormals`): gemeta facetada pega a luz da arena em ângulo e
>   pisca; normal interpolada em malha densa = plástico. Poliedros já vêm não
>   indexados (o `toNonIndexed()` puro inundava o console de warning).
> - **Cacos do estilhaço viraram farpas bicudas**: `OctahedronGeometry` escala-
>   do (0,5/1,7/0,5) — o dodeca sub 1 rodando no ar virava **bola de neve** (o
>   zoom pegou duas esferas brancas quicando). Pool de estilhaços **8** e o
>   impacto do Gelo cospe **4 farpas** com vida 0,95s, mais velocidade, salto
>   e cambalhota que a pedra.
> - Halo de geada (`trans`): alfa 0,3→0,16 e `env` 0,25→0,15 (virava placa
>   cinza no macro) e **nunca** usa o tint da equipe (o print da câmera rasa
>   mostrou o anel verde-jade).
> - Câmera: `minDistance` 10→**3** (`CameraController`) — o clamp antigo
>   deixava estaca e cacos minúsculos na tela; agora dá para inspecionar o
>   figurino (e o jogador também aproveita).
> - Total segue **182 testes** verdes; tsc/build OK.
>
> ### ♨️ ATUALIZAÇÃO 4 — Vapor virado CALDEIRA VIVA (sessão atual)
>
> Pedido em andamento do usuário: *"tente adicionar mais vérticies, para ficar
> menos low polly"* — virou **regra do projeto** e está amarrada em teste.
>
> - **Achado da leva: o `assets.ts` IGNORAVA o argumento de subdivisão do
>   'ico'** (`IcosahedronGeometry(args[0])` puro). Todo poliedro que pedia
>   sub 2 vinha sub 0 — essa era a fonte do "low poly" escondido. Corrigido
>   (`args[1] ?? 0`) + capsule 6×16; teste pin: `getGeometry('ico',[r,2])`
>   tem >3× os vértices de sub 0.
> - **Densidade mínima amarrada** (`steamProgression.test.ts`): tambores com
>   deslocamento ≥16 radiais × ≥4 anéis verticais; poliedro com `amp` exige
>   subdivisão ≥1; toros de reforço ≥12 tubulares × ≥30 ao redor.
> - **Vapor = caldeira de ferro viva** (Nv.6): corpo de chapa em 3 socalcos
>   (o VENTRE é o mais largo — o teste pegou a gargalo 1.52 empatada com o
>   ventre e a silhueta chapava), pés de cone com a ponta no chão, leito de
>   brasas + porta do fogo acesa na barriga, arcos de cobre (accent), bicos
>   de vapor laterais (tag arm, o rig varre no jato), válvulas nas costas
>   (tag spike), aro + alça sobre a boca, **cabeça de nuvem** (4 ico sub 2
>   empilhados, amp até 0.115), olhos do braseiro NA nuvem, gotas ferventes
>   em órbita e anel escaldante rente ao chão. Forma única Nv.6 (sem
>   variantes de nível) e invólucro: ventre >1.5m, maxY ≈ 3.86 ≤ formTop+0.4.
> - **`steamShaders.ts`** (novo): nuvem com alfa em ruído FBM correndo para
>   baixo + gradiente térmico pela **altura de mundo** (pêssego embaixo do
>   braseiro → branco-azulado no alto). Lições do print: alfa alta no
>   rasante = **bola de aquário** → alfa INVERTIDA (`1.06 - 0.5*fres`, fiapo
>   no limbo); contraste de densidade alto (caroco denso + buraco fiapo);
>   nuvem translúcida **nunca** usa tint da equipe (regra do halo de geada —
>   o uTeamColor foi REMOVIDO do shader).
> - **Chapa de ferro** = shader de pedra com paleta ferro (`IRON_ROLE_LOOK`):
>   corpo `crackScale 3.2 / crackWidth 0.012 / crackGlow ≤0.5` — veio FINO e
>   denso (a lição do Gelo; veios largos renderizaram "aros de mármore
>   queimado") e rockA clareado (`#b9c2cf`) porque ferro escuro lia "fundido
>   queimado". Fervura na boca = `makeCoreMaterial` repaletado quente
>   (`#ffe0b0/#fff8ec/#cfe8ff`, amp 0.09, y-scale 0.38): azul-pálido +
>   facetado virava **cubo de gelo**; amp .12 achatado virava **pão sovado**.
> - **Gotas orbitais**: papel é gota fervente soltando vapor → role `steam`,
>   NUNCA `glow` (o print mostrou carvões vermelhos orbitando).
> - **Projétil-assinatura** (`ProjectileField`): pluma de vapor — casca de
>   cone (raio 0.3 no topo voltado ao ALVO, 0.04 na cauda) com o MESMO shader
>   da nuvem + nódulo de água em ebulição na cabeça (`jetCore`). No print:
>   pluma branca no alvo ✓. FX de impacto (`Effects` branch `vapor`): vapor
>   pêssego subindo + gotas ferventes caindo + 2 anéis de escaldadura; a
>   rajada aplica burn+slow (amarrado em teste).
> - **Envelope fantasma (fix)**: o ponto de `gl_PointSize = size*(28/-z)`
>   estourava para centenas de px rente à câmera e desenhava uma redha de
>   vapor envolvendo a caldeira (print b-10). **Clamp `min(90.0, ...)`
>   aplicado nos 9 rigs** (Ice/Lightning/Magma/Flame/Stone/Vapor/Water/Wind/
>   Wood) — b-10 limpo na re-captura.
> - **VaporRig.tsx**: clone do padrão MagmaRig — janela de ataque 0.62s,
>   windup 0.5 (fervura sobe devagar e segura), nuvem inteira incha/clareia
>   (uCharge), bicos recuam e varrem, baforada de smoke na boca no disparo
>   + fio contínuo de vapor, morte = caldeira **arreenta em vapor**
>   (crumble → uCharge + amp).
> - Total: **189 testes** verdes (7 novos de vapor); tsc/build OK; 4 rodadas
>   de QA (console limpo = GLSL compila; viewer macro + b-frames + zoom de
>   partículas).
>
> ### 🗺️ PRÓXIMO PLANO (combinado com o usuário) — revisar o bestiário inteiro
>
> Rodar o ciclo `qa/inspect-species.mjs` em **cada** espécie restante, **um
> commit + push por monstro**, sem pressa: ~~vapor~~ ✅ → areia (Nv.6) →
> tempestade,
> obsidiana, pântano, plasma, névoa, cristal (Nv.7) → cósmico, geodo, abissal,
> vulcânico (Nv.8) → astral, colosso (Nv.9) → **primordial (Nv.10)**.
> Pedido especial para o último: **buraco negro com disco de acreção**, grande,
> e o ataque é uma **rajada de energia** (rever projétil/FX do primordial).

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
