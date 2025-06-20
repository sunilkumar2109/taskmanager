// user-dashboard.js

// Import Firebase app, auth, db, and appId from firebase-config.js
import { app, auth, db, appId } from './firebase-config.js';
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
    updateDoc,
    addDoc,
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const sidebarLinks = document.querySelectorAll('.sidebar a');
const sections = document.querySelectorAll('.section');
const logoutBtn = document.getElementById('logoutBtn');
const tasksTableBody = document.querySelector('#tasksTable tbody'); // Specific to user tasks
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatPermissionNotice = document.getElementById('chat-permission-notice');

// Message box elements
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');

// Helper function to show messages to the user
function showMessage(msg) {
    if (messageBox && messageText) {
        messageText.textContent = msg;
        messageBox.style.display = 'block';
    } else {
        console.warn('Message box elements not found. Falling back to console log:', msg);
        console.log(msg);
    }
}

// Initialize the dashboard
initializeDashboard();

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

    // Set up logout button click listener
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Check Firebase authentication state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in. Fetch user data.
            const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                document.getElementById('usernameDisplay').textContent = userData.username || 'User';
                document.getElementById('userRoleDisplay').textContent = userData.role || 'User';

                // Display appropriate sections based on role
                if (userData.role === 'admin') {
                    // Admins see all sections, including admin-specific ones
                    document.getElementById('adminTasksLink').style.display = 'block';
                    document.getElementById('manageUsersLink').style.display = 'block';
                    document.getElementById('adminPanel').style.display = 'block'; // Ensure admin panel is visible
                    document.getElementById('userTasks').style.display = 'block';
                    document.getElementById('announcements').style.display = 'block';

                    // Admins can chat
                    document.getElementById('chat-form').style.display = 'flex'; // Show chat input
                    document.getElementById('chat-permission-notice').style.display = 'none'; // Hide notice
                } else {
                    // Regular users see only user-specific sections
                    document.getElementById('adminTasksLink').style.display = 'none';
                    document.getElementById('manageUsersLink').style.display = 'none';
                    document.getElementById('adminPanel').style.display = 'none';
                    document.getElementById('userTasks').style.display = 'block'; // Ensure user tasks are visible
                    document.getElementById('announcements').style.display = 'block';

                    // Check if user has chat permission
                    if (userData.canChat) {
                        document.getElementById('chat-form').style.display = 'flex'; // Show chat input
                        document.getElementById('chat-permission-notice').style.display = 'none'; // Hide notice
                    } else {
                        document.getElementById('chat-form').style.display = 'none'; // Hide chat input
                        document.getElementById('chat-permission-notice').style.display = 'block'; // Show notice
                    }
                }
                // Fetch and display tasks for the current user
                fetchAndDisplayTasks(user.uid);
                // Load chat messages
                loadChatMessages();
            } else {
                showMessage('User data not found.');
                // Default to regular user view if no specific role is found
                document.getElementById('adminTasksLink').style.display = 'none';
                document.getElementById('manageUsersLink').style.display = 'none';
                document.getElementById('adminPanel').style.display = 'none';
                document.getElementById('userTasks').style.display = 'block';
                document.getElementById('announcements').style.display = 'block';
                document.getElementById('chat-form').style.display = 'none'; // Hide chat input
                document.getElementById('chat-permission-notice').style.display = 'block'; // Show notice
            }
            // Show the default section after user data is loaded
            showSection('userTasks'); // Always start on user tasks section
        } else {
            // User is signed out. Redirect to login or show login UI.
            console.log('No user logged in on user-dashboard.html');
            window.location.href = 'index.html'; // Redirect to index.html (login/landing page)
        }
    });
}

// Function to show specific content sections and update active link
function showSection(sectionId) {
    sections.forEach(section => {
        section.style.display = 'none'; // Hide all sections
    });
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.style.display = 'block'; // Show the selected section
    }

    sidebarLinks.forEach(link => {
        link.classList.remove('active'); // Remove active class from all links
    });
    const activeLink = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.add('active'); // Add active class to the selected link
    }
}

