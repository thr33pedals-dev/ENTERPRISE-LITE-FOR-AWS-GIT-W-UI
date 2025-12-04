// Sales AI Configuration JavaScript
class SalesAIManager {
    constructor() {
        this.currentConfig = null;
        this.uploadedFiles = [];
        this.defaultPersonaId = 'sales';
        this.personaId = this.defaultPersonaId;
        this.personaSubscription = null;
        this.isInitialized = false;
        this.bootstrap();
    }

    bootstrap() {
        if (window.PersonaStore) {
            this.personaSubscription = window.PersonaStore.subscribe((snapshot) => {
                if (!snapshot) return;
                if (snapshot.event === 'init' || snapshot.event === 'loaded' || snapshot.event === 'selection') {
                    const nextId = this.extractPersonaId(snapshot.selectedPersona);
                    if (nextId && nextId !== this.personaId) {
                        this.personaId = nextId;
                        if (this.isInitialized) {
                            this.handlePersonaChange();
                        }
                    }
                }
            });

            window.PersonaStore.loadPersonas({ preferredPersonaId: this.defaultPersonaId })
                .then(({ selectedPersona }) => {
                    const initialId = this.extractPersonaId(selectedPersona);
                    if (initialId) {
                        this.personaId = initialId;
                    }
                })
                .catch((error) => {
                    console.warn('SalesAI: unable to load personas, using defaults', error);
                })
                .finally(() => {
                    this.init();
                    this.isInitialized = true;
                });
            return;
        }

        this.init();
        this.isInitialized = true;
    }

    extractPersonaId(persona) {
        if (!persona) return null;
        return persona.personaId || persona.id || null;
    }

    getPersonaId() {
        if (window.PersonaStore?.getSelectedPersona) {
            const selected = window.PersonaStore.getSelectedPersona();
            if (selected) {
                return this.extractPersonaId(selected) || this.personaId;
            }
        }
        return this.personaId || this.defaultPersonaId;
    }

    handlePersonaChange() {
        if (!this.isInitialized) return;
        this.currentConfig = null;
        this.loadExistingConfiguration();
        this.loadExistingManifest();
    }

    init() {
        this.checkAuthentication();
        this.setupSharedClients();
        this.setupEventListeners();
        this.initializeTonePicker();
        this.loadExistingConfiguration();
        this.loadExistingManifest();
    }

    buildHeaders(extra = {}) {
        const tenantId = window.platform?.getTenantId ? window.platform.getTenantId() : null;
        const personaId = this.getPersonaId();
        const base = window.SMEAIClient?.buildHeaders
            ? window.SMEAIClient.buildHeaders(tenantId, personaId, extra)
            : {
                ...(extra || {}),
                ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
                ...(personaId ? { 'x-persona-id': personaId } : {})
            };

        const headers = new Headers(base);
        if (this.currentUser?.id) {
            headers.set('x-company-id', this.currentUser.id);
        }
        return headers;
    }

    checkAuthentication() {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (!currentUser) {
            // Temporarily bypass authentication for preview
            this.currentUser = {
                id: 'preview_user',
                company_name: 'Preview Company'
            };
            return;
        }
        this.currentUser = currentUser;
    }

    setupSharedClients() {
        this.uploader = new SMEAIUploader({
            tenantIdResolver: () => platform.getTenantId(),
            getPersonaId: () => this.getPersonaId(),
            onStatus: (type, message) => this.showNotification(message, type),
            onManifest: (manifest) => this.displayUploadedFiles(manifest),
            onQualityReport: (report) => this.updateQualitySummary(report),
            onError: (error) => console.error('Uploader error:', error)
        });
    }

