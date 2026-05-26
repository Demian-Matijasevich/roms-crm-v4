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
        background: `radial-gradient(1400px 900px at 0% 0%, var(--mesh-a), transparent 55%),
                     radial-gradient(1200px 800px at 100% 100%, var(--mesh-b), transparent 55%),
                     radial-gradient(800px 600px at 50% 80%, var(--mesh-c), transparent 55%)`,
      }} />
      <div aria-hidden style={{
        position: "fixed",
        top: "-150px", left: "10%",
        width: 700, height: 700,
        pointerEvents: "none",
        zIndex: 0,
        background: "radial-gradient(circle, var(--mesh-a), transparent 65%)",
        filter: "blur(80px)",
        animation: "uiMeshDrift1 20s ease-in-out infinite",
      }} />
      <div aria-hidden style={{
        position: "fixed",
        bottom: "-150px", right: "10%",
        width: 800, height: 800,
        pointerEvents: "none",
        zIndex: 0,
        background: "radial-gradient(circle, var(--mesh-c), transparent 65%)",
        filter: "blur(80px)",
        animation: "uiMeshDrift2 25s ease-in-out infinite",
      }} />
      <div aria-hidden style={{
        position: "fixed",
        top: "30%", right: "30%",
        width: 500, height: 500,
        pointerEvents: "none",
        zIndex: 0,
        background: "radial-gradient(circle, var(--mesh-b), transparent 65%)",
        filter: "blur(80px)",
        animation: "uiMeshDrift1 28s ease-in-out infinite reverse",
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
