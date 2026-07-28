const TOKEN_KEY = 'recomenda-filmes.token';

const EVENT_LABELS = {
  liked: 'Gostei',
  saved: 'Quero ver',
  watched: 'Assistido',
  disliked: 'Não gostei',
};

const EVENT_RATING = {
  liked: 5,
  saved: 4,
  watched: 3,
  disliked: 1,
};

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  authMode: 'login',
  user: null,
  movies: [],
  facets: {
    genres: [],
    moods: [],
    paces: [],
    languages: [],
  },
  interactions: [],
  recommendations: [],
  provider: 'local',
  pinecone: null,
  tasteQuery: '',
  catalogSearch: '',
  catalogGenre: '',
  menuOpen: false,
  activeDialog: null,
  editingTaste: false,
  status: '',
  error: '',
  model: {
    instance: null,
    spec: null,
    ready: false,
    progress: 0,
    status: 'Modelo ainda não treinado.',
  },
};

const app = document.querySelector('#app');

boot();

async function boot() {
  renderLoading();

  try {
    await loadPublicData();

    if (state.token) {
      await loadSession();
    }
  } catch (error) {
    resetSession();
    setError(error.message);
  }

  render();
}

async function loadPublicData() {
  const [{ movies }, { facets }, health] = await Promise.all([
    api('/api/movies', { auth: false }),
    api('/api/movies/facets', { auth: false }),
    api('/api/health', { auth: false }),
  ]);

  state.movies = movies;
  state.facets = facets;
  state.pinecone = health.pinecone;
}

async function loadSession() {
  const [{ user }, { interactions }] = await Promise.all([
    api('/api/auth/me'),
    api('/api/me/interactions'),
  ]);

  state.user = user;
  state.interactions = interactions;
}

async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  };

  if (options.auth !== false && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : {};

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Não foi possível concluir a operação.');
  }

  return payload;
}

function render() {
  if (!state.user) {
    renderAuth();
    return;
  }

  if (!state.user.onboarding || state.editingTaste) {
    renderOnboarding();
    return;
  }

  renderDashboard();
}

function renderLoading() {
  app.innerHTML = `
    <main class="loading-screen">
      <p>Carregando catálogo...</p>
    </main>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth-layout">
      <section class="auth-panel">
        <div class="auth-copy">
          <h1>Recomenda Filmes</h1>
          <p>Um recomendador pessoal com perfil de gosto, histórico de interações, TensorFlow.js no navegador e busca vetorial opcional com Pinecone.</p>
        </div>
        <section class="form-card">
          <div class="tab-row" role="tablist" aria-label="Autenticação">
            <button type="button" data-auth-mode="login" aria-selected="${state.authMode === 'login'}">Entrar</button>
            <button type="button" data-auth-mode="signup" aria-selected="${state.authMode === 'signup'}">Cadastro</button>
          </div>

          <form id="authForm" class="form-stack">
            ${state.authMode === 'signup' ? `
              <div class="field">
                <label for="name">Nome</label>
                <input id="name" name="name" autocomplete="name" required>
              </div>
            ` : ''}
            <div class="field">
              <label for="email">E-mail</label>
              <input id="email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="field">
              <label for="password">Senha</label>
              <input id="password" name="password" type="password" autocomplete="${state.authMode === 'login' ? 'current-password' : 'new-password'}" minlength="8" required>
            </div>
            <button class="primary-btn" type="submit">${state.authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
            <p class="status-line ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
          </form>
        </section>
      </section>
    </main>
  `;

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authMode = button.dataset.authMode;
      clearMessages();
      renderAuth();
    });
  });

  document.querySelector('#authForm').addEventListener('submit', handleAuthSubmit);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearMessages();

  const form = new FormData(event.currentTarget);
  const body = {
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  };

  if (state.authMode === 'signup') {
    body.name = String(form.get('name') ?? '');
  }

  try {
    const payload = await api(`/api/auth/${state.authMode === 'login' ? 'login' : 'signup'}`, {
      auth: false,
      method: 'POST',
      body,
    });

    state.token = payload.token;
    state.user = payload.user;
    state.interactions = [];
    localStorage.setItem(TOKEN_KEY, payload.token);
    render();
  } catch (error) {
    setError(error.message);
    renderAuth();
  }
}