    setupEventListeners() {
        // Video toggle
        const toggleVideo = document.getElementById('toggleVideo');
        const videoContainer = document.getElementById('videoContainer');
        
        toggleVideo.addEventListener('click', () => {
            const isHidden = videoContainer.classList.contains('hidden');
            videoContainer.classList.toggle('hidden', !isHidden);
            toggleVideo.innerHTML = isHidden ? 
                '<i class="fas fa-eye-slash mr-2"></i>Hide Tutorial' : 
                '<i class="fas fa-eye mr-2"></i>Watch Tutorial';
        });

        // File upload setup
        this.setupFileUpload();

        // Generate link button (now independent of form submit)
        document.getElementById('generateLinkBtn').addEventListener('click', () => this.generateAILink());

        // Copy/test buttons
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyAILink());
        document.getElementById('testLinkBtn').addEventListener('click', () => this.testAILink());
    }

    initializeTonePicker() {
        const toneSelect = document.getElementById('salesToneSelect');
        if (!toneSelect) return;

        toneSelect.addEventListener('change', () => {
            this.updateToneStatus(toneSelect.value);
        });

        this.updateToneStatus(toneSelect.value);
    }

    updateToneStatus(toneValue) {
        const statusEl = document.getElementById('toneStatus');
        if (!statusEl) return;
        const labels = {
            professional: 'Professional',
            friendly: 'Friendly',
            enthusiastic: 'Enthusiastic',
            consultative: 'Consultative'
        };
        statusEl.textContent = labels[toneValue] || 'Professional';
    }

    setupFileUpload() {
        const dropZone = document.getElementById('productDropZone');
        const fileInput = document.getElementById('productFileInput');
        const filesList = document.getElementById('productFilesList');

        const handleSelection = async (fileArray) => {
            if (!fileArray || fileArray.length === 0) return;
            try {
                await this.uploader.upload(fileArray);
                await this.loadExistingManifest();
            } catch (error) {
                // error already surfaced via uploader
            }
        };

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleSelection(Array.from(e.dataTransfer.files));
        });

        fileInput.addEventListener('change', (e) => {
            handleSelection(Array.from(e.target.files));
            e.target.value = '';
        });

        this.displayUploadedFiles = (manifest) => {
            if (!manifest || !Array.isArray(manifest.files)) {
                this.uploadedFiles = [];
                this.renderFilesList();
                this.updateStatuses();
                this.updateQualitySummary(null);
                return;
            }

            this.uploadedFiles = manifest.files.map(file => {
                const storageKey = file.path || file.artifacts?.storageKey || file.name;
                const displayName = file.name || (storageKey ? storageKey.split('/').pop() : 'Uploaded file');
                const rawSize = file.artifacts?.rawSize || file.artifacts?.size || file.size || 0;
                return {
                    name: file.name || displayName,
                    displayName,
                    type: file.type || '',
                    size: rawSize,
                    path: storageKey,
                    uploadedAt: file.uploadDate || file.uploadedAt || manifest.uploadTime || new Date().toISOString()
                };
            });

            this.renderFilesList();
            this.updateStatuses();
            // Update quality summary with manifest's quality report if available
            this.updateQualitySummary(manifest.qualityReport || null);
        };
    }

    async handleFileSelection(files) {
        const validFiles = files.filter(file => {
            const validTypes = ['.pdf', '.docx', '.txt', '.csv', '.xlsx'];
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            const validSize = file.size <= 10 * 1024 * 1024; // 10MB
            
            if (!validTypes.includes(extension)) {
                this.showNotification(`${file.name}: Invalid file type`, 'error');
                return false;
            }
            
            if (!validSize) {
                this.showNotification(`${file.name}: File too large (max 10MB)`, 'error');
                return false;
            }
            
            return true;
        });

        if (validFiles.length > 0) {
            await this.uploadFiles(validFiles);
        }
    }

    async uploadFiles(files) {
        this.showUploadModal(files);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const result = await SMEAIClient.uploadFiles([file], { tenantId: platform.getTenantId(), persona: this.getPersonaId() });
                if (result.success) {
                    this.updateUploadProgress(file.name, 100, 'completed');
                    await this.loadExistingManifest();
                } else {
                    this.updateUploadProgress(file.name, 0, 'error');
                }
            } catch (error) {
                this.updateUploadProgress(file.name, 0, 'error');
                console.error('Upload error:', error);
            }
        }

        setTimeout(() => this.hideUploadModal(), 2000);
    }

    showUploadModal(files) {
        const modal = document.getElementById('uploadModal');
        const progressContainer = document.getElementById('uploadProgress');
        
        progressContainer.innerHTML = '';
        
        files.forEach(file => {
            const progressItem = document.createElement('div');
            progressItem.className = 'space-y-2';
            progressItem.innerHTML = `
                <div class="flex items-center justify-between text-sm">
                    <span class="text-white">${file.name}</span>
                    <span class="text-gray-400" id="progress-${file.name.replace(/[^a-zA-Z0-9]/g, '')}">0%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2">
                    <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                         id="bar-${file.name.replace(/[^a-zA-Z0-9]/g, '')}" style="width: 0%"></div>
                </div>
            `;
            progressContainer.appendChild(progressItem);
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    updateUploadProgress(fileName, percentage, status) {
        const cleanName = fileName.replace(/[^a-zA-Z0-9]/g, '');
        const progressText = document.getElementById(`progress-${cleanName}`);
        const progressBar = document.getElementById(`bar-${cleanName}`);
        
        if (progressText && progressBar) {
            if (status === 'completed') {
                progressText.textContent = 'Completed';
                progressText.className = 'text-green-400';
                progressBar.className = 'bg-green-500 h-2 rounded-full transition-all duration-300';
                progressBar.style.width = '100%';
            } else if (status === 'error') {
                progressText.textContent = 'Error';
                progressText.className = 'text-red-400';
                progressBar.className = 'bg-red-500 h-2 rounded-full transition-all duration-300';
            } else {
                progressText.textContent = `${percentage}%`;
                progressBar.style.width = `${percentage}%`;
            }
        }
    }

    hideUploadModal() {
        const modal = document.getElementById('uploadModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    displayUploadedFile(file) {
        const filesList = document.getElementById('productFilesList');
        const fileItem = document.createElement('div');
        fileItem.className = 'bg-white rounded-lg p-3 flex items-center justify-between text-gray-800 shadow-sm';
        fileItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <i class="fas fa-file-alt text-blue-500"></i>
                <div>
                    <div class="font-semibold text-sm text-gray-900">${file.displayName}</div>
                    <div class="text-gray-500 text-xs">${file.type ? file.type.toUpperCase() : ''}</div>
                    <div class="text-gray-400 text-xs">${this.formatFileSize(file.size)} • ${new Date(file.uploadedAt).toLocaleDateString()}</div>
                </div>
            </div>
            <button class="text-red-500 hover:text-red-400 transition" data-file-name="${file.name}" data-file-path="${file.path}">
                <i class="fas fa-trash text-sm"></i>
            </button>
        `;

        fileItem.querySelector('button').addEventListener('click', async (event) => {
            const target = event.currentTarget;
            const fileName = target.getAttribute('data-file-name');
            if (!confirm(`Remove ${fileName}?`)) return;
            try {
                await this.uploader.deleteFile(fileName);
                await this.loadExistingManifest();
            } catch (error) {
                console.error('Error removing file:', error);
                this.showNotification('Failed to remove file', 'error');
            }
        });

        filesList.appendChild(fileItem);
    }

    removeFile(filePath) {
        this.uploadedFiles = this.uploadedFiles.filter(file => file.path !== filePath && file.name !== filePath);
        this.renderFilesList();
        this.updateStatuses();
    }

    renderFilesList() {
        const filesList = document.getElementById('productFilesList');
        filesList.innerHTML = '';
        
        this.uploadedFiles.forEach(file => {
            this.displayUploadedFile(file);
        });
    }

    addQualificationQuestion() {
        const container = document.getElementById('qualificationQuestions');
        const questionDiv = document.createElement('div');
        questionDiv.className = 'flex items-center space-x-2';
        questionDiv.innerHTML = `
            <input type="text" placeholder="Enter qualification question..." 
                class="flex-1 bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 text-sm">
            <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 p-1">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(questionDiv);
    }

    async handleConfigSave(e) {
        e.preventDefault();
        
        const formData = this.getFormData();
        const validation = this.validateConfiguration(formData);
        
        if (!validation.isValid) {
            this.showNotification(validation.errors.join(', '), 'error');
            return;
        }

        try {
            // Save or update configuration
            if (this.currentConfig) {
                await this.updateConfiguration(formData);
            } else {
                await this.createConfiguration(formData);
            }
            
            this.showNotification('Sales AI configuration saved successfully!', 'success');
            this.generateAILink();
            
        } catch (error) {
            console.error('Save error:', error);
            this.showNotification('Error saving configuration', 'error');
        }
    }

    getFormData() {
        const questions = Array.from(document.querySelectorAll('#qualificationQuestions input'))
            .map(input => input.value.trim())
            .filter(q => q.length > 0);

        const toneSelect = document.getElementById('salesToneSelect');
        const tone = toneSelect ? toneSelect.value : 'professional';

        return {
            customPrompt: document.getElementById('customPrompt').value.trim(),
            salesApproach: document.getElementById('salesApproach').value,
            qualificationQuestions: questions,
            responseTone: tone,
            productFiles: this.uploadedFiles
        };
    }

    validateConfiguration(data) {
        const errors = [];
        
        if (!data.customPrompt) {
            errors.push('Custom sales instructions are required');
        }
        
        if (this.uploadedFiles.length === 0) {
            errors.push('Please upload at least one product information file');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    async createConfiguration(formData) {
        const configData = {
            company_id: this.currentUser.id,
            product_info_file: JSON.stringify(formData.productFiles),
            custom_prompt: formData.customPrompt,
            ai_link: '', // Will be generated after creation
            usage_count: 0,
            last_used: null,
            status: 'active',
            sales_approach: formData.salesApproach,
            qualification_questions: JSON.stringify(formData.qualificationQuestions),
            response_tone: formData.responseTone
        };

        const headers = this.buildHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch('/api/sales-ai', {
            method: 'POST',
            headers,
            body: JSON.stringify(configData)
        });

        if (!response.ok) {
            throw new Error('Failed to create configuration');
        }

        this.currentConfig = await response.json();
        return this.currentConfig;
    }

    async updateConfiguration(formData) {
        const updateData = {
            product_info_file: JSON.stringify(formData.productFiles),
            custom_prompt: formData.customPrompt,
            sales_approach: formData.salesApproach,
            qualification_questions: JSON.stringify(formData.qualificationQuestions),
            response_tone: formData.responseTone
        };

        const headers = this.buildHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`/api/sales-ai/${encodeURIComponent(this.currentConfig.id)}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            throw new Error('Failed to update configuration');
        }

        this.currentConfig = await response.json();
        return this.currentConfig;
    }

    generateAILink() {
        if (this.uploadedFiles.length === 0) {
            this.showNotification('Upload at least one product document before generating a link.', 'error');
            return;
        }
        const tenantId = platform.getTenantId();
        const personaId = this.getPersonaId();
        const params = new URLSearchParams({ tenant: tenantId, type: 'sales', config: 'preview' });
        if (personaId) {
            params.set('persona', personaId);
        }
        const link = `${window.location.origin}/component-preview.html?${params.toString()}`;
        document.getElementById('aiLinkDisplay').value = link;
        this.showNotification('Sales AI link generated!', 'success');
        document.getElementById('linkStatus').textContent = 'Generated';
        this.updateAILinkRecord(link);
    }

    async updateAILinkRecord(link) {
        if (!this.currentConfig) return;
        try {
            const headers = this.buildHeaders({ 'Content-Type': 'application/json' });
            await fetch(`/api/sales-ai/${encodeURIComponent(this.currentConfig.id)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ ai_link: link })
            });
        } catch (error) {
            console.warn('Failed to update AI link record', error);
        }
    }

    copyAILink() {
        const linkInput = document.getElementById('aiLinkDisplay');
        if (!linkInput.value) {
            this.showNotification('Generate a link first.', 'error');
            return;
        }
        linkInput.select();
        document.execCommand('copy');
        this.showNotification('Link copied to clipboard!', 'success');
    }

    testAILink() {
        const link = document.getElementById('aiLinkDisplay').value;
        if (!link) {
            this.showNotification('Generate a link first.', 'error');
            return;
        }
        window.open(link, '_blank');
    }

    showPreview() {
        const formData = this.getFormData();
        
        if (!formData.customPrompt) {
            this.showNotification('Please add custom instructions to preview the AI', 'error');
            return;
        }

        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        
        // Generate preview content
        content.innerHTML = `
            <div class="space-y-4">
                <div class="bg-gray-700 rounded p-4">
                    <div class="flex items-center mb-2">
                        <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-robot text-white text-sm"></i>
                        </div>
                        <div class="text-white font-medium">Sales AI Assistant</div>
                    </div>
                    <div class="text-gray-300 text-sm">
                        Hello! I'm your AI sales assistant. I'm here to help you learn about our products and find the perfect solution for your needs. How can I assist you today?
                    </div>
                </div>
                
                <div class="bg-blue-600 rounded p-4 ml-8">
                    <div class="text-white text-sm">
                        Hi, I'm interested in your products. Can you tell me more about what you offer?
                    </div>
                </div>
                
                <div class="bg-gray-700 rounded p-4">
                    <div class="flex items-center mb-2">
                        <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-robot text-white text-sm"></i>
                        </div>
                        <div class="text-white font-medium">Sales AI Assistant</div>
                    </div>
                    <div class="text-gray-300 text-sm">
                        ${this.generatePreviewResponse(formData)}
                    </div>
                </div>
                
                <div class="border-t border-gray-600 pt-4">
                    <h4 class="text-white font-medium mb-3">Configuration Summary:</h4>
                    <div class="space-y-2 text-sm">
                        <div><span class="text-gray-400">Approach:</span> <span class="text-white">${formData.salesApproach}</span></div>
                        <div><span class="text-gray-400">Tone:</span> <span class="text-white">${formData.responseTone}</span></div>
                        <div><span class="text-gray-400">Files Uploaded:</span> <span class="text-white">${this.uploadedFiles.length}</span></div>
                        <div><span class="text-gray-400">Qualification Questions:</span> <span class="text-white">${formData.qualificationQuestions.length}</span></div>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    generatePreviewResponse(formData) {
        const toneMap = {
            professional: "I'd be happy to provide you with detailed information about our offerings.",
            friendly: "Great question! I'm excited to share what we have available for you.",
            enthusiastic: "Absolutely! I'm thrilled to tell you about our amazing products!",
            consultative: "To better assist you, let me understand your specific needs first."
        };

        const baseResponse = toneMap[formData.responseTone] || toneMap.professional;
        
        return `${baseResponse} Based on our product information and your requirements, I can help you find the perfect solution. ${formData.customPrompt.substring(0, 200)}... 

Would you mind sharing a bit about your specific needs and budget range so I can provide more targeted recommendations?`;
    }

    closePreview() {
        const modal = document.getElementById('previewModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async loadExistingConfiguration() {
        try {
            const headers = this.buildHeaders();
            const response = await fetch('/api/sales-ai', { headers });
            if (!response.ok) {
                throw new Error('Failed to load Sales AI configuration');
            }
            const data = await response.json();
            const records = Array.isArray(data?.data) ? data.data : [];
            if (records.length > 0) {
                this.currentConfig = records[0];
                this.populateFormWithConfig(this.currentConfig);
                this.generateAILink();
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    populateFormWithConfig(config) {
        this.uploadedFiles = [];
        if (config.product_info_file) {
            try {
                const parsed = JSON.parse(config.product_info_file);
                if (Array.isArray(parsed)) {
                    this.uploadedFiles = parsed;
                }
            } catch (error) {
                console.warn('Failed to parse product files', error);
            }
        }

        if (config.response_tone) {
            const toneSelect = document.getElementById('salesToneSelect');
            if (toneSelect) {
                toneSelect.value = config.response_tone;
                this.updateToneStatus(config.response_tone);
            }
        }
        this.updateStatuses();
        this.renderFilesList();
        this.generateAILink();
    }

    async loadExistingManifest() {
        try {
            const status = await SMEAIClient.getStatus({ tenantId: platform.getTenantId(), persona: this.getPersonaId() });
            this.displayUploadedFiles(status.manifest || null);
            if (status?.status?.qualityReport) {
                this.updateQualitySummary(status.status.qualityReport);
            }
        } catch (error) {
            console.warn('SalesAI: unable to load manifest', error);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        // Use the notification system from main.js
        if (window.platform && window.platform.showNotification) {
            window.platform.showNotification(message, type);
        } else {
            alert(message); // Fallback
        }
    }

    displayQualityReport(report) {
        const container = document.getElementById('qualityReportSummary');
        if (!container) return;
        if (!report) {
            container.innerHTML = '<p class="text-gray-400 text-sm">No quality report available yet.</p>';
            return;
        }
        const scoreColor = report.qualityScore >= 80 ? 'text-green-400' : report.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400';
        container.innerHTML = `
            <div class="flex items-center justify-between text-sm">
                <span class="text-gray-400">Quality Score</span>
                <span class="${scoreColor} font-semibold">${report.qualityScore}%</span>
            </div>
            <div class="flex items-center justify-between text-sm">
                <span class="text-gray-400">Total Records</span>
                <span class="text-white">${report.totalRows}</span>
            </div>
        `;
    }

    updateQualitySummary(report) {
        const scoreDisplay = document.getElementById('qualityScoreDisplay');
        const countDisplay = document.getElementById('documentCountDisplay');
        const recommendationsList = document.getElementById('qualityRecommendations');

        if (!scoreDisplay || !countDisplay) return;

        const fileCount = this.uploadedFiles.length;
        countDisplay.textContent = fileCount;

        // Calculate knowledge base coverage score based on documents
        if (!report) {
            if (fileCount === 0) {
                scoreDisplay.textContent = '—';
                scoreDisplay.className = 'font-semibold text-neutral-400';
            } else if (fileCount >= 5) {
                scoreDisplay.textContent = 'Excellent';
                scoreDisplay.className = 'font-semibold text-green-600';
            } else if (fileCount >= 3) {
                scoreDisplay.textContent = 'Good';
                scoreDisplay.className = 'font-semibold text-primary-500';
            } else {
                scoreDisplay.textContent = 'Basic';
                scoreDisplay.className = 'font-semibold text-amber-600';
            }
            
            if (recommendationsList) {
                recommendationsList.innerHTML = `
                    <li class="flex items-start"><span class="status-dot bg-primary-500 mt-1.5 mr-2 flex-shrink-0"></span><span>Upload product catalogs, pricing sheets, and comparison charts.</span></li>
                    <li class="flex items-start"><span class="status-dot bg-primary-500 mt-1.5 mr-2 flex-shrink-0"></span><span>Include brochures or FAQs highlighting USPs or offers.</span></li>
                    <li class="flex items-start"><span class="status-dot bg-primary-500 mt-1.5 mr-2 flex-shrink-0"></span><span>Refresh documents whenever new features or SKUs launch.</span></li>
                `;
            }
            return;
        }

        // Show actual quality score for Excel/CSV files
        scoreDisplay.textContent = `${report.qualityScore}%`;
        scoreDisplay.className = report.qualityScore >= 80 ? 'font-semibold text-green-600' : 
                                 report.qualityScore >= 60 ? 'font-semibold text-amber-600' : 
                                 'font-semibold text-red-600';

        if (recommendationsList && report.recommendations?.length) {
            recommendationsList.innerHTML = report.recommendations.slice(0, 3).map(rec => `
                <li class="flex items-start"><span class="status-dot bg-primary-500 mt-1.5 mr-2 flex-shrink-0"></span><span>${rec.message}</span></li>
            `).join('');
        }
    }

    updateStatuses() {
        document.getElementById('filesStatus').textContent = `${this.uploadedFiles.length} ${this.uploadedFiles.length === 1 ? 'file' : 'files'}`;
        const docCountDisplay = document.getElementById('documentCountDisplay');
        if (docCountDisplay) {
            docCountDisplay.textContent = this.uploadedFiles.length;
        }
        const toneSelect = document.getElementById('salesToneSelect');
        if (toneSelect) {
            this.updateToneStatus(toneSelect.value);
        }
    }
}

// Initialize Sales AI Manager
const salesAI = new SalesAIManager();