import { INITIAL_WORDS } from './palavras.js';
import { normalize, validateBank, validateNames, drawWord, createRound, secretFor, castVote } from './regras.js';

const app = document.querySelector('#app');
const KEYS = { bank: 'ca-bank-v1', preferences: 'ca-preferences-v1', history: 'ca-history-v1' };
const sourceNames = { original: 'Sua curadoria', suggestion: 'Nova sugestão', custom: 'Adicionada por você' };
const difficultyNames = { easy: 'Fácil', hard: 'Difícil', mixed: 'Misto' };
let storageWarning = '';
function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { storageWarning = 'Não foi possível ler os dados salvos neste navegador.'; return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { storageWarning = 'Armazenamento indisponível ou cheio. As mudanças ficam só nesta sessão.'; notify(storageWarning); return false; }
}
let bank;
try { bank = validateBank(read(KEYS.bank, INITIAL_WORDS)); }
catch { bank = structuredClone(INITIAL_WORDS); storageWarning = 'Banco local inválido. O banco inicial foi carregado; o arquivo local não foi sobrescrito.'; }
const savedPreferences = read(KEYS.preferences, {});
let names = Array.isArray(savedPreferences?.names) && savedPreferences.names.length >= 3 && savedPreferences.names.length <= 5 && savedPreferences.names.every(n => typeof n === 'string' && n.length <= 40) ? savedPreferences.names : ['', '', ''];
let mode = ['easy', 'hard', 'mixed'].includes(savedPreferences?.mode) ? savedPreferences.mode : 'mixed';
const storedHistory = read(KEYS.history, null);
// Ignore malformed history without compromising the word bank.
let history = storedHistory && typeof storedHistory === 'object' && storedHistory.cycles && storedHistory.hints ? storedHistory : { cycles: {}, hints: {}, last: null };
let state = 'home', round = null, installPrompt = null, registration = null;
let filters = { query: '', difficulty: 'all' };
let noticeTimer;
let lastAction = -Infinity;

function notify(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message; notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000);
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(text, action, className = '') {
  const element = node('button', text, className); element.type = 'button';
  // Detached buttons cannot dispatch a second action after a synchronous transition.
  element.addEventListener('click', event => {
    const now = performance.now();
    if (!element.isConnected || event.detail > 1 || now - lastAction < 350) return;
    lastAction = now; action();
  });
  return element;
}
function go(next) { state = next; render(); }
function shell(title, eyebrow, back = true) {
  const container = node('section', null, 'narrow');
  if (back) container.append(button('Início', () => go('home'), 'back'));
  if (eyebrow) container.append(node('span', eyebrow, 'eyebrow'));
  container.append(node('h1', title)); app.append(container); return container;
}
function actions(container, ...buttons) { const group = node('div', null, 'actions'); group.append(...buttons); container.append(group); }
function error(container, message) {
  container.querySelector('.error')?.remove();
  const element = node('p', message, 'error'); element.setAttribute('role','alert'); container.append(element);
}
function field(labelText, value, parent, options = {}) {
  const wrap = node('div', null, 'field');
  const id = `field-${options.id || labelText.replace(/\s/g,'-')}`;
  const label = node('label', labelText); label.htmlFor = id;
  const input = node('input'); input.id = id; input.value = value; input.required = true; input.maxLength = options.maxLength || 200;
  if (options.autocomplete) input.autocomplete = options.autocomplete;
  wrap.append(label,input); parent.append(wrap); return input;
}
function select(labelText, choices, current, parent) {
  const wrap = node('div', null, 'field'), label = node('label',labelText), input = node('select');
  input.id = `select-${labelText.replace(/\s/g,'-')}`; label.htmlFor = input.id;
  for (const [value, text] of choices) { const option = node('option',text); option.value = value; input.append(option); }
  input.value = current; wrap.append(label,input); parent.append(wrap); return input;
}
function render() {
  app.replaceChildren();
  const renderers = { home: homeScreen, help: helpScreen, setup: setupScreen, secrets: secretScreen, conversation: conversationScreen, vote: voteScreen, result: resultScreen, bank: bankScreen };
  renderers[state]();
  app.focus({preventScroll:true});
  window.scrollTo(0,0);
}

