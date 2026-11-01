/** Geração da sessão Auth. Um clear agendado antes de um login novo não pode apagar esse login. */
let epoch = 0;

export function isoProJwtEpoch(): number {
  return epoch;
}

export function bumpIsoProJwtEpoch(): number {
  epoch += 1;
  return epoch;
}
