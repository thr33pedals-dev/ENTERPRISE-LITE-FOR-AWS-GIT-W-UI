(function (global) {
    const Uploader = function (options = {}) {
        this.onStatus = options.onStatus || function () {};
        this.onManifest = options.onManifest || function () {};
        this.onQualityReport = options.onQualityReport || function () {};
        this.onStart = options.onStart || function () {};
        this.onComplete = options.onComplete || function () {};
        this.onError = options.onError || function () {};

        this.getTenantId = () => {
            if (typeof options.tenantIdResolver === 'function') {
                return options.tenantIdResolver();
            }
            if (typeof options.tenantId === 'function') {
                return options.tenantId();
            }
            if (options.tenantId) {
                return options.tenantId;
            }
            if (global.platform?.getTenantId) {
                return global.platform.getTenantId();
            }
            if (global.SMEAIClient?.resolveTenantId) {
                return global.SMEAIClient.resolveTenantId(options);
            }
            return 'default';
        };

        this.getPersonaId = () => {
            if (typeof options.personaResolver === 'function') {
                return options.personaResolver();
            }
            if (typeof options.getPersonaId === 'function') {
                return options.getPersonaId();
            }
            if (typeof options.persona === 'function') {
                return options.persona();
            }
            if (options.persona) {
                return options.persona;
            }
            if (global.PersonaStore?.getSelectedPersona) {
                const selected = global.PersonaStore.getSelectedPersona();
                return selected?.personaId || selected?.id || null;
            }
            return null;
        };
    };

    Uploader.prototype.buildApiOptions = function () {
        const tenantId = this.getTenantId?.() || 'default';
        const persona = this.getPersonaId?.();
        return {
            tenantId,
            ...(persona ? { persona } : {})
        };
    };

    Uploader.prototype.upload = async function (files) {
        try {
            this.onStart();
            const result = await global.SMEAIClient.uploadFiles(files, this.buildApiOptions());
            this.onStatus('success', `✅ Successfully processed ${result.filesProcessed} file(s)!`);
            this.onManifest(result.manifest);
            if (result.qualityReport) {
                this.onQualityReport(result.qualityReport, result.mainFile);
            }
            this.onComplete(result);
            return result;
        } catch (error) {
            this.onStatus('error', `❌ Upload failed: ${error.message}`);
            this.onError(error);
            throw error;
        }
    };

    Uploader.prototype.refresh = async function () {
        try {
            const status = await global.SMEAIClient.getStatus(this.buildApiOptions());
            this.onManifest(status.manifest || null);
            if (status.status?.dataUploaded) {
                const report = await global.SMEAIClient.getQualityReport(this.buildApiOptions());
                if (report.success) {
                    this.onQualityReport(report.qualityReport, report.mainFile);
                }
            }
            return status;
        } catch (error) {
            this.onError(error);
            throw error;
        }
    };

    Uploader.prototype.deleteFile = async function (fileName) {
        const result = await global.SMEAIClient.deleteFile(fileName, this.buildApiOptions());
        await this.refresh();
        this.onStatus('success', `✅ ${fileName} deleted`);
        return result;
    };

    Uploader.prototype.clearAll = async function () {
        const result = await global.SMEAIClient.clearAll(this.buildApiOptions());
        this.onManifest(null);
        this.onQualityReport(null, null);
        this.onStatus('success', '✅ All files cleared');
        return result;
    };

    global.SMEAIUploader = Uploader;
})(window);