// Function to fetch and display tasks for the current user
async function fetchAndDisplayTasks(userId) {
    if (!userId) {
        console.error("User ID is undefined. Cannot fetch tasks.");
        showMessage("Error: User not identified for fetching tasks.");
        return;
    }

    const tasksCollectionRef = collection(db, `artifacts/${appId}/public/data/tasks`);
    // Query tasks where 'assignedTo' field matches the current user's UID
    // Use onSnapshot for real-time updates
    onSnapshot(query(tasksCollectionRef, where("assignedTo", "==", userId)), (snapshot) => {
        tasksTableBody.innerHTML = ''; // Clear existing tasks
        if (snapshot.empty) {
            tasksTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">No tasks assigned to you yet.</td></tr>';
            return;
        }

        snapshot.docs.forEach(docSnapshot => {
            const task = docSnapshot.data();
            const taskId = docSnapshot.id;
            
            // Format deadline
            const deadline = task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A';
            
            // Determine priority tag class
            let priorityClass = '';
            if (task.priority === 'High') {
                priorityClass = 'priority-high';
            } else if (task.priority === 'Medium') {
                priorityClass = 'priority-medium';
            } else {
                priorityClass = 'priority-low';
            }

            const row = tasksTableBody.insertRow();
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${task.title}</td>
                <td class="px-6 py-4 whitespace-nowrap">${task.description}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="priority-tag ${priorityClass}">${task.priority}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${deadline}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="status-tag status-${task.status.toLowerCase().replace(' ', '-')}">${task.status}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900 mr-2" onclick="openEditTaskModal('${taskId}', '${task.title}', '${task.description}', '${task.priority}', '${task.deadline}', '${task.status}')">Edit</button>
                    <button class="text-red-600 hover:text-red-900" onclick="deleteTask('${taskId}')">Delete</button>
                </td>
            `;
        });
    }, (error) => {
        console.error("Error fetching tasks: ", error);
        showMessage("Failed to load your tasks.");
    });
}

// Function to handle opening the edit task modal (simplified for user dashboard)
// In a real app, this would populate a form with task data.
window.openEditTaskModal = (taskId, title, description, priority, deadline, status) => {
    // For a simplified user dashboard, you might show a direct confirmation or a simpler form
    // For now, let's just log the action and simulate an edit.
    console.log(`Editing task: ${taskId}, Title: ${title}`);
    showMessage(`Editing task "${title}". (Functionality to open edit form is typically here)`);
    // Example: You might open a modal here and populate it
    // document.getElementById('editTaskId').value = taskId;
    // document.getElementById('editTaskTitle').value = title;
    // ...
    // openModal('editTaskModal'); 
};


// Function to handle deleting a task (simplified for user dashboard)
window.deleteTask = async (taskId) => {
    if (confirm("Are you sure you want to delete this task?")) {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/public/data/tasks`, taskId));
            showMessage('Task deleted successfully!');
        } catch (error) {
            console.error('Error deleting task:', error);
            showMessage('Error deleting task. Please try again.');
        }
    }
};

// Function to handle chat message sending
if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const messageText = messageInput.value.trim();
        if (messageText) {
            const user = auth.currentUser;
            if (user) {
                try {
                    const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
                    const userDoc = await getDoc(userDocRef);
                    let username = 'Anonymous';
                    if (userDoc.exists() && userDoc.data().username) {
                        username = userDoc.data().username;
                    }

                    await addDoc(collection(db, `artifacts/${appId}/public/data/chatMessages`), {
                        senderId: user.uid,
                        senderEmail: user.email,
                        senderUsername: username, // Store username for display
                        text: messageText,
                        timestamp: serverTimestamp()
                    });
                    messageInput.value = ''; // Clear input field
                } catch (error) {
                    console.error('Error sending message:', error);
                    showMessage('Failed to send message.');
                }
            } else {
                showMessage('You must be logged in to send messages.');
            }
        }
    });
}

// Load and display chat messages in real-time
function loadChatMessages() {
    const chatMessagesCollection = collection(db, `artifacts/${appId}/public/data/chatMessages`);
    // Order by timestamp to display chronologically
    onSnapshot(query(chatMessagesCollection, orderBy('timestamp')), async (snapshot) => {
        chatMessagesContainer.innerHTML = ''; // Clear existing messages
        for (const docSnapshot of snapshot.docs) {
            const message = docSnapshot.data();
            const messageElement = document.createElement('div');
            messageElement.classList.add('chat-message');

            let senderName = message.senderUsername || (message.senderEmail ? message.senderEmail.split('@')[0] : 'N/A');

            // Fetch sender's role to determine if they are an admin
            if (message.senderId) {
                const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, message.senderId);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if(userData.role === 'admin') {
                         senderName = `Admin (${senderName})`; // Prefix admin messages
                    }
                }
            }

            messageElement.innerHTML = `
                <div class="sender">${senderName}</div>
                <div class="text">${message.text}</div>
            `;
            chatMessagesContainer.appendChild(messageElement);
        }
        // Scroll to the bottom of the chat messages container after rendering
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; 
    }, (error) => {
        console.error("Error loading chat messages:", error);
        showMessage('Failed to load chat messages.');
    });
}

// Handles user logout
async function handleLogout() {
    try {
        await signOut(auth); // Sign out from Firebase
        window.location.href = 'index.html'; // Redirect to login page
    } catch (error) {
        console.error('Error logging out:', error);
        showMessage('Error logging out. Please try again.');
    }
}