function homeScreen() {
  const home = node('section', null, 'home'), intro = node('div');
  intro.append(node('div',null,'red-rule'));
  const title = node('h1'), abstract = node('span');
  abstract.append(node('span','"a','title-accent'),document.createTextNode('bstrato'),node('span','"','title-accent'));
  title.append(node('span','Concreto'),abstract); intro.append(title);
  intro.append(node('p','TODAS AS PESSOAS SABEM. QUASE TODAS.','subtitle'));
  const play = button('Jogar', () => go('setup'), 'primary');
  actions(intro,play);
  const links = node('div',null,'secondary-links'); links.append(button('Como jogar',() => go('help')),button('Palavras e dicas',() => go('bank'))); intro.append(links);
  if (installPrompt) actions(intro,button('Instalar aplicativo',install));
  else intro.append(node('p','Para instalar, procure “Instalar aplicativo” ou “Adicionar à tela inicial” no menu do navegador, quando disponível.','help install-help'));
  const poster = node('aside',null,'poster');
  poster.append(node('span','O SUBSTANTIVO É CONCRETO. AS PESSOAS ABSTRAEM.','eyebrow'));
  const symbols = node('div',null,'poster-symbol'); symbols.setAttribute('aria-hidden','true'); symbols.append(node('span','!','block'),node('span','!','block'),node('span','?','block')); poster.append(symbols);
  poster.append(node('h2','Quem está abstraindo?'));
  home.append(intro,poster); app.append(home);
}
function helpScreen() {
  const container = shell('Substantivos na roda. Blefe no ar.','COMO JOGAR');
  const list = node('ol',null,'rules');
  for (const text of ['Reúnam de 3 a 5 pessoas e passem o aparelho na ordem.','Cada pessoa consulta seu segredo. O impostor recebe apenas uma dica; as demais recebem o mesmo substantivo.','Deem dicas em voz alta, começando por quem o jogo indicar. Não fale o substantivo. Quem não sabe precisa blefar.','Conversem, observem os blefes e votem em segredo. Ninguém pode votar em si.','A pessoa com mais votos é acusada. Se for o impostor, o grupo vence; caso contrário, o impostor vence.','Empate? Todas as pessoas votam mais uma vez entre as empatadas. Se empatar de novo, o impostor vence.']) list.append(node('li',text));
  container.append(list,node('p','Fácil: concreto. Difícil: abstrato. Misto: os dois. Sem tentativa final de adivinhar a palavra.','help'));
  actions(container,button('Vamos jogar',() => go('setup'),'primary'));
}
function savePreferences() { write(KEYS.preferences,{names,mode}); }
function setupScreen() {
  const container = shell('Quem está na roda?','CONFIGURAR JOGO');
  const form = node('form');
  const countSet = node('fieldset'), legend = node('legend','Pessoas na roda'); countSet.append(legend);
  const countRow = node('div',null,'choice-row');
  for (const count of [3,4,5]) { const choice = button(String(count),() => { names = Array.from({length:count},(_,i) => names[i] || ''); savePreferences(); render(); }); choice.setAttribute('aria-pressed',String(names.length === count)); choice.setAttribute('aria-label',`${count} pessoas`); countRow.append(choice); }
  countSet.append(countRow); form.append(countSet);
  names.forEach((name,index) => { const input = field(`Pessoa ${index + 1}`,name,form,{maxLength:40,autocomplete:'off'}); input.addEventListener('input',() => { names[index] = input.value; savePreferences(); }); });
  const difficulty = select('Dificuldade',[['easy','Fácil · concreto'],['hard','Difícil · abstrato'],['mixed','Misto · os dois']],mode,form);
  difficulty.addEventListener('change',() => { mode = difficulty.value; savePreferences(); });
  const start = node('button','Iniciar rodada','primary'); start.type = 'submit'; actions(form,start);
  form.addEventListener('submit',event => { event.preventDefault(); if (state !== 'setup') return; startRound(container); });
  container.append(form);
}
function startRound(container) {
  try {
    names = validateNames(names); savePreferences();
    const selection = drawWord(bank,mode,history);
    round = createRound(names,selection); go('secrets');
  } catch (failure) {
    error(container,failure.message);
    if (!bank.some(entry => entry.active && (mode === 'mixed' || entry.difficulty === mode))) actions(container,button('Abrir palavras e dicas',() => { round = null; go('bank'); }));
  }
}
function progress(container,index) {
  const row = node('div',null,'progress'); row.setAttribute('aria-label',`${index + 1} de ${round.names.length}`);
  round.names.forEach((_,i) => row.append(node('span',null,i <= index ? 'done' : ''))); container.append(row);
}
function secretScreen() {
  if (!round) return go('home');
  const container = shell('Seu segredo. Seu blefe.',`SEGREDO ${round.reader + 1} / ${round.names.length}`,false);
  progress(container,round.reader);
  const card = node('div',null,'secret');
  if (round.revealed) {
    const secret = secretFor(round,round.reader);
    if (secret.role === 'impostor') card.classList.add('impostor');
    card.append(node('span',secret.role === 'impostor' ? 'VOCÊ É O IMPOSTOR' : 'SEU SUBSTANTIVO É','eyebrow'));
    card.append(node('h2',secret.role === 'impostor' ? `Dica: ${secret.hint}` : secret.word));
    card.append(node('p',secret.role === 'impostor' ? 'Associe a dica. Sustente o blefe.' : 'Guarde o substantivo. Observe os blefes.','help'));
  } else {
    card.append(node('span','PASSE O APARELHO PARA','eyebrow'),node('h2',round.names[round.reader]),node('p','Confira se só você está olhando.','help'));
  }
  container.append(card);
  actions(container,button(round.revealed ? 'Ocultar e passar' : 'Ver meu segredo',() => {
    if (state !== 'secrets') return;
    if (!round.revealed) { round.revealed = true; render(); }
    else { round.revealed = false; round.reader++; go(round.reader === round.names.length ? 'conversation' : 'secrets'); }
  },'primary'));
  container.append(node('p','Não fale o substantivo.','help'));
}
function conversationScreen() {
  const container = shell('É hora de abstrair.','SEGREDOS CONSULTADOS',false);
  const panel = node('div',null,'panel'); panel.append(node('span','QUEM COMEÇA','eyebrow'),node('h2',round.names[round.starter]));
  container.append(panel,node('p','Uma pessoa por vez. Deem dicas, façam associações. Alguém está sustentando um blefe.'),node('p','Não fale o substantivo. Deixem a conversa revelar quem está abstraindo.','help'));
  actions(container,button('Iniciar votação',() => { if (state === 'conversation') go('vote'); },'primary'));
}
function voteScreen() {
  const container = shell(round.runoff ? 'O blefe continua.' : 'Quem está blefando?', round.runoff ? 'DESEMPATE · UMA ÚNICA VEZ' : 'VOTAÇÃO SECRETA',false);
  progress(container,round.voter);
  if (!round.votingOpen) {
    const card = node('div',null,'secret'); card.append(node('span','PASSE O APARELHO PARA','eyebrow'),node('h2',round.names[round.voter]),node('p','Vote em segredo','help')); container.append(card);
    if (round.runoff) container.append(node('p','Empate na maior votação. Todas as pessoas votam entre as empatadas; ninguém vota em si.','help'));
    actions(container,button('Votar',() => { if (state !== 'vote' || round.votingOpen) return; round.votingOpen = true; render(); },'primary vote-button'));
    return;
  }
  container.append(node('p',`${round.names[round.voter]}, escolha uma pessoa. O toque confirma seu voto.`));
  const choices = node('div',null,'vote-choices');
  for (const candidate of round.candidates.filter(i => i !== round.voter)) choices.append(button(round.names[candidate],() => {
    if (state !== 'vote' || !round.votingOpen) return;
    castVote(round,candidate);
    if (round.outcome) { write(KEYS.history,history); go('result'); }
    else render();
  }));
  container.append(choices,node('p','Você não pode votar em si.','help'));
}
function resultScreen() {
  const container = shell(round.outcome.playersWin ? 'O grupo venceu.' : 'O impostor venceu.','RESULTADO',false);
  const details = node('div',null,'panel result-stamp');
  details.append(node('span','O IMPOSTOR ERA','eyebrow'),node('h2',round.names[round.impostor]),node('p',`Substantivo: ${round.word.word}`),node('p',`Dica recebida: ${round.hint}`));
  container.append(details);
  container.append(node('p',round.outcome.accused === null ? 'O empate continuou na segunda votação.' : `Acusado: ${round.names[round.outcome.accused]}.`,'help'));
  round.tallyHistory.forEach((counts,index) => {
    const table = node('table'), caption = node('caption',index === 0 ? 'Votos da primeira votação' : 'Votos do desempate'); table.append(caption);
    const head = node('thead'), header = node('tr'); header.append(node('th','Pessoa'),node('th','Votos')); head.append(header); table.append(head);
    const body = node('tbody'); counts.forEach((count,i) => { const row = node('tr'); row.append(node('td',round.names[i]),node('td',String(count))); body.append(row); }); table.append(body); container.append(table);
  });
  actions(container,button('Nova rodada',() => startRound(container),'primary'),button('Configurar jogo',() => { round = null; go('setup'); }),button('Voltar ao início',() => { round = null; go('home'); }));
}

