"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { lipsync } from "@/lib/lipsync";

type Props = { url: string; rotationY?: number };

/**
 * Loads an ARKit-blendshape GLB/VRM avatar and brings it to life with:
 *   1. Amplitude-driven jaw movement, smoothed (lipsync).
 *   2. Subtle idle motion — gentle spine/head bobbing so he looks like he's
 *      breathing instead of frozen.
 *   3. Occasional natural blinks (every 2–5s, 200ms each).
 *
 * Bone/morph-target name matching supports both Mixamo/RPM/Avaturn-style
 * rigs and VRoid's "J_Bip_*" skeleton naming, so different avatar sources
 * can be swapped in via NEXT_PUBLIC_AVATAR_URL.
 */

type MorphGroup = { mesh: THREE.Mesh; indices: number[] };

function findMorphIndices(
  mesh: THREE.Mesh,
  predicate: (name: string) => boolean,
): number[] {
  if (!mesh.morphTargetDictionary) return [];
  const out: number[] = [];
  for (const name of Object.keys(mesh.morphTargetDictionary)) {
    if (predicate(name)) out.push(mesh.morphTargetDictionary[name]);
  }
  return out;
}

function findBone(scene: THREE.Object3D, patterns: RegExp[]): THREE.Object3D | undefined {
  let result: THREE.Object3D | undefined;
  scene.traverse((obj) => {
    if (result) return;
    const n = obj.name;
    if (patterns.some((p) => p.test(n))) result = obj;
  });
  return result;
}

