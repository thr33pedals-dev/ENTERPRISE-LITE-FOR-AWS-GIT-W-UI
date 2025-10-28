(function (global) {
    const Uploader = function (options = {}) {
        this.onStatus = options.onStatus || function () {};
        this.onManifest = options.onManifest || function () {};
        this.onQualityReport = options.onQualityReport || function () {};
        this.onStart = options.onStart || function () {};
        this.onComplete = options.onComplete || function () {};
        this.onError = options.onError || function () {};
        this.persona = options.persona || null;
        this.apiOptions = {
            tenantId: global.SMEAIClient?.resolveTenantId?.(options),
            ...(this.persona ? { persona: this.persona } : {})
        };
    };

    Uploader.prototype.upload = async function (files) {
        try {
            this.onStart();
            const result = await global.SMEAIClient.uploadFiles(files, this.apiOptions);
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
            const status = await global.SMEAIClient.getStatus(this.apiOptions);
            this.onManifest(status.manifest || null);
            if (status.status?.dataUploaded) {
                const report = await global.SMEAIClient.getQualityReport(this.apiOptions);
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
        const result = await global.SMEAIClient.deleteFile(fileName, this.apiOptions);
        await this.refresh();
        this.onStatus('success', `✅ ${fileName} deleted`);
        return result;
    };

    Uploader.prototype.clearAll = async function () {
        const result = await global.SMEAIClient.clearAll(this.apiOptions);
        this.onManifest(null);
        this.onQualityReport(null, null);
        this.onStatus('success', '✅ All files cleared');
        return result;
    };

    global.SMEAIUploader = Uploader;
})(window);