function commitBank(next) {
  const validated = validateBank(next);
  bank = validated; history = { cycles: {}, hints: history.hints, last: history.last };
  write(KEYS.bank,bank); write(KEYS.history,history);
}
function bankScreen() {
  if (round) return go('result');
  const container = shell('Palavras e dicas.','SUA CURADORIA'); container.classList.remove('narrow');
  container.append(node('p',`${bank.length} palavras · ${bank.filter(e => e.active).length} ativas. Adicione substantivos e dê novas pistas ao blefe.`,'help'));
  const toolbar = node('div',null,'toolbar');
  toolbar.append(button('+ Adicionar',() => editor(null)));
  container.append(toolbar);
  const filterArea = node('div',null,'filters');
  const query = field('Buscar palavra ou dica',filters.query,filterArea,{id:'search'}); query.required = false; query.type = 'search';
  const difficulty = select('Dificuldade',[['all','Todas'],['easy','Fácil'],['hard','Difícil']],filters.difficulty,filterArea);
  const restoreArea = node('div',null,'field restore-area');
  const restore = button('Restaurar lista original',restoreScreen,'restore-button');
  restoreArea.append(restore); filterArea.append(restoreArea);
  container.append(filterArea);
  const count = node('p',null,'help'); count.setAttribute('role','status');
  const list = node('div',null,'word-list'); container.append(count,list);
  function populate() {
    filters = { query: query.value, difficulty: difficulty.value };
    const matching = bank.filter(entry => (filters.difficulty === 'all' || entry.difficulty === filters.difficulty) && normalize([entry.word,...entry.hints].join(' ')).includes(normalize(filters.query))).sort((a,b) => a.word.localeCompare(b.word,'pt-BR'));
    list.replaceChildren(); count.textContent = `${matching.length} palavras encontradas`;
    for (const entry of matching) {
      const card = node('article',null,`word-card${entry.active ? '' : ' inactive'}`);
      card.append(node('span',`${difficultyNames[entry.difficulty]} · ${sourceNames[entry.source]}`,'tag'),node('h3',entry.word),node('p',entry.hints.join(' / ')),node('p',entry.active ? 'Ativa para jogar' : 'Desativada','tag'),button('Editar',() => editor(entry)));
      list.append(card);
    }
  }
  query.addEventListener('input',populate); difficulty.addEventListener('change',populate); populate();
  container.append(node('p','Suas palavras e alterações ficam salvas neste navegador.','help'));
}
function restoreScreen() {
  if (round || state !== 'bank') return;
  app.replaceChildren();
  const container = shell('Restaurar lista original?','SUA CURADORIA',false);
  container.append(node('p','Isso excluirá todos os substantivos que você adicionou e desfará as alterações nas palavras, dicas e dificuldades da lista inicial.'));
  container.append(node('p','A lista voltará a ter exatamente 100 substantivos originais, todos ativos. Essa ação não pode ser desfeita.','help'));
  actions(container,button('Cancelar',render),button('Restaurar lista original',() => {
    if (round || state !== 'bank') return;
    commitBank(INITIAL_WORDS);
    filters = { query: '', difficulty: 'all' };
    render(); notify('Lista original restaurada: 100 substantivos ativos.');
  },'restore-button'));
  app.focus({preventScroll:true}); window.scrollTo(0,0);
}
function editor(entry) {
  if (round || state !== 'bank') return;
  app.replaceChildren();
  const container = shell(entry ? 'Editar entrada.' : 'Nova palavra.','CURADORIA',false);
  container.append(button('Voltar à lista',render,'back'));
  const form = node('form');
  const word = field('Palavra',entry?.word || '',form,{maxLength:80});
  const difficulty = select('Dificuldade',[['easy','Fácil · concreto'],['hard','Difícil · abstrato']],entry?.difficulty || 'easy',form);
  const hints = [0,1,2].map(i => field(`Dica ${i + 1}`,entry?.hints[i] || '',form));
  const activeLabel = node('label',null,'check'), active = node('input'); active.type = 'checkbox'; active.checked = entry?.active ?? true; activeLabel.append(active,node('span','Ativa para jogar')); form.append(activeLabel);
  const save = node('button','Salvar entrada','primary'); save.type = 'submit'; actions(form,save); container.append(form);
  form.addEventListener('submit',event => {
    event.preventDefault(); if (state !== 'bank' || round || !form.isConnected) return;
    const updated = {id:entry?.id || `custom-${crypto.randomUUID()}`,word:word.value.trim(),difficulty:difficulty.value,hints:hints.map(input => input.value.trim()),active:active.checked,source:entry?.source || 'custom'};
    try { commitBank(entry ? bank.map(item => item.id === entry.id ? updated : item) : [...bank,updated]); render(); notify('Entrada salva.'); }
    catch (failure) { error(container,failure.message); }
  });
  app.focus({preventScroll:true}); window.scrollTo(0,0);
}

