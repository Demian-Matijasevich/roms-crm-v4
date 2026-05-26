"use client";

/**
 * Mesh gradient background animado con blobs blureados que driftan.
 * Se mete fixed detrás de toda la UI. Compatible dark/light por usar
 * vars CSS — los colores los gobierna la paleta.
 *
 * Uso: <MeshBackground /> dentro del root layout del dashboard.
 */
export default function MeshBackground() {
  return (
    <>
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        background: `radial-gradient(1200px 800px at 0% 0%, var(--mesh-a, rgba(120,80,255,0.20)), transparent 60%),
                     radial-gradient(1000px 700px at 100% 100%, var(--mesh-b, rgba(30,180,255,0.16)), transparent 60%),
                     radial-gradient(600px 500px at 50% 80%, var(--mesh-c, rgba(255,80,200,0.10)), transparent 60%)`,
      }} />
      <div aria-hidden style={{
        position: "fixed",
        top: "-200px", left: "20%",
        width: 600, height: 600,
        pointerEvents: "none",
        zIndex: 0,
        background: "radial-gradient(circle, var(--mesh-a, rgba(120,80,255,0.18)), transparent 65%)",
        filter: "blur(60px)",
        animation: "uiMeshDrift1 20s ease-in-out infinite",
      }} />
      <div aria-hidden style={{
        position: "fixed",
        bottom: "-200px", right: "15%",
        width: 700, height: 700,
        pointerEvents: "none",
        zIndex: 0,
        background: "radial-gradient(circle, var(--mesh-c, rgba(255,80,200,0.10)), transparent 65%)",
        filter: "blur(60px)",
        animation: "uiMeshDrift2 25s ease-in-out infinite",
      }} />
      {/* Noise texture overlay */}
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.035,
        mixBlendMode: "overlay",
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }} />
      <style>{`
        @keyframes uiMeshDrift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px, 40px); } }
        @keyframes uiMeshDrift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px, -30px); } }
      `}</style>
    </>
  );
}
