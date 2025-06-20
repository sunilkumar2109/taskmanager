import { app, auth, db } from './firebase-config.js';
import {
    getAuth,
    signInWithEmailAndPassword,
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
    addDoc,
    serverTimestamp,
    onSnapshot,
    Timestamp // Import Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const authSection = document.getElementById('authSection');
const adminSection = document.getElementById('adminSection');
const loginBtn = document.getElementById('loginBtn');
const adminEmail = document.getElementById('adminEmail');
const adminPassword = document.getElementById('adminPassword');
const authMessage = document.getElementById('authMessage');
const refreshBtn = document.getElementById('refreshBtn');
const usersTable = document.getElementById('usersTable').getElementsByTagName('tbody')[0];
const logsContainer = document.getElementById('logsContainer');

// Modal elements
const settingsModal = document.getElementById('settingsModal');
const modalCloseBtn = document.querySelector('.close');
const modalUserName = document.getElementById('modalUserName');
const allowedHours = document.getElementById('allowedHours');
const customHoursGroup = document.getElementById('customHoursGroup');
const customStartTime = document.getElementById('customStartTime');
const customEndTime = document.getElementById('customEndTime');
const sessionDuration = document.getElementById('sessionDuration');
const autoLogout = document.getElementById('autoLogout');
const adminNote = document.getElementById('adminNote');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsMessage = document.getElementById('settingsMessage');

// Task modal elements
const taskModal = document.getElementById('taskModal');
const taskUserName = document.getElementById('taskUserName');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskPointsAdmin = document.getElementById('taskPointsAdmin'); // New: Points input for admin
const taskLocked = document.getElementById('taskLocked');
const assignTaskBtn = document.getElementById('assignTaskBtn');
const taskMessage = document.getElementById('taskMessage');
const taskCloseBtn = document.querySelector('.close-task');

// MODIFICATION START: Added elements for lock timer
const lockTimeGroup = document.getElementById('lockTimeGroup');
const lockUntilTime = document.getElementById('lockUntilTime');
// MODIFICATION END

// Current selected user for settings and tasks
let currentUser = null;
let selectedTaskUserId = null;

// Admin credentials (in a real app, these would be validated against your database)
const ADMIN_EMAILS = ['admin@taskmanager.com']; // Add your admin emails here

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check auth state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            authSection.style.display = 'none';
            adminSection.style.display = 'block';
            loadUsers();
            setupRealtimeListeners();
        } else {
            authSection.style.display = 'block';
            adminSection.style.display = 'none';
        }
    });

    // Event listeners
    loginBtn.addEventListener('click', handleAdminLogin);
    refreshBtn.addEventListener('click', loadUsers);

    // Modal events
    modalCloseBtn.addEventListener('click', () => settingsModal.style.display = 'none');
    taskCloseBtn.addEventListener('click', () => taskModal.style.display = 'none');

    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
        if (event.target === taskModal) {
            taskModal.style.display = 'none';
        }
    });

    allowedHours.addEventListener('change', (e) => {
        customHoursGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    saveSettingsBtn.addEventListener('click', saveUserSettings);
    assignTaskBtn.addEventListener('click', submitTaskToFirestore);

    // MODIFICATION START: Event listener for the lock toggle
    taskLocked.addEventListener('change', (e) => {
        lockTimeGroup.style.display = e.target.checked ? 'block' : 'none';
    });
    // MODIFICATION END
});

// Handle admin login
async function handleAdminLogin() {
    const email = adminEmail.value;
    const password = adminPassword.value;

    if (!email || !password) {
        authMessage.textContent = 'Please enter both email and password';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        authMessage.textContent = '';
    } catch (error) {
        console.error('Login error:', error);
        authMessage.textContent = 'Login failed. Please check your credentials.';
    }
}

// Load users from Firestore
async function loadUsers() {
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);

        usersTable.innerHTML = ''; // Clear existing rows

        if (querySnapshot.empty) {
            console.log("No users found in collection");
            return;
        }

        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            addUserToTable(doc.id, userData);
        });

        await loadLogs();

    } catch (error) {
        console.error('Full error loading users:', error);
        alert(`Failed to load users: ${error.message}`);
    }
}

