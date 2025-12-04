(function (global) {
  if (!global || !global.document) {
    return;
  }

  const SELECTOR = '.persona-dropdown';
  const registry = [];

  const ensureArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

  function extractPersonaId(persona) {
    if (!persona) return null;
    return persona.personaId || persona.id || null;
  }

  function personaDisplayName(persona) {
    const id = extractPersonaId(persona);
    const name = persona?.name?.trim?.();
    if (!name && !id) {
      return 'Unnamed persona';
    }
    if (name && id && name.toLowerCase() !== id.toLowerCase()) {
      return `${name} (${id})`;
    }
    return name || id;
  }

  function scorePersonaForRole(persona, role) {
    if (!role) return 0;
    const target = role.toLowerCase();
    const type = (persona?.type || '').toLowerCase();
    const metadataRole = (persona?.metadata?.role || '').toLowerCase();
    const personaId = (extractPersonaId(persona) || '').toLowerCase();
    let score = 0;
    if (type === target) score += 3;
    if (metadataRole === target) score += 2;
    if (personaId === target) score += 1;
    return score;
  }

  function renderOptions(personas, selectedId) {
    registry.forEach(entry => {
      const { element, role } = entry;
      element.innerHTML = '';

      if (!personas.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No personas available';
        option.disabled = true;
        option.selected = true;
        element.appendChild(option);
        element.disabled = true;
        return;
      }

      const sorted = personas.slice().sort((a, b) => {
        return scorePersonaForRole(b, role) - scorePersonaForRole(a, role);
      });

      element.disabled = false;

      sorted.forEach(persona => {
        const id = extractPersonaId(persona);
        if (!id) return;
        const option = document.createElement('option');
        option.value = id;
        option.textContent = personaDisplayName(persona);
        if (id === selectedId) {
          option.selected = true;
        }
        element.appendChild(option);
      });

      if (selectedId && !sorted.some(persona => extractPersonaId(persona) === selectedId)) {
        element.selectedIndex = 0;
      }
    });
  }

  function syncFromStore(snapshot) {
    if (!global.PersonaStore) return;
    const personas = snapshot?.personas || global.PersonaStore.getPersonas?.() || [];
    const selectedPersona = snapshot?.selectedPersona || global.PersonaStore.getSelectedPersona?.() || null;
    const selectedId = extractPersonaId(selectedPersona);
    renderOptions(personas, selectedId);
  }

  function handleChange(event) {
    const personaId = event.target.value;
    if (personaId && global.PersonaStore?.setSelectedPersona) {
      global.PersonaStore.setSelectedPersona(personaId);
    }
  }

  function collectDropdowns() {
    const elements = ensureArray(document.querySelectorAll(SELECTOR));
    elements.forEach(element => {
      if (registry.some(entry => entry.element === element)) {
        return;
      }
      const role = (element.dataset.personaRole || '').toLowerCase();
      registry.push({ element, role });
      element.disabled = true;
      element.addEventListener('change', handleChange);
    });
  }

  function initializeStoreIntegration() {
    if (!global.PersonaStore) {
      console.warn('Persona selector: PersonaStore is not available.');
      return;
    }

    global.PersonaStore.subscribe(snapshot => {
      if (!snapshot) return;
      if (snapshot.event === 'init' || snapshot.event === 'loaded' || snapshot.event === 'selection') {
        syncFromStore(snapshot);
      }
    });

    const preferred = registry.map(entry => entry.role).find(Boolean);
    const loadOptions = preferred ? { preferredPersonaId: preferred } : {};
    global.PersonaStore.loadPersonas(loadOptions).then(syncFromStore).catch(() => syncFromStore());
  }

  function init() {
    collectDropdowns();
    if (!registry.length) return;
    initializeStoreIntegration();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

