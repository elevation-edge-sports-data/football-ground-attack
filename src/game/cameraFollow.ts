/** World point the orbit camera keeps at the center of the view. */
export const followTarget = { x: 0, y: 0.9, z: 0 };

export function setFollowTarget(x: number, y: number, z: number) {
  followTarget.x = x;
  followTarget.y = y;
  followTarget.z = z;
}
