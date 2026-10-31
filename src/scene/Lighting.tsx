/** Iluminação da arena: key com sombras + preenchimento hemisférico + tons das equipes. */
export function Lighting() {
  return (
    <group>
      <hemisphereLight args={['#8fb2ff', '#141a2c', 0.75]} />
      <ambientLight intensity={0.18} color="#a8c4ff" />
      <directionalLight
        position={[7, 15, 5]}
        intensity={1.7}
        color="#ffe9c4"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={55}
        shadow-bias={-0.0004}
      />
      {/* tons das equipes: jogador dourado, IA violeta (no meio das plataformas) */}
      <pointLight position={[0, 3.6, 5.3]} intensity={22} distance={17} decay={2} color="#f5c451" />
      <pointLight position={[0, 3.6, -5.3]} intensity={22} distance={17} decay={2} color="#9d5cff" />
      <pointLight position={[0, 4.6, 0]} intensity={12} distance={12} decay={2} color="#6d4fff" />
    </group>
  );
}
