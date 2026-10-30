export const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

export function randomInt(max) {
  const range = 2 ** 32;
  const limit = range - range % max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

export function shuffled(items, random = randomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function validateNames(names) {
  if (names.length < 3 || names.length > 5) throw Error('Escolha de 3 a 5 pessoas para a roda.');
  const clean = names.map(name => name.trim());
  if (clean.some(name => !name || name.length > 40)) throw Error('Preencha todos os nomes com até 40 caracteres.');
  if (new Set(clean.map(name => name.toLocaleLowerCase('pt-BR'))).size !== clean.length) throw Error('Use nomes diferentes para cada pessoa.');
  return clean;
}

export function validateBank(input) {
  if (!Array.isArray(input) || !input.length || input.length > 5000) throw Error('O banco deve ser uma lista com 1 a 5.000 entradas.');
  const ids = new Set(), words = new Set();
  return input.map((item, index) => {
    const fail = () => { throw Error(`Entrada ${index + 1} inválida: confira ID, palavra, dificuldade, origem, estado e três dicas.`); };
    if (!item || typeof item !== 'object') fail();
    const { id, word, difficulty, source, active, hints } = item;
    if (typeof id !== 'string' || !id.trim() || id.length > 100 || ids.has(id)) fail();
    if (typeof word !== 'string' || !word.trim() || word.length > 80 || words.has(normalize(word))) fail();
    if (!['easy', 'hard'].includes(difficulty) || !['original', 'suggestion', 'custom'].includes(source) || typeof active !== 'boolean') fail();
    if (!Array.isArray(hints) || hints.length !== 3 || hints.some(hint => typeof hint !== 'string' || !hint.trim() || hint.length > 200)) fail();
    ids.add(id); words.add(normalize(word));
    return { id, word, difficulty, source, active, hints: [...hints] };
  });
}

// Only past selection metadata is persisted; never persist the current round.
export function drawWord(bank, mode, history, random = randomInt) {
  const eligible = bank.filter(entry => entry.active && (mode === 'mixed' || entry.difficulty === mode));
  if (!eligible.length) throw Error('Nenhuma palavra ativa nesta dificuldade. Abra Palavras e dicas para ativar ou adicionar entradas.');
  const signature = JSON.stringify(eligible);
  let cycle = history.cycles[mode];
  if (!cycle || cycle.signature !== signature || !Array.isArray(cycle.queue) || cycle.queue.some(id => !eligible.some(entry => entry.id === id)) || new Set(cycle.queue).size !== cycle.queue.length) cycle = { signature, queue: [] };
  if (!cycle.queue.length) {
    cycle.queue = shuffled(eligible.map(entry => entry.id), random);
    if (cycle.queue.length > 1 && cycle.queue[0] === history.last) [cycle.queue[0], cycle.queue[1]] = [cycle.queue[1], cycle.queue[0]];
  } else if (cycle.queue.length > 1 && cycle.queue[0] === history.last) {
    [cycle.queue[0], cycle.queue[1]] = [cycle.queue[1], cycle.queue[0]];
  }
  const id = cycle.queue.shift();
  const word = eligible.find(entry => entry.id === id);
  const options = [0, 1, 2].filter(index => index !== history.hints[word.id]);
  const hintIndex = options[random(options.length)];
  history.cycles[mode] = cycle;
  history.last = word.id;
  history.hints[word.id] = hintIndex;
  return { word: structuredClone(word), hint: word.hints[hintIndex] };
}

export function createRound(names, selection, random = randomInt) {
  return { names: validateNames(names), ...selection, impostor: random(names.length), starter: random(names.length), reader: 0, revealed: false, voter: 0, votingOpen: false, votes: [], tallyHistory: [], candidates: names.map((_, i) => i), runoff: false, outcome: null };
}

export function secretFor(round, index) {
  if (index !== round.reader || !round.revealed) throw Error('Segredo indisponível.');
  return index === round.impostor ? { role: 'impostor', hint: round.hint } : { role: 'player', word: round.word.word };
}

export function castVote(round, candidate) {
  if (!round.votingOpen || round.outcome || round.voter >= round.names.length || candidate === round.voter || !round.candidates.includes(candidate)) throw Error('Voto indisponível.');
  round.votes.push(candidate);
  round.voter++;
  round.votingOpen = false;
  if (round.voter < round.names.length) return;
  const counts = round.names.map((_, i) => round.votes.filter(vote => vote === i).length);
  round.tallyHistory.push(counts);
  const maximum = Math.max(...counts);
  const tied = counts.flatMap((count, i) => count === maximum ? [i] : []);
  if (tied.length > 1 && !round.runoff) {
    round.runoff = true;
    round.candidates = tied;
    round.votes = [];
    round.voter = 0;
    return;
  }
  round.outcome = { accused: tied.length === 1 ? tied[0] : null, playersWin: tied.length === 1 && tied[0] === round.impostor };
}
