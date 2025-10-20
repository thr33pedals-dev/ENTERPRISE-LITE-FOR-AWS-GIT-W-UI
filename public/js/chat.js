(function (global) {
    const defaultWelcome = `👋 Hi! I'm your AI assistant. Upload your files above (Excel, PDF, DOCX, TXT), then ask me about tracking data, products, procedures, or any information in your documents!`;

    const ChatClient = function (options = {}) {
        this.messagesContainer = options.messagesContainer;
        this.onStatus = options.onStatus || function () {};
        this.onProcessingChange = options.onProcessingChange || function () {};
        this.markdown = options.markdown || global.marked;
        this.tenantId = options.tenantId || global.SMEAIClient?.resolveTenantId?.();
        this.conversationId = options.conversationId || null;
        this.transcriptId = null;
        this.localStorageKey = `conversationHistory:${this.tenantId}`;
        this.history = [];
        this.isProcessing = false;
        this.restoreConversation();
    };

    ChatClient.prototype.ensureContainer = function () {
        if (!this.messagesContainer) {
            throw new Error('messagesContainer is required for ChatClient');
        }
    };

    ChatClient.prototype.setProcessing = function (value) {
        this.isProcessing = Boolean(value);
        this.onProcessingChange(this.isProcessing);
    };

    ChatClient.prototype.addMessage = function (role, content) {
        this.ensureContainer();
        const messageId = 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        messageDiv.id = messageId;

        if (role === 'assistant' && this.markdown && typeof this.markdown.parse === 'function' && !content.includes('<span class="loading">')) {
            try {
                messageDiv.innerHTML = this.markdown.parse(content);
            } catch (error) {
                messageDiv.textContent = content;
            }
        } else {
            messageDiv.textContent = content;
        }

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return messageId;
    };

    ChatClient.prototype.persistConversation = function () {
        const payload = {
            history: this.history.slice(-50),
            timestamp: Date.now(),
            tenantId: this.tenantId,
            conversationId: this.conversationId,
            transcriptId: this.transcriptId
        };
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(payload));
        } catch (error) {
            console.warn('Failed to persist conversation', error);
        }
    };

    ChatClient.prototype.restoreConversation = function () {
        try {
            const stored = localStorage.getItem(this.localStorageKey);
            if (!stored) {
                if (this.messagesContainer) {
                    this.messagesContainer.innerHTML = `<div class="message assistant">${defaultWelcome}</div>`;
                }
                return;
            }
            const payload = JSON.parse(stored);
            if (!payload || !Array.isArray(payload.history)) return;
            this.history = payload.history;
            this.conversationId = payload.conversationId || null;
            this.transcriptId = payload.transcriptId || null;
            if (this.messagesContainer) {
                this.messagesContainer.innerHTML = '';
                this.history.forEach(entry => this.addMessage(entry.role, entry.content));
            }
        } catch (error) {
            console.warn('Failed to restore conversation history', error);
        }
    };

    ChatClient.prototype.clearConversation = function () {
        this.history = [];
        localStorage.removeItem(this.localStorageKey);
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = `<div class="message assistant">${defaultWelcome}</div>`;
        }
        this.conversationId = null;
        this.transcriptId = null;
    };

    ChatClient.prototype.send = async function (message) {
        if (!message) {
            throw new Error('Message is required');
        }
        if (this.isProcessing) return;

        this.addMessage('user', message);
        this.history.push({ role: 'user', content: message });
        this.persistConversation();
        const typingId = this.addMessage('assistant', '⏳ Thinking...');
        this.setProcessing(true);

        try {
            const result = await global.SMEAIClient.chat(message, this.history, {
                tenantId: this.tenantId,
                conversationId: this.conversationId,
                transcriptId: this.transcriptId
            });
            document.getElementById(typingId)?.remove();
            if (result.success) {
                this.addMessage('assistant', result.response);
                this.history.push({ role: 'assistant', content: result.response });
                this.conversationId = result.conversationId || this.conversationId || result.transcriptId || null;
                this.transcriptId = result.transcriptId || this.transcriptId || null;
                this.persistConversation();
            } else {
                this.addMessage('assistant', `❌ Error: ${result.error}`);
            }
            return result;
        } catch (error) {
            document.getElementById(typingId)?.remove();
            this.addMessage('assistant', `❌ Failed to get response: ${error.message}`);
            throw error;
        } finally {
            this.setProcessing(false);
        }
    };

    global.SMEAIChat = ChatClient;
})(window);
