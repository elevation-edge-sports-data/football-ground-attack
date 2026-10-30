/**
 * Hierarchical joints. Local Euler is identity in the demo.
 * Feet replace skates. The football hangs off the right hand.
 * Local −Z is the front, and limbs hang along −Y.
 */
export const POSE_JOINTS = [
  "body",
  "torso",
  "hips",
  "shoulders",
  "head",
  "lArm",
  "lFore",
  "lHand",
  "rArm",
  "rFore",
  "rHand",
  "football",
  "lLeg",
  "lShin",
  "lFoot",
  "rLeg",
  "rShin",
  "rFoot",
] as const;

export type PoseJointId = (typeof POSE_JOINTS)[number];

/** Bind position of each joint in its parent. */
export const REST_POSITION: Record<PoseJointId, [number, number, number]> = {
  body: [0, 0, 0],
  hips: [0, 0.92, 0],
  torso: [0, 0.92, 0],
  shoulders: [0, 0.5, 0],
  head: [0, 0.05, 0],
  lArm: [-0.26, -0.02, 0],
  lFore: [0, -0.3, 0],
  lHand: [0, -0.28, 0],
  rArm: [0.26, -0.02, 0],
  rFore: [0, -0.3, 0],
  rHand: [0, -0.28, 0],
  football: [0, -0.06, -0.22],
  lLeg: [-0.12, -0.04, 0],
  lShin: [0, -0.4, 0],
  lFoot: [0, -0.36, 0],
  rLeg: [0.12, -0.04, 0],
  rShin: [0, -0.4, 0],
  rFoot: [0, -0.36, 0],
};
