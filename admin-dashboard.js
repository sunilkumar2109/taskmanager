import { app, auth, db } from './firebase-config.js';
import { 
    getAuth, 
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    deleteDoc,
    addDoc,
    serverTimestamp,
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const sidebarLinks = document.querySelectorAll('.sidebar a');
const sections = document.querySelectorAll('.section');
const logoutBtn = document.getElementById('logoutBtn');
const formsTable = document.getElementById('formsTable');
const usersTable = document.getElementById('usersTable');
const logsContainer = document.getElementById('logsContainer');
// Chat DOM Elements
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const chatMessagesContainer = document.getElementById('chat-messages');

// Initialize
initializeDashboard();

// Initialize the dashboard
function initializeDashboard() {
    // Set up sidebar navigation
    sidebarLinks.forEach(link => {
        if (link.id !== 'logoutBtn') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.currentTarget.dataset.section;
                if (section) {
                    showSection(section);
                }
            });
        }
    });

    // Set up logout
    logoutBtn.addEventListener('click', handleLogout);

    // Setup chat form submission
    if(chatForm) {
        chatForm.addEventListener('submit', handleSendMessage);
    }

    // Check auth state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                alert('Access denied. Only admins can view this page.');
                window.location.href = 'index.html';
                return;
            }
            
            setupRealtimeListeners();
            loadChatMessages();
        } else {
            window.location.href = 'index.html';
        }
    });
}

// Show/hide sections
function showSection(sectionId) {
    sections.forEach(section => {
        section.style.display = section.id === sectionId ? 'block' : 'none';
    });
    sidebarLinks.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionId) {
            link.classList.add('active');
        }
    });
}

// ================= CHAT MANAGEMENT =================

async function handleSendMessage(e) {
    e.preventDefault();
    const messageText = messageInput.value.trim();
    const user = auth.currentUser;

    if (messageText === '' || !user) return;

    try {
        await addDoc(collection(db, 'chat'), {
            text: messageText,
            senderEmail: user.email,
            senderId: user.uid,
            timestamp: serverTimestamp()
        });
        messageInput.value = '';
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; 
    } catch (error) {
        console.error("Error sending message: ", error);
    }
}

function loadChatMessages() {
    const chatCollection = collection(db, 'chat');
    const q = query(chatCollection, orderBy('timestamp'));

    onSnapshot(q, (snapshot) => {
        if(!chatMessagesContainer) return;
        chatMessagesContainer.innerHTML = ''; 
        snapshot.forEach(async (doc) => {
            const message = doc.data();
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            
            let senderName = "User"; // Default
            if (message.senderId) {
                const userDocRef = doc(db, "users", message.senderId);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    senderName = userData.username || message.senderEmail.split('@')[0];
                    if(userData.role === 'admin') {
                         senderName = `Admin (${senderName})`;
                    }
                } else {
                     senderName = message.senderEmail.split('@')[0]; // Fallback
                }
            }

            messageElement.innerHTML = `
                <div class="sender">${senderName}</div>
                <div class="text">${message.text}</div>
            `;
            chatMessagesContainer.appendChild(messageElement);
        });
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; 
    });
}


// ================= FORM & USER MANAGEMENT =================

async function loadForms() {
    try {
        const formsRef = collection(db, 'forms');
        const q = query(formsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        if(!formsTable) return;
        formsTable.innerHTML = '';
        snapshot.forEach(doc => {
            const form = doc.data();
            addFormToTable(doc.id, form);
        });
    } catch (error) {
        console.error('Error loading forms:', error);
    }
}

function addFormToTable(formId, form) {
    if(!formsTable) return;
    const row = formsTable.insertRow();
    row.innerHTML = `
        <td>${form.name || 'N/A'}</td>
        <td><span class="status-badge status-${form.status}">${form.status}</span></td>
        <td>${form.createdBy || 'N/A'}</td>
        <td>${form.createdAt ? new Date(form.createdAt.seconds * 1000).toLocaleString() : 'N/A'}</td>
        <td class="form-actions">
            <button onclick="window.toggleFormStatus('${formId}', '${form.status}')">${form.status === 'active' ? 'Deactivate' : 'Activate'}</button>
            <button onclick="window.deleteForm('${formId}')">Delete</button>
        </td>
    `;
}

async function loadUsers() {
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        
        if(!usersTable) return;
        usersTable.innerHTML = '';
        snapshot.forEach(doc => {
            const user = doc.data();
            addUserToTable(doc.id, user);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function addUserToTable(userId, user) {
    if(!usersTable) return;
    const row = usersTable.insertRow();
    const chatPermissionCheckbox = `
        <input type="checkbox" onchange="window.toggleChatPermission('${userId}', this.checked)" ${user.canChat ? 'checked' : ''}>
    `;

    row.innerHTML = `
        <td>${user.username || 'N/A'}</td>
        <td>${user.email}</td>
        <td>
            <select onchange="window.changeUserRole('${userId}', this.value)">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
        </td>
        <td><span class="status-badge status-${user.status}">${user.status}</span></td>
        <td>${user.role === 'admin' ? 'N/A' : chatPermissionCheckbox}</td>
        <td class="user-actions">
            <button onclick="window.toggleUserStatus('${userId}', '${user.status}')">${user.status === 'active' ? 'Deactivate' : 'Activate'}</button>
            <button onclick="window.deleteUserAccount('${userId}')" class="delete-btn">Delete</button>
        </td>
    `;
}

function setupRealtimeListeners() {
    onSnapshot(collection(db, 'forms'), loadForms);
    onSnapshot(collection(db, 'users'), loadUsers);
    const logsQuery = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'));
    onSnapshot(logsQuery, (snapshot) => {
        if(!logsContainer) return;
        logsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            addLogToContainer(doc.data());
        });
    });
}

function addLogToContainer(log) {
    if(!logsContainer) return;
    const logDiv = document.createElement('div');
    logDiv.className = 'log-entry';
    logDiv.innerHTML = `
        <div class="log-time">${new Date(log.timestamp.seconds * 1000).toLocaleString()}</div>
        <div class="log-details">${log.details} by ${log.userId}</div>
    `;
    logsContainer.prepend(logDiv);
}

async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

// Make functions globally available
window.toggleChatPermission = async (userId, isAllowed) => {
    const userDocRef = doc(db, 'users', userId);
    try {
        await updateDoc(userDocRef, { canChat: isAllowed });
    } catch (error) {
        console.error("Error updating chat permission: ", error);
        alert('Failed to update chat permission.');
    }
};
window.toggleFormStatus = async (formId, currentStatus) => { /* ... existing code ... */ };
window.deleteForm = async (formId) => { /* ... existing code ... */ };
window.changeUserRole = async (userId, newRole) => { /* ... existing code ... */ };
window.toggleUserStatus = async (userId, currentStatus) => { /* ... existing code ... */ };
window.deleteUserAccount = async (userId) => { /* ... existing code ... */ };