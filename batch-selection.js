// Batch Selection and Delete Functions for Training Records
// This file contains functions for selecting and deleting multiple training sessions

// Global state for batch selection
let isEditMode = false;
let selectedSessions = new Set();

window.toggleEditMode = function() {
    isEditMode = !isEditMode;
    const sessionsContainer = document.getElementById('sessionsView');
    const batchActionBar = document.getElementById('batchActionBar');
    const editButton = document.getElementById('editButton');
    
    if (isEditMode) {
        // Enter edit mode
        sessionsContainer.classList.add('edit-mode');
        batchActionBar.style.display = 'flex';
        editButton.classList.add('active');
        
        // Add checkboxes to all session cards
        const sessionCards = document.querySelectorAll('.session-card');
        sessionCards.forEach((card, index) => {
            card.classList.add('selection-mode');
            
            // Add checkbox if it doesn't exist
            if (!card.querySelector('.session-checkbox')) {
                const checkbox = document.createElement('div');
                checkbox.className = 'session-checkbox';
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    toggleSessionSelection(index);
                };
                card.insertBefore(checkbox, card.firstChild);
            }
        });
    } else {
        // Exit edit mode
        sessionsContainer.classList.remove('edit-mode');
        batchActionBar.style.display = 'none';
        editButton.classList.remove('active');
        
        // Remove checkboxes and clear selections
        const sessionCards = document.querySelectorAll('.session-card');
        sessionCards.forEach(card => {
            card.classList.remove('selection-mode', 'selected');
            const checkbox = card.querySelector('.session-checkbox');
            if (checkbox) {
                checkbox.remove();
            }
        });
        
        // Clear selections
        selectedSessions.clear();
        updateBatchCount();
    }
};

window.toggleSessionSelection = function(index) {
    const sessionCard = document.querySelector(`.session-card[data-session-index="${index}"]`);
    
    if (selectedSessions.has(index)) {
        selectedSessions.delete(index);
        sessionCard.classList.remove('selected');
    } else {
        selectedSessions.add(index);
        sessionCard.classList.add('selected');
    }
    
    updateBatchCount();
};

window.selectAllSessions = function() {
    const sessionCards = document.querySelectorAll('.session-card');
    
    if (selectedSessions.size === sessionCards.length) {
        // If all selected, deselect all
        selectedSessions.clear();
        sessionCards.forEach(card => card.classList.remove('selected'));
    } else {
        // Select all
        sessionCards.forEach((card, index) => {
            selectedSessions.add(index);
            card.classList.add('selected');
        });
    }
    
    updateBatchCount();
};

window.cancelEditMode = function() {
    toggleEditMode();
};

window.deleteSelectedSessions = async function() {
    if (selectedSessions.size === 0) return;
    
    const count = selectedSessions.size;
    const confirmMessage = count === 1 
        ? '确定要删除这个训练记录吗？' 
        : `确定要删除 ${count} 个训练记录吗？`;
    
    if (!confirm(confirmMessage)) return;
    
    try {
        // Get state from app-navigation.js
        const state = window.state || {};
        const localSessions = state.localSessions || [];
        
        // Convert selected indices to session IDs
        const sessionsToDelete = Array.from(selectedSessions).map(index => localSessions[index]);
        
        // Delete all videos in selected sessions
        for (const session of sessionsToDelete) {
            if (session && session.shots) {
                for (const shot of session.shots) {
                    await window.deleteVideo(shot.id);
                }
            }
        }
        
        // Exit edit mode and reload sessions
        toggleEditMode();
        if (window.loadSessions) {
            await window.loadSessions();
        }
        
        // Show success message
        showToast(`成功删除 ${count} 个训练记录`);
    } catch (err) {
        console.error('Error deleting sessions:', err);
        showToast('删除训练记录时出错', 'error');
    }
};

function updateBatchCount() {
    const batchCount = document.getElementById('batchCount');
    const count = selectedSessions.size;
    batchCount.textContent = count === 0 
        ? '0 已选择' 
        : `${count} 已选择`;
}

// Show edit button when sessions are loaded
window.showEditButton = function() {
    const editButton = document.getElementById('editButton');
    const state = window.state || {};
    const localSessions = state.localSessions || [];
    
    if (localSessions.length > 0) {
        editButton.style.display = 'block';
    } else {
        editButton.style.display = 'none';
    }
};

// Toast notification function
function showToast(message, type = 'success') {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    // Set toast content and type
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    // Show toast
    toast.classList.add('show');
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Add toast styles if not already present
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--bg-secondary);
            color: var(--text-primary);
            padding: var(--space-md) var(--space-lg);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-lg);
            z-index: 9999;
            opacity: 0;
            transition: all 0.3s ease;
            font-size: var(--font-sm);
            font-weight: 500;
            max-width: 90%;
            text-align: center;
        }
        
        .toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        
        .toast.success {
            background: var(--success);
            color: white;
        }
        
        .toast.error {
            background: var(--error);
            color: white;
        }
    `;
    document.head.appendChild(style);
}