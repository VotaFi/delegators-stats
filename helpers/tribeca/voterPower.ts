import { Escrow, Locker, LockerParams } from "../../clients/locked-voter/src";


export function calculateVoterPower(locker: Locker, escrow: Escrow, now: bigint): bigint | null {
  // invalid `now` argument, should never happen.
  if (now === BigInt(0)) {
    return null;
  }

  if (escrow.escrowStartedAt == BigInt(0)) {
    return BigInt(0);
  }

  // Lockup had zero power before the start time.
  // at the end time, lockup also has zero power.
  if (now < escrow.escrowStartedAt || now >= escrow.escrowEndsAt) {
    return BigInt(0);
  }

  const secondsUntilLockupExpiry = escrow.escrowEndsAt - now;
  if (secondsUntilLockupExpiry < BigInt(0)) {
    return null;
  }

  // elapsed seconds, clamped to the maximum duration
  const relevantSecondsUntilLockupExpiry = secondsUntilLockupExpiry > locker.params.maxStakeDuration
    ? locker.params.maxStakeDuration
    : secondsUntilLockupExpiry;

  // voting power at max lockup
  const powerIfMaxLockup = escrow.amount * BigInt(locker.params.maxStakeVoteMultiplier);

  // multiply the max lockup power by the fraction of the max stake duration
  const power = (powerIfMaxLockup * relevantSecondsUntilLockupExpiry)/(locker.params.maxStakeDuration);

  return power;
}

export type { Locker, LockerParams, Escrow };