// Add user to the table
function addUserToTable(userId, userData) {
    const row = usersTable.insertRow();
    row.insertCell(0).textContent = userId;
    row.insertCell(1).textContent = userData.email || 'N/A';
    
    const cellStatus = row.insertCell(2);
    const statusSpan = document.createElement('span');
    statusSpan.textContent = userData.isLoggedIn ? 'ON' : 'OFF';
    statusSpan.className = userData.isLoggedIn ? 'status-on' : 'status-off';
    cellStatus.appendChild(statusSpan);

    const cellLastActive = row.insertCell(3);
    cellLastActive.textContent = userData.lastActivity ? userData.lastActivity.toDate().toLocaleString() : 'N/A';

    const cellActions = row.insertCell(4);
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = userData.isLoggedIn ? 'Force OFF' : 'Force ON';
    toggleBtn.className = userData.isLoggedIn ? 'toggle-off' : 'toggle-on';
    toggleBtn.addEventListener('click', () => toggleUserStatus(userId, !userData.isLoggedIn));
    cellActions.appendChild(toggleBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = 'Settings';
    settingsBtn.className = 'settings';
    settingsBtn.addEventListener('click', () => openSettingsModal(userId, userData));
    cellActions.appendChild(settingsBtn);

    const taskBtn = document.createElement('button');
    taskBtn.textContent = 'Add Task';
    taskBtn.className = 'settings';
    taskBtn.addEventListener('click', () => openTaskModal(userId, userData.email));
    cellActions.appendChild(taskBtn);
}


// Toggle user status
async function toggleUserStatus(userId, newStatus) {
    if (!confirm(`Are you sure you want to ${newStatus ? 'FORCE LOGIN' : 'FORCE LOGOUT'} this user?`)) {
        return;
    }
    
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            isLoggedIn: newStatus,
            lastActivity: serverTimestamp(),
            lastUpdatedBy: 'admin',
            lastUpdateTime: serverTimestamp()
        });
        
        await addLogEntry(userId, newStatus ? 'admin_force_login' : 'admin_force_logout', `Admin manually ${newStatus ? 'logged in' : 'logged out'} user`);
        loadUsers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        alert('Failed to update user status. Please try again.');
    }
}

// Open settings modal
function openSettingsModal(userId, userData) {
    currentUser = { id: userId, ...userData };
    modalUserName.textContent = userData.email || userId;
    
    if (userData.settings) {
        const settings = userData.settings;
        allowedHours.value = settings.allowedHours || 'any';
        sessionDuration.value = settings.sessionDuration || 8;
        autoLogout.value = settings.autoLogout || 'enabled';
        adminNote.value = settings.adminNote || '';
        if (settings.customStartTime && settings.customEndTime) {
            customStartTime.value = settings.customStartTime;
            customEndTime.value = settings.customEndTime;
        }
    } else {
        allowedHours.value = 'any';
        sessionDuration.value = 8;
        autoLogout.value = 'enabled';
        adminNote.value = '';
    }
    
    customHoursGroup.style.display = allowedHours.value === 'custom' ? 'block' : 'none';
    settingsModal.style.display = 'block';
}

// Save user settings
async function saveUserSettings() {
    if (!currentUser) return;
    
    const settings = {
        allowedHours: allowedHours.value,
        sessionDuration: parseInt(sessionDuration.value),
        autoLogout: autoLogout.value,
        adminNote: adminNote.value,
        lastUpdated: serverTimestamp()
    };
    
    if (allowedHours.value === 'custom') {
        settings.customStartTime = customStartTime.value;
        settings.customEndTime = customEndTime.value;
    }
    
    try {
        const userRef = doc(db, 'users', currentUser.id);
        await updateDoc(userRef, { settings: settings });
        await addLogEntry(currentUser.id, 'admin_settings_update', `Admin updated user settings.`);
        
        settingsMessage.textContent = 'Settings saved successfully!';
        setTimeout(() => {
            settingsMessage.textContent = '';
            settingsModal.style.display = 'none';
            loadUsers();
        }, 1500);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        settingsMessage.textContent = 'Failed to save settings. Please try again.';
    }
}


// Open task assignment modal
function openTaskModal(userId, userEmail) {
    selectedTaskUserId = userId;
    taskUserName.textContent = userEmail || userId;
    taskTitle.value = '';
    taskDescription.value = '';
    taskPointsAdmin.value = '10'; // Set default points for admin
    taskLocked.checked = false; // Default to unlocked
    lockTimeGroup.style.display = 'none'; // Hide timer by default
    lockUntilTime.value = '';
    taskMessage.textContent = '';
    taskModal.style.display = 'block';
}


