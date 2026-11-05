// 🌫️ Fog adaptivo (05/nov/2026): neblina que acompanha a câmera — começa a
// 0,4R além da distância câmera→alvo (a linha inimiga do tabuleiro fica limpa
// em toda fase/janela/zoom) e tem comprimento por cenário. Pinos estáticos no
// App e no componente; a densidade VIVA medida é pinada em qa/probe-fog.mjs
// (jsdom não roda WebGL/câmera).
import AdaptiveFogSource from '../scene/AdaptiveFog.tsx?raw';
import AppSource from '../app/App.tsx?raw';

describe('AdaptiveFog', () => {
  test('near segue a câmera: distância ao alvo + folga além da última linha do tabuleiro', () => {
    expect(AdaptiveFogSource).toContain('fog.near = dist + ARENA_R * FOG_NEAR_AHEAD');
    expect(AdaptiveFogSource).toContain('const FOG_NEAR_AHEAD = 0.4');
    expect(AdaptiveFogSource).toContain('fog.far = fog.near + ARENA_R * FOG_SPAN[variant]');
  });

  test('comprimento por cenário calibrado na sonda: subaquático é o mais turvo; a muralha da floresta (r 86–116) precisa do maior alcance', () => {
    const spans: Record<string, number> = {};
    const re = /(underwater|forest|arcane|ice|volcanic|'universe-end'):\s*([0-9.]+)/g;
    let m;
    while ((m = re.exec(AdaptiveFogSource)) !== null) spans[m[1]] = parseFloat(m[2]);
    expect(spans['underwater']).toBe(5.0); // a névoa mais densa
    expect(spans['arcane']).toBe(4.6);
    expect(spans['ice']).toBe(5.5);
    expect(spans['volcanic']).toBe(6.0);
    expect(spans['forest']).toBe(8.0); // maior: a muralha é a vegetação mais distante do jogo
    expect(spans["'universe-end'"]).toBe(0); // estrelas pedem céu aberto
  });

  test('o fog é montado/desmontado com o cenário (cor e ciclo de vida no useEffect, vivo através do render via ref)', () => {
    expect(AdaptiveFogSource).toContain('scene.fog = ownRef.current');
    expect(AdaptiveFogSource).toContain('scene.fog = null');
    expect(AdaptiveFogSource).toContain('[scene, color]');
  });
});

describe('App monta o fog adaptivo no lugar do fixo', () => {
  test('AdaptiveFog com a cor e o cenário ativos; fim-do-universo segue SEM fog', () => {
    expect(AppSource).toContain('<AdaptiveFog color={sceneBackground} variant={activeArenaScene} />');
    expect(AppSource).toContain("activeArenaScene !== 'universe-end' && (");
  });

  test('o fog FIXO morreu: nenhum multiplier ARENA_R * número no App (regressão proibida)', () => {
    expect(AppSource).not.toMatch(/<fog\b/);
    expect(AppSource).not.toMatch(/ARENA_R \* \([0-9.]/);
  });
});