export default function Avatar({ url, rotationY = 0 }: Props) {
  const { scene } = useGLTF(url);
  const smoothedMouth = useRef(0);
  const blinkState = useRef({
    nextBlinkAt: 1.5 + Math.random() * 2,
    blinkStartedAt: -1,
  });

  // Gather morph targets — mouth (lipsync) + blink — AND reset every
  // blendshape to 0. Some avatar exports (e.g. photo-based ones) ship with
  // non-zero default expression weights baked into the rest pose. If we
  // don't reset them, the avatar permanently looks like it's mid-expression.
  const morphs = useMemo(() => {
    const mouth: MorphGroup[] = [];
    const blink: MorphGroup[] = [];
    const allMorphNames = new Set<string>();
    const nonZeroDefaults: { name: string; value: number }[] = [];

    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!(m as any).isMesh || !m.morphTargetDictionary) return;

      // Reset every morph target on this mesh to neutral, recording what
      // was non-zero so we can see in the console what the avatar shipped
      // with.
      if (m.morphTargetInfluences) {
        for (const [name, idx] of Object.entries(m.morphTargetDictionary)) {
          allMorphNames.add(name);
          const v = m.morphTargetInfluences[idx] ?? 0;
          if (v > 0.001) nonZeroDefaults.push({ name, value: +v.toFixed(3) });
          m.morphTargetInfluences[idx] = 0;
        }
      }

      // Prefer ARKit jawOpen/mouthOpen; fall back to VRoid's native
      // "Fcl_MTH_A" (open-mouth "ah" viseme) for VRM avatars that don't
      // have the ARKit blendshapes added.
      const jaw = findMorphIndices(m, (name) => name.toLowerCase() === "jawopen");
      const mouthOpen =
        jaw.length === 0
          ? findMorphIndices(m, (name) => name.toLowerCase() === "mouthopen")
          : [];
      const vroidMouth =
        jaw.length === 0 && mouthOpen.length === 0
          ? findMorphIndices(m, (name) => name.toLowerCase() === "fcl_mth_a")
          : [];
      const mouthIdx = jaw.length ? jaw : mouthOpen.length ? mouthOpen : vroidMouth;
      const blinkArkit = findMorphIndices(m, (name) => {
        const n = name.toLowerCase();
        return (
          n === "eyeblinkleft" ||
          n === "eyeblinkright" ||
          n === "eyesclosed"
        );
      });
      // VRoid's native blink shape (used when ARKit blink shapes aren't present).
      const blinkVroid =
        blinkArkit.length === 0
          ? findMorphIndices(m, (name) => name.toLowerCase() === "fcl_eye_close")
          : [];
      const blinkIdx = blinkArkit.length ? blinkArkit : blinkVroid;
      if (mouthIdx.length) mouth.push({ mesh: m, indices: mouthIdx });
      if (blinkIdx.length) blink.push({ mesh: m, indices: blinkIdx });
    });

    console.log("[Avatar] morph targets in GLB:", Array.from(allMorphNames).sort());
    console.log(
      "[Avatar] morphs with non-zero defaults (now reset to 0):",
      nonZeroDefaults,
    );
    console.log(
      "[Avatar] using mouth shape:",
      mouth.length ? "jawOpen (or fallback)" : "NONE FOUND",
      "blink:",
      blink.length ? "yes" : "NONE FOUND",
    );
    return { mouth, blink };
  }, [scene]);

  // Gather bones for idle motion + arm posing.
  const bones = useMemo(() => {
    // Log every bone name containing "arm" or "shoulder" so we can
    // diagnose if the auto-pose doesn't take.
    const allArmBones: string[] = [];
    scene.traverse((o) => {
      if ((o as any).isBone || o.type === "Bone") {
        const n = o.name.toLowerCase();
        if (n.includes("arm") || n.includes("shoulder") || n.includes("clavicle")) {
          allArmBones.push(o.name);
        }
      }
    });
    console.log("[Avatar] arm/shoulder bones found:", allArmBones);

    return {
      spine: findBone(scene, [
        /spine2?$/i,
        /^spine$/i,
        /mixamorig:?spine$/i,
        /^j_bip_c_spine$/i, // VRoid
      ]),
      head: findBone(scene, [
        /^head$/i,
        /mixamorig:?head$/i,
        /wolf3d_head/i,
        /^j_bip_c_head$/i, // VRoid
      ]),
      leftArm: findBone(scene, [
        /^leftarm$/i,
        /:leftarm$/i,
        /^left_arm$/i,
        /^upperarm_l$/i,
        /^upper_arm\.l$/i,
        /^j_bip_l_upperarm$/i, // VRoid
      ]),
      rightArm: findBone(scene, [
        /^rightarm$/i,
        /:rightarm$/i,
        /^right_arm$/i,
        /^upperarm_r$/i,
        /^upper_arm\.r$/i,
        /^j_bip_r_upperarm$/i, // VRoid
      ]),
    };
  }, [scene]);

  // Hide the tongue mesh if the avatar shipped it as a separate mesh (some
  // photo-based avatars bake a forward-protruding tongue into a separate
  // mesh that isn't controlled by any resettable blendshape).
  useEffect(() => {
    const allMeshNames: string[] = [];
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!(m as any).isMesh) return;
      allMeshNames.push(m.name);
      if (m.name.toLowerCase().includes("tongue")) {
        console.log("[Avatar] hiding tongue mesh:", m.name);
        m.visible = false;
      }
    });
    console.log("[Avatar] all mesh names:", allMeshNames);
  }, [scene]);

  // Pose T-pose → arms-down on mount.
  //
  // Naïve `rotation.z = -1.25` swings the arm around whichever local axis
  // happens to be vertical for this rig — which varies per rig and can
  // swing the arms the wrong way (e.g. backwards instead of down).
  //
  // Robust approach: figure out which way the bone's shaft is *actually*
  // pointing in world space right now (head → tail), then compute the
  // world-space rotation that re-aims that shaft straight down. Convert
  // that world rotation into the bone's local space and apply.
  useEffect(() => {
    function poseBoneStraightDown(bone: THREE.Object3D) {
      bone.updateWorldMatrix(true, false);

      // Find which LOCAL axis points down the bone shaft. Standard rigs
      // use local +Y, but we can't assume — read it from the first child
      // bone's position (head→tail vector of the parent).
      let localShaft = new THREE.Vector3(0, 1, 0);
      const childBone = bone.children.find(
        (c) => (c as any).isBone || c.type === "Bone",
      );
      if (childBone && childBone.position.lengthSq() > 1e-6) {
        localShaft = childBone.position.clone().normalize();
      }

      // Where is the shaft pointing in world space right now?
      const worldQuat = new THREE.Quaternion();
      bone.getWorldQuaternion(worldQuat);
      const currentWorldDir = localShaft.clone().applyQuaternion(worldQuat).normalize();

      // We want it to point straight down (world -Y).
      const targetWorldDir = new THREE.Vector3(0, -1, 0);

      // Rotation in world space that achieves this.
      const worldRot = new THREE.Quaternion().setFromUnitVectors(
        currentWorldDir,
        targetWorldDir,
      );

      // Convert that world rotation into the bone's local frame and apply.
      // newWorldQuat = worldRot * currentWorldQuat
      // newLocalQuat = parentWorld⁻¹ * newWorldQuat
      const parentWorldQuat = new THREE.Quaternion();
      bone.parent?.getWorldQuaternion(parentWorldQuat);

      const newWorldQuat = new THREE.Quaternion().multiplyQuaternions(worldRot, worldQuat);
      const newLocalQuat = parentWorldQuat.invert().multiply(newWorldQuat);

      bone.quaternion.copy(newLocalQuat);
    }

    if (bones.leftArm) {
      poseBoneStraightDown(bones.leftArm);
      console.log("[Avatar] posed leftArm straight down");
    }
    if (bones.rightArm) {
      poseBoneStraightDown(bones.rightArm);
      console.log("[Avatar] posed rightArm straight down");
    }
  }, [bones]);

  // Capture neutral rotations so idle motion oscillates around the rest pose.
  const restPose = useMemo(() => {
    return {
      spineX: bones.spine?.rotation.x ?? 0,
      headX: bones.head?.rotation.x ?? 0,
      headY: bones.head?.rotation.y ?? 0,
    };
  }, [bones]);

  useEffect(() => {
    return () => {
      lipsync.value = 0;
    };
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.getElapsedTime();

    // --- 1. Lipsync (critically-damped smoothing toward target). ---
    const target = lipsync.value;
    const k = 1 - Math.exp(-dt * 18);
    smoothedMouth.current += (target - smoothedMouth.current) * k;
    const mouthV = Math.max(0, Math.min(1, smoothedMouth.current));
    for (const { mesh, indices } of morphs.mouth) {
      if (!mesh.morphTargetInfluences) continue;
      for (const i of indices) mesh.morphTargetInfluences[i] = mouthV;
    }

    // --- 2. Idle motion (breathing + subtle head drift). ---
    if (bones.spine) {
      bones.spine.rotation.x = restPose.spineX + Math.sin(t * 1.1) * 0.012;
    }
    if (bones.head) {
      bones.head.rotation.x =
        restPose.headX + Math.sin(t * 0.6 + 0.5) * 0.015;
      bones.head.rotation.y =
        restPose.headY + Math.sin(t * 0.27) * 0.025;
    }

    // --- 3. Blink (200ms total — 100ms close, 100ms open). ---
    const b = blinkState.current;
    let blinkV = 0;
    if (b.blinkStartedAt < 0 && t >= b.nextBlinkAt) {
      b.blinkStartedAt = t;
    }
    if (b.blinkStartedAt >= 0) {
      const dur = t - b.blinkStartedAt;
      if (dur < 0.1) blinkV = dur / 0.1;
      else if (dur < 0.2) blinkV = 1 - (dur - 0.1) / 0.1;
      else {
        blinkV = 0;
        b.blinkStartedAt = -1;
        b.nextBlinkAt = t + 2 + Math.random() * 3;
      }
    }
    for (const { mesh, indices } of morphs.blink) {
      if (!mesh.morphTargetInfluences) continue;
      for (const i of indices) mesh.morphTargetInfluences[i] = blinkV;
    }
  });

  return <primitive object={scene} position={[0, 0, 0]} rotation={[0, rotationY, 0]} />;
}
