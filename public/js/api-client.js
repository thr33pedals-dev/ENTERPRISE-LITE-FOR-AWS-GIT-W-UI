// Enterprise Lite AI Platform - API client utilities
(function (global) {
    const resolveTenantId = (options = {}) => {
        if (options.tenantId) return options.tenantId;
        if (global.platform && typeof global.platform.getTenantId === 'function') {
            return global.platform.getTenantId();
        }
        return 'default';
    };

    const buildHeaders = (tenantId, base = {}) => ({
        ...base,
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
    });

    const buildUrl = (path, tenantId, extraQuery) => {
        const params = new URLSearchParams(extraQuery || {});
        if (tenantId) params.set('tenantId', tenantId);
        const query = params.toString();
        return query ? `${path}?${query}` : path;
    };

    const parseJson = async (response) => {
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('Failed to parse server response');
        }
    };

    const handleResponse = async (response) => {
        const data = await parseJson(response);
        if (!response.ok) {
            const message = data?.error || data?.message || response.statusText || 'Request failed';
            const error = new Error(message);
            error.response = data;
            throw error;
        }
        return data;
    };

    const uploadFiles = async (files, options = {}) => {
        const tenantId = resolveTenantId(options);
        const formData = new FormData();
        const fileArray = Array.from(files || []);
        fileArray.forEach(file => formData.append('files', file));

        if (fileArray.length === 0) {
            throw new Error('At least one file is required');
        }

        const response = await fetch(buildUrl('/api/upload', tenantId), {
            method: 'POST',
            body: formData
        });

        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const getStatus = async (options = {}) => {
        const tenantId = resolveTenantId(options);
        const response = await fetch(buildUrl('/api/status', tenantId));
        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const getQualityReport = async (options = {}) => {
        const tenantId = resolveTenantId(options);
        const response = await fetch(buildUrl('/api/quality-report', tenantId));
        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const deleteFile = async (fileName, options = {}) => {
        if (!fileName) {
            throw new Error('File name is required');
        }
        const tenantId = resolveTenantId(options);
        const response = await fetch(buildUrl('/api/delete-file', tenantId), {
            method: 'DELETE',
            headers: buildHeaders(tenantId, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ fileName })
        });
        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const clearAll = async (options = {}) => {
        const tenantId = resolveTenantId(options);
        const response = await fetch(buildUrl('/api/clear', tenantId), {
            method: 'DELETE',
            headers: buildHeaders(tenantId)
        });
        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const chat = async (message, conversationHistory = [], options = {}) => {
        if (!message) {
            throw new Error('Message is required');
        }
        const tenantId = resolveTenantId(options);
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: buildHeaders(tenantId, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message,
                conversationHistory,
                conversationId: options.conversationId || null,
                transcriptId: options.transcriptId || null
            })
        });
        const data = await handleResponse(response);
        data.tenantId = tenantId;
        return data;
    };

    const listCompanies = async () => {
        const response = await fetch('/api/companies');
        return handleResponse(response);
    };

    const getCompany = async (companyId) => {
        if (!companyId) throw new Error('companyId is required');
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}`);
        return handleResponse(response);
    };

    const updateCompany = async (companyId, updates) => {
        if (!companyId) throw new Error('companyId is required');
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates || {})
        });
        return handleResponse(response);
    };

    const listConfigs = async (type, companyId) => {
        const params = new URLSearchParams();
        if (companyId) params.set('companyId', companyId);
        const response = await fetch(`/api/${type}?${params.toString()}`);
        return handleResponse(response);
    };

    const upsertConfig = async (type, configId, payload) => {
        const url = configId ? `/api/${type}/${encodeURIComponent(configId)}` : `/api/${type}`;
        const method = configId ? 'PATCH' : 'POST';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
        return handleResponse(response);
    };

    const deleteConfig = async (type, configId) => {
        const response = await fetch(`/api/${type}/${encodeURIComponent(configId)}`, { method: 'DELETE' });
        return handleResponse(response);
    };

    const exportTranscript = async (transcriptId) => {
        const response = await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/export`);
        return handleResponse(response);
    };

    const sendTranscript = async (transcriptId, email) => {
        const response = await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return handleResponse(response);
    };

    global.SMEAIClient = {
        uploadFiles,
        getStatus,
        getQualityReport,
        deleteFile,
        clearAll,
        chat,
        resolveTenantId,
        listCompanies,
        getCompany,
        updateCompany,
        listConfigs,
        upsertConfig,
        deleteConfig,
        exportTranscript,
        sendTranscript
    };
})(window);