// MODIFICATION START: Rewritten function to save to 'forms' collection
async function submitTaskToFirestore() {
    if (!selectedTaskUserId) return;

    const title = taskTitle.value.trim();
    const description = taskDescription.value.trim();
    const points = parseInt(taskPointsAdmin.value) || 0; // Get points value
    const isLocked = taskLocked.checked;
    const lockTime = lockUntilTime.value;

    if (!title) {
        taskMessage.textContent = 'Task title is required';
        return;
    }

    if (isLocked && !lockTime) {
        taskMessage.textContent = 'Please select a lock-until time.';
        return;
    }

    try {
        // Saving to the main 'forms' collection now
        const formsRef = collection(db, 'forms');
        
        const taskData = {
            title,
            description,
            points: points, // Include points here
            assignedTo: selectedTaskUserId,
            isLocked: isLocked,
            lockUntil: isLocked ? Timestamp.fromDate(new Date(lockTime)) : null,
            status: 'pending',
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser.email
        };

        await addDoc(formsRef, taskData);

        taskMessage.style.color = 'green';
        taskMessage.textContent = '✅ Task assigned successfully';
        setTimeout(() => {
            taskModal.style.display = 'none';
        }, 1200);

        await addLogEntry(selectedTaskUserId, 'admin_task_assigned', `Assigned task "${title}" (Points: ${points}, locked: ${isLocked})`);

    } catch (error) {
        console.error('Error assigning task:', error);
        taskMessage.style.color = 'red';
        taskMessage.textContent = '❌ Failed to assign task';
    }
}
// MODIFICATION END

// Load activity logs
async function loadLogs() {
    try {
        const logsRef = collection(db, 'activityLogs');
        const q = query(logsRef, where('userId', '!=', ''));
        const querySnapshot = await getDocs(q);
        
        logsContainer.innerHTML = '';
        
        const logs = [];
        querySnapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        
        logs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        
        logs.forEach(log => {
            addLogToContainer(log);
        });
        
    } catch (error) {
        console.error('Error loading logs:', error);
        alert('Failed to load activity logs. Please try again.');
    }
}

// Add log entry to Firestore
async function addLogEntry(userId, actionType, details = '') {
    try {
        const logsRef = collection(db, 'activityLogs');
        await addDoc(logsRef, {
            userId: userId,
            actionType: actionType,
            details: details,
            timestamp: serverTimestamp(),
            performedBy: 'admin',
        });
    } catch (error) {
        console.error('Error adding log entry:', error);
    }
}


// Add log to the UI container
function addLogToContainer(log) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const timestamp = log.timestamp ? log.timestamp.toDate().toLocaleString() : 'N/A';
    const performedBy = log.performedBy === 'admin' ? 
        `<span class="log-admin">Admin</span>` : 
        `<span class="log-user">User</span>`;
    
    let actionText = log.actionType.replace(/_/g, ' ');
    
    logEntry.innerHTML = `
        <div>
            ${performedBy} - <strong>${actionText}</strong> for user ${log.userId}
            <span class="log-time">(${timestamp})</span>
        </div>
        ${log.details ? `<div class="log-note">Details: ${log.details}</div>` : ''}
    `;
    
    // Prepend new logs to the top
    logsContainer.insertBefore(logEntry, logsContainer.firstChild);
}


// Set up realtime listeners
function setupRealtimeListeners() {
    const usersRef = collection(db, 'users');
    onSnapshot(usersRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const rows = usersTable.getElementsByTagName('tr');
                for (let row of rows) {
                    if (row.cells[0].textContent === change.doc.id) {
                        const userData = change.doc.data();
                        const statusSpan = row.cells[2].getElementsByTagName('span')[0];
                        statusSpan.textContent = userData.isLoggedIn ? 'ON' : 'OFF';
                        statusSpan.className = userData.isLoggedIn ? 'status-on' : 'status-off';
                        if (userData.lastActivity) {
                            row.cells[3].textContent = userData.lastActivity.toDate().toLocaleString();
                        }
                        const toggleBtn = row.cells[4].getElementsByTagName('button')[0];
                        toggleBtn.textContent = userData.isLoggedIn ? 'Force OFF' : 'Force ON';
                        toggleBtn.className = userData.isLoggedIn ? 'toggle-off' : 'toggle-on';
                    }
                }
            }
        });
    });
    
    const logsRef = collection(db, 'activityLogs');
    const logsQuery = query(logsRef, where('userId', '!=', ''));
    onSnapshot(logsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const log = { id: change.doc.id, ...change.doc.data() };
                addLogToContainer(log);
            }
        });
    });
}
