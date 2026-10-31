# QA visual (o "olho" do agente)

Laço de autoinspeção de aparência: o agente abre o jogo num Chromium headless,
spawna a espécie pelo **modo debug**, fotografa (viewer do bestiário de frente,
arena em órbita/zoom, rajada de combate) e mede os frames — sem depender de o
usuário aprovar print por print. jsdom **não compila GLSL**, então o console do
navegador é o verificador de shader quebrado.

## Pré-requisitos

```
npm i -D playwright && npx playwright install chromium   # já no package.json
npm run dev                                              # localhost:5173
```

## Uso

```
node qa/inspect-species.mjs <especie> [aliada] [saidaDir]
# ex.: node qa/inspect-species.mjs gelo golem
# prints em %LOCALAPPDATA%\Temp\opencode\shots\<especie>-{idle,view-1,
# view-windup,view-release,front,macro,b-00..39}.png
```

O script liga Configurações → Depuração → Modo debug, inicia partida, spawna a
espécie (+ uma aliada tanque, para a luta durar o suficiente para a rajada de
40 frames), e ainda dispara a **demo de arremesso** do viewer: clique sem
arrasto no canvas do card.

Para achar o projétil/estilhaço sem ler 40 prints:

```
powershell -File qa/find-particles.ps1 <especie> [saidaDir] [ice|hot|leaf|bright|sand]
# varre os frames, agrupa pixels da cor do projétil em células de 40px e salva
# zoom 3x no centróide das células médias (célula lotada = corpo da criatura)
powershell -File qa/diff-shots.ps1 a.png b.png   # a câmera andou entre os dois?
```

Testar espécie **selada** no viewer funciona: com o modo debug ligado, o card
selado mostra o rig real (`MonsterViewer locked={!debugMode}`), sem violar a
regra de que debug não é descoberta.
