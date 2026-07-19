export function canStartReload(
  magazine: number,
  magazineSize: number,
  isReloading: boolean,
) {
  return !isReloading && magazine < magazineSize;
}

export function consumeMagazineRound(magazine: number) {
  return Math.max(0, magazine - 1);
}
