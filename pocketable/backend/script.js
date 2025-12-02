class TodoApp {
    constructor() {
        this.todos = this.loadTodos();
        this.currentFilter = 'all';
        this.editingId = null;

        this.initEventListeners();
        this.render();
    }

    // Initialize all event listeners
    initEventListeners() {
        // Form submission
        document.getElementById('todoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTodo();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });

        // Clear completed button
        document.getElementById('clearCompleted').addEventListener('click', () => {
            this.clearCompleted();
        });

        // Input focus on load
        document.getElementById('todoInput').focus();
    }

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Add new todo
    addTodo() {
        const input = document.getElementById('todoInput');
        const text = input.value.trim();

        if (!text) return;

        const todo = {
            id: this.generateId(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.todos.unshift(todo);
        this.saveTodos();
        this.render();

        // Clear input and add animation
        input.value = '';
        input.focus();

        // Add subtle success feedback
        this.showFeedback('Task added successfully!');
    }

    // Toggle todo completion
    toggleTodo(id) {
        this.todos = this.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        );
        this.saveTodos();
        this.render();
    }

    // Delete todo
    deleteTodo(id) {
        // Add confirmation for better UX
        if (confirm('Are you sure you want to delete this task?')) {
            this.todos = this.todos.filter(todo => todo.id !== id);
            this.saveTodos();
            this.render();
            this.showFeedback('Task deleted successfully!');
        }
    }

    // Start editing todo
    startEdit(id) {
        this.editingId = id;
        this.render();

        // Focus the edit input
        const editInput = document.querySelector(`[data-id="${id}"] .edit-input`);
        if (editInput) {
            editInput.focus();
            editInput.select();
        }
    }

    // Save edit
    saveEdit(id, newText) {
        const text = newText.trim();

        if (!text) {
            this.cancelEdit();
            return;
        }

        this.todos = this.todos.map(todo =>
            todo.id === id ? { ...todo, text } : todo
        );

        this.editingId = null;
        this.saveTodos();
        this.render();
        this.showFeedback('Task updated successfully!');
    }

    // Cancel edit
    cancelEdit() {
        this.editingId = null;
        this.render();
    }

    // Set filter
    setFilter(filter) {
        this.currentFilter = filter;

        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');

        this.render();
    }

    // Clear completed todos
    clearCompleted() {
        const completedCount = this.todos.filter(todo => todo.completed).length;

        if (completedCount === 0) return;

        if (confirm(`Are you sure you want to delete ${completedCount} completed task(s)?`)) {
            this.todos = this.todos.filter(todo => !todo.completed);
            this.saveTodos();
            this.render();
            this.showFeedback(`${completedCount} completed task(s) deleted!`);
        }
    }

    // Get filtered todos
    getFilteredTodos() {
        switch (this.currentFilter) {
            case 'pending':
                return this.todos.filter(todo => !todo.completed);
            case 'completed':
                return this.todos.filter(todo => todo.completed);
            default:
                return this.todos;
        }
    }

    // Create todo HTML element
    createTodoElement(todo) {
        const isEditing = this.editingId === todo.id;

        return `
            <li class="todo-item ${todo.completed ? 'completed' : ''} ${isEditing ? 'editing' : ''}" data-id="${todo.id}">
                <label class="todo-checkbox">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="todoApp.toggleTodo('${todo.id}')">
                    <span class="checkmark">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20,6 9,17 4,12"></polyline>
                        </svg>
                    </span>
                </label>

                <span class="todo-text">${this.escapeHtml(todo.text)}</span>

                <input
                    type="text"
                    class="edit-input"
                    value="${this.escapeHtml(todo.text)}"
                    onblur="todoApp.saveEdit('${todo.id}', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur(); if(event.key==='Escape') todoApp.cancelEdit()"
                >

                <div class="todo-actions">
                    <button class="action-btn edit-btn" onclick="todoApp.startEdit('${todo.id}')" title="Edit task">
                        ✎
                    </button>
                    <button class="action-btn delete-btn" onclick="todoApp.deleteTodo('${todo.id}')" title="Delete task">
                        ×
                    </button>
                </div>
            </li>
        `;
    }

    // Create empty state HTML
    createEmptyState() {
        const messages = {
            all: {
                title: 'No tasks yet',
                subtitle: 'Add your first task above to get started!'
            },
            pending: {
                title: 'All caught up!',
                subtitle: 'No active tasks remaining.'
            },
            completed: {
                title: 'No completed tasks',
                subtitle: 'Complete some tasks to see them here.'
            }
        };

        const message = messages[this.currentFilter];

        return `
            <li class="empty-state">
                <h3>${message.title}</h3>
                <p>${message.subtitle}</p>
            </li>
        `;
    }

    // Render the entire app
    render() {
        const filteredTodos = this.getFilteredTodos();
        const todoList = document.getElementById('todoList');

        if (filteredTodos.length === 0) {
            todoList.innerHTML = this.createEmptyState();
        } else {
            todoList.innerHTML = filteredTodos
                .map(todo => this.createTodoElement(todo))
                .join('');
        }

        this.updateStats();
    }

    // Update stats display
    updateStats() {
        const pendingCount = this.todos.filter(todo => !todo.completed).length;
        const completedCount = this.todos.filter(todo => todo.completed).length;

        const statsText = document.querySelector('.stats-text');
        const clearBtn = document.getElementById('clearCompleted');

        statsText.textContent = `${pendingCount} task${pendingCount !== 1 ? 's' : ''} remaining`;

        clearBtn.disabled = completedCount === 0;
        clearBtn.style.opacity = completedCount === 0 ? '0.5' : '1';
    }

    // Show temporary feedback message
    showFeedback(message) {
        // Remove any existing feedback
        const existingFeedback = document.querySelector('.feedback-message');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Create and show new feedback
        const feedback = document.createElement('div');
        feedback.className = 'feedback-message';
        feedback.textContent = message;
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            z-index: 1000;
            animation: slideInRight 0.3s ease-out;
            pointer-events: none;
        `;

        document.body.appendChild(feedback);

        // Remove after 3 seconds
        setTimeout(() => {
            feedback.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => feedback.remove(), 300);
        }, 3000);
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Save todos to localStorage
    saveTodos() {
        try {
            localStorage.setItem('todos', JSON.stringify(this.todos));
        } catch (error) {
            console.error('Failed to save todos:', error);
        }
    }

    // Load todos from localStorage
    loadTodos() {
        try {
            const saved = localStorage.getItem('todos');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Failed to load todos:', error);
            return [];
        }
    }

    // Export todos as JSON
    exportTodos() {
        const data = {
            todos: this.todos,
            exportedAt: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showFeedback('Todos exported successfully!');
    }

    // Import todos from JSON
    importTodos(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.todos && Array.isArray(data.todos)) {
                    this.todos = data.todos;
                    this.saveTodos();
                    this.render();
                    this.showFeedback('Todos imported successfully!');
                } else {
                    throw new Error('Invalid file format');
                }
            } catch (error) {
                alert('Failed to import todos. Please check the file format.');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);
    }
}

// Add CSS animations for feedback
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
let todoApp;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        todoApp = new TodoApp();
    });
} else {
    todoApp = new TodoApp();
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape key cancels editing
    if (e.key === 'Escape' && todoApp.editingId) {
        todoApp.cancelEdit();
    }

    // Ctrl/Cmd + Enter to add todo quickly
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const input = document.getElementById('todoInput');
        if (document.activeElement !== input) {
            input.focus();
        }
    }
});

// Export function for potential use
window.exportTodos = () => todoApp.exportTodos();