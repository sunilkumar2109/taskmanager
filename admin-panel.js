import { db } from './firebase-config.js';

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

console.log("📦 DB inside admin-panel.js:", db); // confirm working

 // pass the Firebase app instance here
const usersCollection = collection(db, "users");

let users = [];
let filteredUsers = [];

const usersCol = collection(db, "users");
const sessionsCol = collection(db, "loginSessions");

function listenForUsers() {
   onSnapshot(usersCol, (snapshot) => {
    console.log("Users snapshot received:", snapshot.size);
    users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("Users data:", users);
    filteredUsers = [...users];
    updateStats();
    renderUsers();
  }, (error) => {
    console.error("Error listening for users:", error);
  });
}

function updateStats() {
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  getDocs(query(sessionsCol, where("startTime", ">=", startOfDay))).then(snapshot => {
    let totalMinutes = 0;
    snapshot.forEach(doc => {
      totalMinutes += doc.data().duration || 0;
    });
    document.getElementById("totalUsers").textContent = totalUsers;
    document.getElementById("activeUsers").textContent = activeUsers;
    document.getElementById("todayHours").textContent = Math.round(totalMinutes / 60);
    document.getElementById("avgSession").textContent = totalUsers > 0 ? Math.round(totalMinutes / totalUsers) : 0;
  });
}
document.querySelector('.bulk-btn.refresh').addEventListener('click', refreshData);
document.querySelector('.bulk-btn.export').addEventListener('click', exportData);
document.querySelector('.bulk-btn.settings').addEventListener('click', showSettings);


function renderUsers() {
  const grid = document.getElementById("usersGrid");
  grid.innerHTML = "";
  filteredUsers.forEach(user => {
    const card = document.createElement("div");
    card.className = `user-card ${user.isActive ? "active" : "inactive"}`;
    card.innerHTML = `
      <div class="user-header">
        <div class="user-info">
          <div class="user-name">${user.username || "Unnamed"}</div>
          <div class="user-email">${user.email}</div>
          <div class="user-status">
            <div class="status-dot ${user.isActive ? "active" : "inactive"}"></div>
            <span>${user.isActive ? "Working" : "Offline"}</span>
            <span style="margin-left: 10px; font-size: 0.8rem; color: #718096;">
              ${user.role?.toUpperCase()}
            </span>
          </div>
        </div>
        <div class="user-actions">
          <button class="action-btn toggle-btn" onclick="toggleSession('${user.id}', ${user.isActive})">
            ${user.isActive ? "End Session" : "Start Session"}
          </button>
          ${user.isActive ? `<button class="action-btn extend-btn" onclick="extendSession('${user.id}')">Extend</button>` : ""}
          <button class="action-btn history-btn" onclick="showHistory('${user.id}', '${user.username || "User"}')">History</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Expose required functions globally
window.refreshData = () => listenForUsers();
window.exportData = () => alert("Export feature not implemented yet.");
window.showSettings = () => alert("Settings panel placeholder");

window.toggleSession = async (userId, isActive) => {
  const userRef = doc(db, "users", userId);
  const now = new Date();

  if (!isActive) {
    await addDoc(sessionsCol, {
      userId,
      status: "active",
      startTime: now,
      endTime: now,
      duration: 0,
      toggledBy: "admin",
      toggledByRole: "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminNotes: ""
    });
    await updateDoc(userRef, { isActive: true });
  } else {
    const activeSession = await getDocs(query(sessionsCol, where("userId", "==", userId), where("status", "==", "active")));
    activeSession.forEach(async (docSnap) => {
      const data = docSnap.data();
      const end = new Date();
      const duration = Math.floor((end - data.startTime.toDate()) / 60000);
      await updateDoc(doc(db, "loginSessions", docSnap.id), {
        endTime: end,
        duration,
        status: "completed",
        updatedAt: serverTimestamp()
      });
    });
    await updateDoc(userRef, { isActive: false });
  }
};

window.extendSession = async (userId) => {
  const sessions = await getDocs(query(sessionsCol, where("userId", "==", userId), where("status", "==", "active")));
  sessions.forEach(async (docSnap) => {
    await updateDoc(doc(db, "loginSessions", docSnap.id), {
      adminNotes: "Extended by admin",
      updatedAt: serverTimestamp()
    });
  });
};

window.showHistory = async (userId, name) => {
  const modal = document.getElementById("historyModal");
  const content = document.getElementById("historyContent");
  const q = query(sessionsCol, where("userId", "==", userId), orderBy("startTime", "desc"));
  const snapshot = await getDocs(q);
  let html = `<h4>Session History for ${name}</h4><div style="margin-top: 20px;">`;
  snapshot.forEach(docSnap => {
    const d = docSnap.data();
    const start = d.startTime?.toDate().toLocaleTimeString() || "--";
    const end = d.endTime?.toDate().toLocaleTimeString() || "--";
    html += `
      <div style="padding: 10px; border-left: 3px solid #4299e1; margin-bottom: 10px; background: #f7fafc;">
        <strong>${start} - ${end}</strong><br>
        <small>Status: ${d.status} | Notes: ${d.adminNotes || "N/A"}</small>
      </div>
    `;
  });
  html += "</div>";
  content.innerHTML = html;
  modal.style.display = "flex";
};

window.closeModal = () => {
  document.getElementById("historyModal").style.display = "none";
};

window.addEventListener("DOMContentLoaded", () => {
  listenForUsers();
  document.getElementById("searchInput").addEventListener("input", filterUsers);
  document.getElementById("statusFilter").addEventListener("change", filterUsers);
  document.getElementById("roleFilter").addEventListener("change", filterUsers);
});

function filterUsers() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const role = document.getElementById("roleFilter").value;

  filteredUsers = users.filter(u => {
    const matchSearch = u.username?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search);
    const matchStatus = status === "all" || (status === "active" && u.isActive) || (status === "inactive" && !u.isActive);
    const matchRole = role === "all" || u.role === role;
    return matchSearch && matchStatus && matchRole;
  });

  renderUsers();
}