function renderOnboarding() {
  const onboarding = state.user?.onboarding ?? {};
  const isEditing = Boolean(state.editingTaste);

  app.innerHTML = `
    <main class="onboarding-layout">
      <section class="onboarding-panel">
        <div class="onboarding-copy">
          <h1>Monte seu gosto</h1>
          <p>Suas preferências iniciais viram representação numérica para o modelo e também formam a consulta semântica usada no Pinecone.</p>
        </div>
        <form id="onboardingForm" class="onboarding-form form-stack">
          <div class="field">
            <label for="ageRange">Faixa etária</label>
            <select id="ageRange" name="ageRange" required>
              <option value="">Selecione</option>
              ${['18-24', '25-34', '35-44', '45+'].map((item) => `<option value="${item}" ${onboarding.ageRange === item ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </div>
          <fieldset class="field chip-grid">
            <legend>Gêneros favoritos</legend>
            ${checkboxes('favoriteGenres', state.facets.genres, onboarding.favoriteGenres)}
          </fieldset>
          <fieldset class="field chip-grid">
            <legend>Climas preferidos</legend>
            ${checkboxes('favoriteMoods', state.facets.moods, onboarding.favoriteMoods)}
          </fieldset>
          <div class="field">
            <label for="preferredPace">Ritmo preferido</label>
            <select id="preferredPace" name="preferredPace" required>
              <option value="">Selecione</option>
              ${state.facets.paces.map((item) => `<option value="${escapeAttr(item)}" ${normalizeText(onboarding.preferredPace) === normalizeText(item) ? 'selected' : ''}>${escapeHtml(labelPace(item))}</option>`).join('')}
            </select>
          </div>
          <fieldset class="field chip-grid">
            <legend>Idiomas</legend>
            ${checkboxes('favoriteLanguages', state.facets.languages, onboarding.favoriteLanguages)}
          </fieldset>
          <div class="field">
            <label for="favoriteMovies">Filmes que você já gosta</label>
            <textarea id="favoriteMovies" name="favoriteMovies" placeholder="Ex.: A Chegada, Matrix, Parasita">${escapeHtml(onboarding.favoriteMovies ?? '')}</textarea>
          </div>
          <div class="field">
            <label for="avoid">Evitar</label>
            <textarea id="avoid" name="avoid" placeholder="Ex.: terror pesado, ritmo lento, violência gráfica">${escapeHtml(onboarding.avoid ?? '')}</textarea>
          </div>
          <div class="form-actions">
            ${isEditing ? '<button class="ghost-btn" id="backToDashboardBtn" type="button">Voltar</button>' : ''}
            <button class="primary-btn" type="submit">Salvar preferências</button>
          </div>
          <p class="status-line ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
        </form>
      </section>
    </main>
  `;

  document.querySelector('#backToDashboardBtn')?.addEventListener('click', () => {
    state.editingTaste = false;
    clearMessages();
    renderDashboard();
  });

  document.querySelector('#onboardingForm').addEventListener('submit', handleOnboardingSubmit);
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  clearMessages();

  const form = new FormData(event.currentTarget);
  const body = {
    ageRange: String(form.get('ageRange') ?? ''),
    favoriteGenres: form.getAll('favoriteGenres').map(String),
    favoriteMoods: form.getAll('favoriteMoods').map(String),
    preferredPace: String(form.get('preferredPace') ?? ''),
    favoriteLanguages: form.getAll('favoriteLanguages').map(String),
    favoriteMovies: String(form.get('favoriteMovies') ?? ''),
    avoid: String(form.get('avoid') ?? ''),
  };

  try {
    const { user } = await api('/api/me/onboarding', {
      method: 'PATCH',
      body,
    });

    state.user = user;
    state.editingTaste = false;
    await loadRecommendations();
    renderDashboard();
  } catch (error) {
    setError(error.message);
    renderOnboarding();
  }
}

function renderDashboard() {
  const onboarding = state.user.onboarding ?? {};
  const pineconeEnabled = Boolean(state.pinecone?.enabled);

  app.innerHTML = `
    <main class="dashboard">
      <header class="topbar">
        <div class="brand">
          <h1>Recomenda Filmes</h1>
        </div>
        ${renderAccountMenu()}
      </header>

      <section class="dashboard-grid">
        <aside class="profile-panel">
          <h2>Perfil de gosto</h2>
          <div class="profile-section">
            <span class="meta-text">Faixa etária</span>
            <strong>${escapeHtml(onboarding.ageRange ?? '-')}</strong>
          </div>
          <div class="profile-section">
            <span class="meta-text">Gêneros</span>
            <div class="pill-row">${pills(onboarding.favoriteGenres ?? [])}</div>
          </div>
          <div class="profile-section">
            <span class="meta-text">Climas</span>
            <div class="pill-row">${pills(onboarding.favoriteMoods ?? [], 'teal')}</div>
          </div>
          <div class="profile-section">
            <span class="meta-text">Ritmo e idiomas</span>
            <div class="pill-row">
              ${pills([labelPace(onboarding.preferredPace), ...(onboarding.favoriteLanguages ?? [])], 'amber')}
            </div>
          </div>
          <div class="profile-section">
            <span class="meta-text">Historico</span>
            <div class="interaction-list">
              ${renderInteractionList()}
            </div>
          </div>
        </aside>

        <section class="content-stack">
          <section class="dashboard-panel">
            <div class="panel-head">
              <div>
                <h2>Recomendações personalizadas</h2>
                <p class="meta-text">Fonte: ${escapeHtml(state.provider)}${state.model.ready ? ' + TensorFlow.js' : ''}</p>
              </div>
              <div class="control-row">
                <button class="primary-btn" id="recommendBtn" type="button">Gerar recomendações</button>
                <button class="secondary-btn" id="trainBtn" type="button">Treinar modelo</button>
                <button class="ghost-btn" id="syncPineconeBtn" type="button" ${pineconeEnabled ? '' : 'disabled'}>Sincronizar Pinecone</button>
              </div>
            </div>
            <div class="model-meter" aria-live="polite">
              <div class="meter"><span style="--value: ${state.model.progress}%"></span></div>
              <p class="status-line ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status || state.model.status)}</p>
            </div>
            ${state.tasteQuery ? `<p class="meta-text">Consulta: ${escapeHtml(state.tasteQuery)}</p>` : ''}
            <div class="movie-grid" id="recommendationGrid">
              ${state.recommendations.length ? state.recommendations.map((item) => movieCard(item, { ranked: true })).join('') : emptyState('Gere recomendações para ver os filmes mais próximos do seu perfil.')}
            </div>
          </section>

          <section class="dashboard-panel">
            <div class="panel-head">
              <div>
                <h2>Catálogo</h2>
                <p class="meta-text">${state.movies.length} filmes com poster, sinopse, IMDb e Rotten Tomatoes.</p>
              </div>
            </div>
            <div class="filters">
              <div class="field">
                <label for="catalogSearch">Buscar</label>
                <input id="catalogSearch" value="${escapeAttr(state.catalogSearch)}" placeholder="Título, diretor, gênero">
              </div>
              <div class="field">
                <label for="catalogGenre">Gênero</label>
                <select id="catalogGenre">
                  <option value="">Todos</option>
                  ${state.facets.genres.map((genre) => `<option value="${escapeAttr(genre)}" ${state.catalogGenre === genre ? 'selected' : ''}>${escapeHtml(genre)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="movie-grid" id="catalogGrid">
              ${filteredMovies().map((movie) => movieCard({ movie })).join('')}
            </div>
          </section>
        </section>
      </section>
      ${renderDialog()}
    </main>
  `;

  bindDashboardEvents();
}

function bindDashboardEvents() {
  bindPosterFallbacks();

  document.querySelector('#accountMenuBtn')?.addEventListener('click', () => {
    state.menuOpen = !state.menuOpen;
    renderDashboard();
  });

  document.querySelector('#editProfileBtn')?.addEventListener('click', () => openDialog('profile'));
  document.querySelector('#changePasswordBtn')?.addEventListener('click', () => openDialog('password'));
  document.querySelector('#editTasteBtn')?.addEventListener('click', () => {
    state.menuOpen = false;
    state.activeDialog = null;
    state.editingTaste = true;
    clearMessages();
    renderOnboarding();
  });
  document.querySelector('#logoutBtn')?.addEventListener('click', () => {
    resetSession();
    renderAuth();
  });
  document.querySelector('#closeDialogBtn')?.addEventListener('click', closeDialog);
  document.querySelector('#dialogBackdrop')?.addEventListener('click', closeDialog);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', closeDialog);
  });
  document.querySelector('#profileForm')?.addEventListener('submit', handleProfileSubmit);
  document.querySelector('#passwordForm')?.addEventListener('submit', handlePasswordSubmit);

  document.querySelector('#recommendBtn').addEventListener('click', async () => {
    await runWithRender(loadRecommendations);
  });

  document.querySelector('#trainBtn').addEventListener('click', async () => {
    await runWithRender(async () => {
      await trainBrowserModel();
      await loadRecommendations();
    });
  });

  document.querySelector('#syncPineconeBtn').addEventListener('click', async () => {
    await runWithRender(syncPinecone);
  });

  document.querySelector('#catalogSearch').addEventListener('input', (event) => {
    state.catalogSearch = event.target.value;
    renderDashboard();
  });

  document.querySelector('#catalogGenre').addEventListener('change', (event) => {
    state.catalogGenre = event.target.value;
    renderDashboard();
  });

  document.querySelectorAll('[data-event-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      await runWithRender(() => saveInteraction(button.dataset.movieId, button.dataset.eventType));
    });
  });
}

