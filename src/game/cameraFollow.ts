/**
 * World point the camera keeps as its focus.
 * Facing is the carrier's field direction. Chase sits behind it.
 * North is facingX 0, facingYard 1.
 */
export const followTarget = { x: 0, y: 0.9, z: 0, facingX: 0, facingYard: 1 };

export function setFollowTarget(x: number, y: number, z: number, facingX?: number, facingYard?: number) {
  followTarget.x = x;
  followTarget.y = y;
  followTarget.z = z;
  if (facingX !== undefined) followTarget.facingX = facingX;
  if (facingYard !== undefined) followTarget.facingYard = facingYard;
}
