/**
 * Field yards to the world frame in src/field/spec.ts.
 * World X is the right sideline. World Z is −yard, so north is −Z.
 * A player mesh faces local −Z. yaw 0 looks north.
 * North (facingX 0, facingYard 1) → yaw 0, front stays (0, 0, −1).
 * Right sideline (facingX 1, facingYard 0) → yaw −π/2, front becomes (1, 0, 0).
 */
export function worldFromField(x: number, yard: number, y = 0): [number, number, number] {
  return [x, y, -yard];
}

export function yawFromFacing(facingX: number, facingYard: number) {
  return Math.atan2(-facingX, facingYard);
}