function renderAccountMenu() {
  return `
    <div class="account-menu">
      <button class="account-button" type="button" id="accountMenuBtn" aria-haspopup="menu" aria-expanded="${state.menuOpen}">
        ${avatarMarkup()}
        <span class="menu-bars" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
      ${state.menuOpen ? `
        <div class="account-dropdown" role="menu">
          <div class="account-summary">
            ${avatarMarkup('small')}
            <div>
              <strong>${escapeHtml(state.user.name)}</strong>
              <span>${escapeHtml(state.user.email)}</span>
            </div>
          </div>
          <button type="button" id="editProfileBtn" role="menuitem">Editar perfil</button>
          <button type="button" id="changePasswordBtn" role="menuitem">Trocar senha</button>
          <button type="button" id="editTasteBtn" role="menuitem">Editar gosto</button>
          <button type="button" id="logoutBtn" role="menuitem" class="danger-menu-item">Sair</button>
        </div>
      ` : ''}
    </div>
  `;
}

function avatarMarkup(size = '') {
  const photoUrl = String(state.user?.profilePhotoUrl ?? '').trim();
  const initials = userInitials(state.user?.name);
  const className = `avatar ${size}`.trim();

  if (photoUrl) {
    return `<span class="${className}"><img src="${escapeAttr(photoUrl)}" alt="Foto de ${escapeAttr(state.user.name)}"></span>`;
  }

  return `<span class="${className}" aria-label="Foto de perfil">${escapeHtml(initials)}</span>`;
}

