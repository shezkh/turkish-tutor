"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Environment, OrbitControls } from "@react-three/drei";
import Avatar from "./Avatar";

export default function TutorScene() {
  const avatarUrl = process.env.NEXT_PUBLIC_AVATAR_URL ?? "";

  return (
    <div className="h-full w-full">
      <Canvas
        // Head-and-shoulders portrait framing — eyes in the upper third,
        // mouth roughly centered, arms cropped at the sides.
        camera={{ position: [0, 1.68, 1.1], fov: 28 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 2]} intensity={1.1} />
        <directionalLight position={[-2, 2, 1]} intensity={0.35} />
        <Suspense fallback={null}>
          {avatarUrl ? (
            // VRoid avatars face -Z by convention (opposite of the old
            // Avaturn rig), so rotate 180° to face the camera.
            <Avatar url={avatarUrl} rotationY={Math.PI} />
          ) : (
            <mesh>
              <boxGeometry args={[0.4, 0.4, 0.4]} />
              <meshStandardMaterial color="#f87171" />
            </mesh>
          )}
          <Environment preset="city" />
        </Suspense>
        {/* Locked-down controls — slight head movement allowed, no zoom,
            no panning down to expose the body / T-pose arms. */}
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          target={[0, 1.62, 0]}
          minPolarAngle={Math.PI / 2 - 0.18}
          maxPolarAngle={Math.PI / 2 + 0.12}
          minAzimuthAngle={-0.35}
          maxAzimuthAngle={0.35}
        />
      </Canvas>
      {/* Radial vignette overlay — fades the edges of the canvas to the
          background color so any T-pose arms that aren't fully posed away
          blend into darkness instead of jutting out. Pointer-events-none
          so OrbitControls still work underneath. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 75% at 50% 45%, transparent 0%, transparent 55%, #0f172a 92%)",
        }}
      />
      {!avatarUrl && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900/80 px-4 py-2 text-sm text-amber-300">
          Set <code>NEXT_PUBLIC_AVATAR_URL</code> in <code>.env.local</code>.
        </div>
      )}
    </div>
  );
}