// A backgrounded screen always returns to a neutral handoff. No reroll.
function hidePrivateContent() {
  if (!round) return;
  if (state === 'secrets' && round.revealed) { round.revealed = false; render(); }
  if (state === 'vote' && round.votingOpen) { round.votingOpen = false; render(); }
}
window.addEventListener('blur',hidePrivateContent);
document.addEventListener('visibilitychange',() => { if (document.hidden) hidePrivateContent(); });
window.addEventListener('pagehide',hidePrivateContent);
window.addEventListener('pageshow',event => { if (event.persisted) { round = null; go('home'); } });
document.querySelector('#brand').addEventListener('click',event => { event.preventDefault(); if (round) notify('Termine a rodada para voltar ao início.'); else go('home'); });
window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); installPrompt = event; if (state === 'home') render(); });
window.addEventListener('appinstalled',() => { installPrompt = null; if (state === 'home') render(); notify('Aplicativo instalado.'); });
async function install() {
  if (!installPrompt) return;
  const prompt = installPrompt; installPrompt = null;
  await prompt.prompt(); await prompt.userChoice;
  if (state === 'home') render();
}
async function setupOffline() {
  const status = document.querySelector('#offline-status');
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { status.textContent = 'Offline requer HTTPS ou localhost.'; return; }
  try {
    registration = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    status.textContent = 'Recursos prontos para uso offline.';
    const update = () => { if (registration.waiting) { status.textContent = 'Nova versão pronta. Feche o app e abra novamente para atualizar.'; } };
    update();
    registration.addEventListener('updatefound',() => { registration.installing?.addEventListener('statechange',update); });
  } catch { status.textContent = 'Offline não preparado. Conecte e abra novamente.'; }
}
render();
if (storageWarning) notify(storageWarning);
setupOffline();