function renderDialog() {
  if (!state.activeDialog) return '';

  return `
    <div class="dialog-backdrop" id="dialogBackdrop"></div>
    <section class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
      <div class="dialog-head">
        <h2 id="dialogTitle">${state.activeDialog === 'profile' ? 'Editar perfil' : 'Trocar senha'}</h2>
        <button class="icon-button" id="closeDialogBtn" type="button" aria-label="Fechar">×</button>
      </div>
      ${state.activeDialog === 'profile' ? renderProfileForm() : renderPasswordForm()}
    </section>
  `;
}

function renderProfileForm() {
  return `
    <form id="profileForm" class="form-stack compact-form">
      <div class="field">
        <label for="profileName">Nome</label>
        <input id="profileName" name="name" value="${escapeAttr(state.user.name)}" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="profileEmail">E-mail</label>
        <input id="profileEmail" name="email" type="email" value="${escapeAttr(state.user.email)}" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="profilePhotoUrl">Foto de perfil</label>
        <input id="profilePhotoUrl" name="profilePhotoUrl" type="url" value="${escapeAttr(state.user.profilePhotoUrl ?? '')}" placeholder="https://...">
      </div>
      <div class="form-actions">
        <button class="ghost-btn" type="button" data-close-dialog>Cancelar</button>
        <button class="primary-btn" type="submit">Salvar perfil</button>
      </div>
      <p class="status-line ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
    </form>
  `;
}

