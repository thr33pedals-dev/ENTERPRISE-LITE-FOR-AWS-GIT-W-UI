(function (global) {
    const listeners = new Set();
    const STORAGE_PREFIX = 'persona:selected:';
    const DEFAULT_PERSONAS = [
        { personaId: 'sales', name: 'Sales', description: 'Sales assistant persona', type: 'sales' },
        { personaId: 'support', name: 'Support', description: 'Support assistant persona', type: 'support' },
        { personaId: 'interview', name: 'Interview', description: 'Interview assistant persona', type: 'interview' }
    ];

    let personas = [];
    let selectedPersonaId = null;
    let lastTenantId = null;
    let loadingPromise = null;

    const shallowClone = (list) => list.map(item => ({ ...item }));

    const getTenantId = () => {
        if (global.platform && typeof global.platform.getTenantId === 'function') {
            return global.platform.getTenantId();
        }
        if (global.SMEAIClient && typeof global.SMEAIClient.resolveTenantId === 'function') {
            return global.SMEAIClient.resolveTenantId();
        }
        return 'default';
    };

    const getStorageKey = (tenantId) => `${STORAGE_PREFIX}${tenantId}`;

    const persistSelection = (tenantId, personaId) => {
        try {
            if (personaId) {
                localStorage.setItem(getStorageKey(tenantId), personaId);
            } else {
                localStorage.removeItem(getStorageKey(tenantId));
            }
        } catch (error) {
            console.warn('PersonaStore: failed to persist selection', error);
        }
    };

    const readPersistedSelection = (tenantId) => {
        try {
            return localStorage.getItem(getStorageKey(tenantId));
        } catch (error) {
            console.warn('PersonaStore: failed to read selection', error);
            return null;
        }
    };

    const notify = (event) => {
        const snapshot = {
            event,
            personas: shallowClone(personas),
            selectedPersona: getSelectedPersona()
        };
        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.warn('PersonaStore listener failed', error);
            }
        });
    };

    const ensureDefaults = () => {
        const existingIds = new Set(personas.map((persona) => persona.personaId || persona.id));
        DEFAULT_PERSONAS.forEach((seed) => {
            if (!existingIds.has(seed.personaId)) {
                personas.push({
                    ...seed,
                    id: null,
                    metadata: { isVirtual: true }
                });
            }
        });
    };

    const resolveSelection = (tenantId, preferredPersonaId) => {
        const persisted = readPersistedSelection(tenantId);
        const targetId = preferredPersonaId || persisted || selectedPersonaId;

        const candidate = personas.find((persona) => {
            const id = persona.personaId || persona.id;
            return id && id === targetId;
        });

        if (candidate) {
            selectedPersonaId = candidate.personaId || candidate.id;
            persistSelection(tenantId, selectedPersonaId);
            return getSelectedPersona();
        }

        const salesDefault = personas.find((persona) => (persona.personaId || persona.id) === 'sales');
        const first = salesDefault || personas[0] || null;
        selectedPersonaId = first ? (first.personaId || first.id || null) : null;
        persistSelection(tenantId, selectedPersonaId);
        return getSelectedPersona();
    };

    const loadPersonas = async (options = {}) => {
        const tenantId = getTenantId();
        if (!options.force && loadingPromise && lastTenantId === tenantId) {
            return loadingPromise;
        }

        if (!options.force && lastTenantId === tenantId && personas.length > 0) {
            return Promise.resolve({
                personas: shallowClone(personas),
                selectedPersona: resolveSelection(tenantId, options.preferredPersonaId)
            });
        }

        lastTenantId = tenantId;
        loadingPromise = (async () => {
            try {
                const response = await global.SMEAIClient.listPersonas({ tenantId });
                const records = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
                personas = records.map((record) => ({ ...record }));
            } catch (error) {
                console.warn('PersonaStore: failed to load personas, falling back to defaults', error);
                personas = [];
            }

            ensureDefaults();
            const selectedPersona = resolveSelection(tenantId, options.preferredPersonaId);
            notify('loaded');
            return {
                personas: shallowClone(personas),
                selectedPersona
            };
        })();

        return loadingPromise;
    };

    const getPersonas = () => shallowClone(personas);

    const getSelectedPersona = () => {
        if (!selectedPersonaId) return null;
        return personas.find((persona) => {
            const id = persona.personaId || persona.id;
            return id && id === selectedPersonaId;
        }) || null;
    };

    const setSelectedPersona = (personaId) => {
        const tenantId = getTenantId();
        if (!personaId) {
            selectedPersonaId = null;
            persistSelection(tenantId, null);
            notify('selection');
            return;
        }
        const exists = personas.some((persona) => {
            const id = persona.personaId || persona.id;
            return id && id === personaId;
        });
        if (!exists) {
            console.warn('PersonaStore: attempted to select unknown persona', personaId);
            return;
        }
        selectedPersonaId = personaId;
        persistSelection(tenantId, personaId);
        notify('selection');
    };

    const subscribe = (listener) => {
        if (typeof listener !== 'function') {
            throw new Error('PersonaStore.subscribe requires a function');
        }
        listeners.add(listener);
        listener({
            event: 'init',
            personas: shallowClone(personas),
            selectedPersona: getSelectedPersona()
        });
        return () => listeners.delete(listener);
    };

    const refresh = (options = {}) => loadPersonas({ ...options, force: true });

    global.PersonaStore = {
        loadPersonas,
        refresh,
        getPersonas,
        getSelectedPersona,
        setSelectedPersona,
        subscribe
    };
})(window);