function renderPasswordForm() {
  return `
    <form id="passwordForm" class="form-stack compact-form">
      <div class="field">
        <label for="currentPassword">Senha atual</label>
        <input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
      </div>
      <div class="field">
        <label for="newPassword">Nova senha</label>
        <input id="newPassword" name="newPassword" type="password" minlength="8" autocomplete="new-password" required>
      </div>
      <div class="form-actions">
        <button class="ghost-btn" type="button" data-close-dialog>Cancelar</button>
        <button class="primary-btn" type="submit">Trocar senha</button>
      </div>
      <p class="status-line ${state.error ? 'error' : ''}">${escapeHtml(state.error || state.status)}</p>
    </form>
  `;
}

function openDialog(name) {
  state.activeDialog = name;
  state.menuOpen = false;
  clearMessages();
  renderDashboard();
}

function closeDialog() {
  state.activeDialog = null;
  clearMessages();
  renderDashboard();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  clearMessages();

  const form = new FormData(event.currentTarget);

  try {
    const { user } = await api('/api/me/profile', {
      method: 'PATCH',
      body: {
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        profilePhotoUrl: String(form.get('profilePhotoUrl') ?? ''),
      },
    });

    state.user = user;
    state.activeDialog = null;
    state.status = 'Perfil atualizado.';
  } catch (error) {
    setError(error.message);
  }

  renderDashboard();
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  clearMessages();

  const form = new FormData(event.currentTarget);

  try {
    const { user } = await api('/api/me/password', {
      method: 'PATCH',
      body: {
        currentPassword: String(form.get('currentPassword') ?? ''),
        newPassword: String(form.get('newPassword') ?? ''),
      },
    });

    state.user = user;
    state.activeDialog = null;
    state.status = 'Senha atualizada.';
  } catch (error) {
    setError(error.message);
  }

  renderDashboard();
}

async function runWithRender(action) {
  clearMessages();
  renderDashboard();

  try {
    await action();
  } catch (error) {
    setError(error.message);
  }

  renderDashboard();
}

async function loadRecommendations() {
  state.status = 'Buscando candidatos...';
  const excludedMovieIds = state.interactions
    .filter((interaction) => ['liked', 'watched', 'saved', 'disliked'].includes(interaction.eventType))
    .map((interaction) => interaction.movieId);

  const payload = await api('/api/recommendations/candidates', {
    method: 'POST',
    body: {
      limit: 30,
      excludedMovieIds,
    },
  });

  state.provider = payload.provider;
  state.pinecone = payload.pinecone;
  state.tasteQuery = payload.tasteQuery ?? '';

  const movieById = new Map(state.movies.map((movie) => [movie.id, movie]));
  const candidates = payload.candidates
    .map((candidate) => ({
      ...candidate,
      movie: movieById.get(candidate.movieId),
    }))
    .filter((candidate) => candidate.movie);

  state.recommendations = state.model.ready
    ? await rankWithModel(candidates)
    : rankWithProvider(candidates);

  state.status = state.recommendations.length
    ? `${state.recommendations.length} recomendações prontas.`
    : 'Nenhum candidato disponível para este perfil.';
}

async function trainBrowserModel() {
  if (!window.tf) {
    state.model.status = 'TensorFlow.js não carregou. A recomendação do backend continua disponível.';
    state.model.ready = false;
    return;
  }

  state.model.status = 'Carregando base de treino...';
  state.model.progress = 8;
  renderDashboard();

  const payload = await api('/api/recommendations/training-data');
  const spec = createFeatureSpec(payload.movies, payload.users);
  const examples = createTrainingExamples(payload, spec);

  if (examples.length < 6) {
    throw new Error('Base insuficiente para treinar o modelo.');
  }

  const xs = window.tf.tensor2d(examples.map((example) => example.features));
  const ys = window.tf.tensor2d(examples.map((example) => [example.target]));

  if (state.model.instance) {
    state.model.instance.dispose();
  }

  const model = window.tf.sequential();
  model.add(window.tf.layers.dense({
    inputShape: [spec.inputSize],
    units: 40,
    activation: 'relu',
  }));
  model.add(window.tf.layers.dense({
    units: 18,
    activation: 'relu',
  }));
  model.add(window.tf.layers.dense({
    units: 1,
    activation: 'sigmoid',
  }));
  model.compile({
    optimizer: window.tf.train.adam(0.035),
    loss: 'meanSquaredError',
  });

  state.model.status = 'Treinando rede neural...';
  state.model.progress = 18;
  renderDashboard();

  await model.fit(xs, ys, {
    epochs: 48,
    batchSize: 8,
    shuffle: true,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        state.model.progress = Math.round(18 + ((epoch + 1) / 48) * 78);
        state.model.status = `Treinando rede neural... perda ${Number(logs.loss).toFixed(4)}`;
        if ((epoch + 1) % 8 === 0 || epoch === 47) {
          renderDashboard();
          await window.tf.nextFrame();
        }
      },
    },
  });

  xs.dispose();
  ys.dispose();

  state.model.instance = model;
  state.model.spec = spec;
  state.model.ready = true;
  state.model.progress = 100;
  state.model.status = `Modelo treinado com ${examples.length} exemplos.`;
}

async function rankWithModel(candidates) {
  if (!state.model.ready || !state.model.instance) return candidates;

  const rows = candidates.map((candidate) => createFeatureVector(
    currentModelUser(),
    candidate.movie,
    state.model.spec,
  ));
  const input = window.tf.tensor2d(rows);
  const prediction = state.model.instance.predict(input);
  const data = await prediction.data();

  input.dispose();
  prediction.dispose();

  const providerScores = normalizedCandidateScores(candidates);
  return candidates
    .map((candidate, index) => {
      const mlScore = data[index];
      const finalScore = (mlScore * 0.68) + (providerScores[index] * 0.32);
      return {
        ...candidate,
        mlScore,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function rankWithProvider(candidates) {
  const scores = normalizedCandidateScores(candidates);
  return candidates.map((candidate, index) => ({
    ...candidate,
    finalScore: scores[index],
  }));
}

async function syncPinecone() {
  state.status = 'Sincronizando catálogo no Pinecone...';
  const { pinecone } = await api('/api/pinecone/sync', { method: 'POST' });
  state.pinecone = pinecone;
  state.status = pinecone.enabled
    ? `${pinecone.count} filmes sincronizados em ${pinecone.indexName}/${pinecone.namespace}.`
    : 'Pinecone não está configurado. Usando recomendação local.';
}

async function saveInteraction(movieId, eventType) {
  await api('/api/me/interactions', {
    method: 'POST',
    body: { movieId, eventType },
  });

  const [{ interactions }] = await Promise.all([
    api('/api/me/interactions'),
  ]);
  state.interactions = interactions;
  state.status = `${EVENT_LABELS[eventType]} registrado.`;

  if (state.recommendations.length) {
    await loadRecommendations();
  }
}

function createFeatureSpec(movies, users) {
  const genres = unique(movies.flatMap((movie) => movie.genres));
  const moods = unique(movies.flatMap((movie) => movie.moods));
  const paces = unique(movies.map((movie) => movie.pace));
  const languages = unique(movies.map((movie) => movie.language));
  const ageRanges = unique(users.map((user) => user.ageRange).filter(Boolean));
  const inputSize = (
    ageRanges.length +
    genres.length +
    moods.length +
    paces.length +
    languages.length +
    3 +
    genres.length +
    moods.length +
    paces.length +
    languages.length +
    3
  );

  return {
    genres,
    moods,
    paces,
    languages,
    ageRanges,
    inputSize,
  };
}

function createTrainingExamples(payload, spec) {
  const moviesById = new Map(payload.movies.map((movie) => [movie.id, movie]));

  return payload.users.flatMap((user) => (
    (user.interactions ?? [])
      .map((interaction) => {
        const movie = moviesById.get(interaction.movieId);
        if (!movie) return null;

        return {
          features: createFeatureVector(user, movie, spec),
          target: Math.max(0.05, Math.min(1, Number(interaction.rating ?? EVENT_RATING[interaction.eventType] ?? 3) / 5)),
        };
      })
      .filter(Boolean)
  ));
}

function createFeatureVector(user, movie, spec) {
  const favoriteGenres = new Set(user.favoriteGenres ?? user.onboarding?.favoriteGenres ?? []);
  const favoriteMoods = new Set(user.favoriteMoods ?? user.onboarding?.favoriteMoods ?? []);
  const favoriteLanguages = new Set(user.favoriteLanguages ?? user.onboarding?.favoriteLanguages ?? []);
  const preferredPace = user.preferredPace ?? user.onboarding?.preferredPace;
  const interactions = user.interactions ?? [];
  const positiveCount = interactions.filter((interaction) => ['liked', 'saved', 'watched'].includes(interaction.eventType)).length;
  const negativeCount = interactions.filter((interaction) => interaction.eventType === 'disliked').length;
  const averageRating = interactions.length
    ? interactions.reduce((sum, interaction) => sum + Number(interaction.rating ?? EVENT_RATING[interaction.eventType] ?? 3), 0) / interactions.length / 5
    : 0.5;

  return [
    ...oneHot(user.ageRange ?? user.onboarding?.ageRange, spec.ageRanges),
    ...multiHot(favoriteGenres, spec.genres),
    ...multiHot(favoriteMoods, spec.moods),
    ...oneHot(preferredPace, spec.paces),
    ...multiHot(favoriteLanguages, spec.languages),
    clamp01(averageRating),
    clamp01(positiveCount / 8),
    clamp01(negativeCount / 5),
    ...multiHot(new Set(movie.genres), spec.genres),
    ...multiHot(new Set(movie.moods), spec.moods),
    ...oneHot(movie.pace, spec.paces),
    ...oneHot(movie.language, spec.languages),
    clamp01((Number(movie.year) - 1970) / 60),
    clamp01(Number(movie.durationMinutes) / 200),
    clamp01(Number(movie.communityScore) / 100),
  ];
}

function currentModelUser() {
  return {
    ...state.user,
    ...state.user.onboarding,
    interactions: state.interactions,
  };
}

function filteredMovies() {
  const query = state.catalogSearch.trim().toLowerCase();

  return state.movies.filter((movie) => {
    const matchesGenre = !state.catalogGenre || movie.genres.includes(state.catalogGenre);
    if (!matchesGenre) return false;
    if (!query) return true;

    const haystack = [
      movie.title,
      movie.originalTitle,
      movie.director,
      movie.genres.join(' '),
      movie.moods.join(' '),
      movie.synopsis,
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function movieCard(item, options = {}) {
  const movie = item.movie ?? item;
  const posterUrl = String(movie.posterUrl ?? '').trim();
  const score = options.ranked
    ? Number(item.finalScore ?? normalizeProviderScore(item.score ?? movie.communityScore / 100))
    : Number(movie.communityScore / 100);
  const scoreText = options.ranked ? `${Math.round(score * 100)}% match` : `${movie.communityScore}%`;

  return `
    <article class="movie-card">
      <div class="poster-wrap ${posterUrl ? '' : 'poster-error'}">
        <div class="poster-fallback" aria-hidden="${posterUrl ? 'true' : 'false'}">
          <span>${escapeHtml(movie.title)}</span>
        </div>
        ${posterUrl ? `<img src="${escapeAttr(posterUrl)}" alt="Poster de ${escapeAttr(movie.title)}" loading="lazy" data-poster-image>` : ''}
        <span class="score-badge">${escapeHtml(scoreText)}</span>
      </div>
      <div class="movie-body">
        <div>
          <h3 class="movie-title">${escapeHtml(movie.title)}</h3>
          <div class="movie-meta">${escapeHtml(movieMeta(movie))}</div>
        </div>
        <div class="pill-row">
          ${pills(movie.genres.slice(0, 3))}
        </div>
        <p class="synopsis">${escapeHtml(movie.synopsis)}</p>
        <div class="movie-links">
          <a href="${escapeAttr(movie.imdbUrl)}" target="_blank" rel="noreferrer">IMDb</a>
          <a href="${escapeAttr(movie.rottenTomatoesUrl)}" target="_blank" rel="noreferrer">Rotten</a>
        </div>
        <div class="movie-actions">
          <button class="secondary-btn" type="button" data-movie-id="${escapeAttr(movie.id)}" data-event-type="liked">${EVENT_LABELS.liked}</button>
          <button class="ghost-btn" type="button" data-movie-id="${escapeAttr(movie.id)}" data-event-type="saved">${EVENT_LABELS.saved}</button>
          <button class="ghost-btn" type="button" data-movie-id="${escapeAttr(movie.id)}" data-event-type="watched">${EVENT_LABELS.watched}</button>
          <button class="danger-btn" type="button" data-movie-id="${escapeAttr(movie.id)}" data-event-type="disliked">${EVENT_LABELS.disliked}</button>
        </div>
      </div>
    </article>
  `;
}

function renderInteractionList() {
  if (!state.interactions.length) {
    return '<p class="meta-text">Nenhuma interação registrada.</p>';
  }

  return state.interactions.slice(0, 12).map((interaction) => `
    <div class="interaction-item ${interaction.eventType === 'disliked' ? 'disliked' : ''}">
      <strong>${escapeHtml(interaction.movieTitle)}</strong>
      <span class="meta-text">${escapeHtml(EVENT_LABELS[interaction.eventType] ?? interaction.eventType)}</span>
    </div>
  `).join('');
}

function checkboxes(name, values, selectedValues = []) {
  const selected = new Set((selectedValues ?? []).map((value) => normalizeText(value)));

  return values.map((value) => `
    <label>
      <input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(value)}" ${selected.has(normalizeText(value)) ? 'checked' : ''}>
      ${escapeHtml(value)}
    </label>
  `).join('');
}

function pills(values, tone = '') {
  const safeValues = values.filter(Boolean);
  if (!safeValues.length) return '<span class="meta-text">-</span>';
  return safeValues.map((value) => `<span class="pill ${tone}">${escapeHtml(value)}</span>`).join('');
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function bindPosterFallbacks() {
  document.querySelectorAll('[data-poster-image]').forEach((image) => {
    image.addEventListener('error', () => {
      const poster = image.closest('.poster-wrap');
      poster?.classList.add('poster-error');
      image.remove();
    }, { once: true });
  });
}

function oneHot(value, values) {
  const normalizedValue = normalizeText(value);
  return values.map((item) => (normalizeText(item) === normalizedValue ? 1 : 0));
}

function multiHot(selected, values) {
  const normalizedSelected = new Set([...selected].map((item) => normalizeText(item)));
  return values.map((item) => (normalizedSelected.has(normalizeText(item)) ? 1 : 0));
}

function normalizeProviderScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return clamp01(value);
  if (value <= 5) return clamp01(value / 5);
  return clamp01(value / 100);
}

function normalizedCandidateScores(candidates) {
  const rawScores = candidates.map((candidate) => Number(candidate.score)).filter(Number.isFinite);
  if (!rawScores.length) return candidates.map(() => 0.5);

  const min = Math.min(...rawScores);
  const max = Math.max(...rawScores);

  if (max === min) {
    const score = normalizeProviderScore(max);
    return candidates.map(() => score || 0.75);
  }

  return candidates.map((candidate) => {
    const raw = Number(candidate.score);
    if (!Number.isFinite(raw)) return 0.5;
    return 0.42 + (((raw - min) / (max - min)) * 0.56);
  });
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function labelPace(value) {
  return {
    lento: 'lento',
    medio: 'médio',
    médio: 'médio',
    rapido: 'rápido',
    rápido: 'rápido',
  }[value] ?? value ?? '-';
}

function movieMeta(movie) {
  const parts = [movie.year];

  if (movie.director && movie.director !== 'Não informado') {
    parts.push(movie.director);
  } else if (movie.language && movie.language !== 'Não informado') {
    parts.push(movie.language);
  }

  if (movie.durationMinutes) parts.push(`${movie.durationMinutes} min`);
  parts.push(labelPace(movie.pace));

  return parts.filter(Boolean).join(' - ');
}

function resetSession() {
  state.token = null;
  state.user = null;
  state.interactions = [];
  state.recommendations = [];
  state.menuOpen = false;
  state.activeDialog = null;
  state.editingTaste = false;
  state.model.instance?.dispose?.();
  state.model = {
    instance: null,
    spec: null,
    ready: false,
    progress: 0,
    status: 'Modelo ainda não treinado.',
  };
  localStorage.removeItem(TOKEN_KEY);
}

function clearMessages() {
  state.status = '';
  state.error = '';
}

function setError(message) {
  state.error = message;
  state.status = '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function userInitials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'RF';
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
