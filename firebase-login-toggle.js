import { db, auth } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

class LoginHoursManager {
  constructor() {
    this.auth = auth;
    this.db = db;
    this.currentUser = null;
    this.currentSession = null;
    this.sessionTimer = null;
    this.autoLogoutTimer = null;

    this.init();
  }

  init() {
    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        this.currentUser = user;
        console.log("✅ Logged in:", user.email);

        const toggle = document.getElementById("loginToggle");
        const userRef = doc(this.db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (toggle) {
          // Load existing login status
          toggle.checked = userSnap.exists() && userSnap.data().loginStatus;

          // Listen for toggle changes
          toggle.addEventListener("change", async () => {
            const newStatus = toggle.checked;
            const data = {
              loginStatus: newStatus,
              lastUpdated: new Date(),
            };

            if (userSnap.exists()) {
              await updateDoc(userRef, data);
            } else {
              await setDoc(userRef, {
                loginStatus: newStatus,
                lastUpdated: new Date(),
                allowedHours: { start: "09:00", end: "18:00" }, // default
                autoLogoutMinutes: 480,
                createdAt: new Date(),
                email: user.email,
                isActive: newStatus,
                role: "user",
                uid: user.uid,
                username: user.displayName || "Unknown",
              });
            }

            console.log("🔁 Status updated:", newStatus);
          });
        }
        await this.loadUserProfile();
        await this.loadCurrentSession();
        this.setupRealtimeListeners();
      } else {
        console.log("⚠️ User not signed in.");
      }
    });
  }
  async loadUserProfile() {
    try {
      const userRef = doc(this.db, "users", this.currentUser.uid); // ✅ use doc()
      const userSnap = await getDoc(userRef); // ✅ use getDoc()

      if (userSnap.exists()) {
        this.userProfile = userSnap.data();
        this.updateAllowedHoursDisplay();
        this.checkAdminAccess();
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
    }
  }

  async loadCurrentSession() {
    try {
      const sessionsRef = collection(this.db, "loginSessions"); // ✅ get collection ref

      const q = query(
        sessionsRef,
        where("userId", "==", this.currentUser.uid),
        where("status", "==", "active"),
        orderBy("startTime", "desc"),
        limit(1)
      ); // ✅ build query

      const snapshot = await getDocs(q); // ✅ get docs from query

      const toggle = document.getElementById("loginToggle");

      if (!snapshot.empty) {
        this.currentSession = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
        };
        this.updateUIForActiveSession();
        this.startTimer();
        this.setupAutoLogout();
        if (toggle) toggle.checked = true;
      } else {
        this.updateUIForInactiveSession();
        console.log("⛔ No active session found in Firestore");

        if (toggle) {
          const rememberedStatus =
            localStorage.getItem("loginStatus") === "true";
          toggle.checked = rememberedStatus;
        }
      }
    } catch (error) {
      console.error("Error loading current session:", error);
    }
  }

  setupRealtimeListeners() {
    const toggle = document.getElementById("loginToggle");

    const sessionsRef = collection(this.db, "loginSessions");
    const q = query(
      sessionsRef,
      where("userId", "==", this.currentUser.uid),
      orderBy("startTime", "desc"),
      limit(1)
    );

    onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latestSession = snapshot.docs[0].data();
        const sessionId = snapshot.docs[0].id;

        if (latestSession.status === "active" && !this.currentSession) {
          toggle.checked = true;
          this.currentSession = {
            id: sessionId,
            ...latestSession,
          };
          this.updateUIForActiveSession();
          this.startTimer();
          this.setupAutoLogout();
        } else if (
          latestSession.status !== "active" &&
          this.currentSession &&
          this.currentSession.id === sessionId
        ) {
          // Only clear session if explicitly logged out
          // Do not turn off toggle unless session is ended manually
          this.endSessionCleanup();
        }
      }
    });
  }

  async toggleSession() {
    const toggle = document.getElementById("loginToggle");
    const container = document.querySelector(".login-toggle-container");

    container.classList.add("loading");

    try {
      if (!this.userProfile) {
        const userRef = doc(this.db, "users", this.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          this.userProfile = userSnap.data();
        } else {
          throw new Error("User profile not found");
        }
      }

      if (toggle.checked) {
        await this.startSession();
      } else {
        await this.endSession();
      }
    } catch (error) {
      console.error("Error toggling session:", error);
      this.showError(error.message || "Failed to toggle session.");
    } finally {
      container.classList.remove("loading");
    }
  }

  async startSession() {
    console.log("🔥 startSession() called");

    if (!this.isWithinAllowedHours() && this.userProfile.role !== "admin") {
      console.warn("⛔ Not within allowed hours");
      return;
    }

    if (this.currentSession) {
      console.warn("⚠️ Session already active");
      return;
    }

    const localStartTime = new Date();
    const role = this.userProfile?.role || "user";
    const sessionData = {
      userId: this.currentUser.uid,
      startTime: serverTimestamp(),
      endTime: null,
      duration: 0,
      status: "active",
      toggledBy: this.currentUser.uid,
      toggledByRole: role,
      deviceInfo: this.getDeviceInfo(),
      ipAddress: await this.getIPAddress(),
      adminNotes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log("📦 Prepared sessionData:", sessionData);

    try {
      const sessionRef = await addDoc(
        collection(this.db, "loginSessions"),
        sessionData
      );
      console.log("✅ Session saved to Firestore:", sessionRef.id);

      await updateDoc(doc(this.db, "users", this.currentUser.uid), {
        isActive: true,
        loginStatus: true,
        lastActiveAt: serverTimestamp(),
      });

      this.currentSession = {
        id: sessionRef.id,
        ...sessionData,
        startTime: localStartTime,
      };

      this.updateUIForActiveSession();
      this.startTimer();
      this.setupAutoLogout();
      localStorage.setItem("loginStatus", "true"); // ✅ Remember toggle ON
    } catch (e) {
      console.error("🔥 Firestore session creation failed:", e);
      this.showError(e.message);
    }
  }
  logoutCleanup() {
    this.stopTimer();
    this.clearAutoLogout();
    this.updateUIForInactiveSession();
    localStorage.removeItem("loginStatus"); // Clear toggle state
  }

  async endSession(isAdminAction = false, adminNotes = "") {
    if (!this.currentSession) {
      throw new Error("No active session to end");
    }

    const endTime = new Date();
    const duration = Math.floor(
      (endTime - this.currentSession.startTime) / (1000 * 60)
    ); // in minutes

    await updateDoc(doc(this.db, "loginSessions", this.currentSession.id), {
      endTime: serverTimestamp(),
      duration: duration,
      status: isAdminAction ? "admin_ended" : "completed",
      adminNotes: adminNotes,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(this.db, "users", this.currentUser.uid), {
      isActive: false,
      lastActiveAt: serverTimestamp(),
    });

    this.endSessionCleanup();
  }

  endSessionCleanup() {
    this.currentSession = null;
    this.updateUIForInactiveSession();
    this.stopTimer();
    this.clearAutoLogout();

    localStorage.removeItem("loginStatus"); // ✅ Clear remembered toggle
  }

  isWithinAllowedHours() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

    const allowedStart = this.parseTime(
      this.userProfile.allowedHours?.start || "09:00"
    );
    const allowedEnd = this.parseTime(
      this.userProfile.allowedHours?.end || "18:00"
    );

    return currentTime >= allowedStart && currentTime <= allowedEnd;
  }

  parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  setupAutoLogout() {
    const autoLogoutMinutes = this.userProfile.autoLogoutMinutes || 480; // 8 hours default
    this.autoLogoutTimer = setTimeout(() => {
      this.endSession().then(() => {
        this.showNotification("Auto-logged out after maximum session time");
      });
    }, autoLogoutMinutes * 60 * 1000);
  }

  clearAutoLogout() {
    if (this.autoLogoutTimer) {
      clearTimeout(this.autoLogoutTimer);
      this.autoLogoutTimer = null;
    }
  }

  startTimer() {
    if (!this.currentSession || !this.currentSession.startTime) return;

    this.stopTimer(); // Prevent multiple intervals

    let startTime = this.currentSession.startTime;

    if (typeof startTime.toDate === "function") {
      startTime = startTime.toDate(); // Firestore Timestamp
    }

    this.sessionTimer = setInterval(() => {
      const now = new Date();
      const diff = now - startTime;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const timerEl = document.getElementById("sessionTimer");
      const durationEl = document.getElementById("sessionDuration");

      if (timerEl) {
        timerEl.textContent = `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      }

      if (durationEl) {
        durationEl.textContent = `${Math.floor(diff / (1000 * 60))} min`;
      }
    }, 1000);
  }

  stopTimer() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  updateUIForActiveSession() {
    const statusBadge = document.getElementById("statusBadge");
    const sessionStart = document.getElementById("sessionStart");
    const toggle = document.getElementById("loginToggle");

    statusBadge.textContent = "Active";
    statusBadge.className = "status-badge active";

    const startTime =
      this.currentSession.startTime instanceof Date
        ? this.currentSession.startTime
        : this.currentSession.startTime.toDate();
    sessionStart.textContent = startTime.toLocaleTimeString();

    toggle.checked = true;
  }

  updateUIForInactiveSession() {
  const toggle = document.getElementById("loginToggle");
  const statusBadge = document.getElementById("statusBadge");
  const timerDisplay = document.getElementById("timerDisplay");

  if (toggle) toggle.checked = false;

  if (statusBadge) {
    statusBadge.textContent = "Inactive";
    statusBadge.className = "badge inactive";
  } else {
    console.warn("⚠️ statusBadge element not found in DOM.");
  }

  if (timerDisplay) {
    timerDisplay.textContent = "00:00:00";
  } else {
    console.warn("⚠️ timerDisplay element not found in DOM.");
  }
}


  updateAllowedHoursDisplay() {
    const allowedHours = document.getElementById("allowedHours");
    const autoLogout = document.getElementById("autoLogout");

    if (this.userProfile.allowedHours) {
      allowedHours.textContent = `${this.userProfile.allowedHours.start} - ${this.userProfile.allowedHours.end}`;
    }

    const hours = Math.floor((this.userProfile.autoLogoutMinutes || 480) / 60);
    autoLogout.textContent = `${hours} hours`;
  }

  checkAdminAccess() {
    const adminControls = document.getElementById("adminControls");
    if (this.userProfile.role === "admin") {
      adminControls.style.display = "block";
      this.loadAdminFunctions();
    }
  }

  loadAdminFunctions() {
    // Admin override functions will be implemented here
    window.adminOverride = async (action) => {
      const notes = document.getElementById("adminNotes").value;

      if (action === "toggle") {
        if (this.currentSession) {
          await this.endSession(true, notes);
        } else {
          await this.adminStartSession(this.currentUser.uid, notes);
        }
      } else if (action === "extend") {
        await this.extendSession(notes);
      }

      document.getElementById("adminNotes").value = "";
    };

    window.showUsersList = () => {
      this.showAdminUsersList();
    };
  }

  async adminStartSession(userId, notes) {
    const sessionData = {
      userId: userId,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      endTime: null,
      duration: 0,
      status: "active",
      toggledBy: this.currentUser.uid,
      toggledByRole: "admin",
      deviceInfo: "Admin Override",
      ipAddress: await this.getIPAddress(),
      adminNotes: notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await this.db.collection("loginSessions").add(sessionData);
    await this.db.collection("users").doc(userId).update({
      isActive: true,
      lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    this.logAdminAction("toggle_on", userId, notes);
  }

  async extendSession(notes) {
    if (!this.currentSession) return;

    this.clearAutoLogout();
    const extendedMinutes = (this.userProfile.autoLogoutMinutes || 480) + 240; // Add 4 more hours
    this.setupAutoLogout();

    await this.db
      .collection("loginSessions")
      .doc(this.currentSession.id)
      .update({
        adminNotes: notes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    this.logAdminAction("extend_session", this.currentUser.uid, notes);
  }

  async logAdminAction(action, targetUserId, reason) {
    await this.db.collection("adminActions").add({
      adminId: this.currentUser.uid,
      targetUserId: targetUserId,
      action: action,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      reason: reason,
      previousState: {
        /* snapshot of previous state */
      },
      newState: {
        /* snapshot of new state */
      },
    });
  }

  showAdminUsersList() {
    // This would open a modal or navigate to a page showing all users
    // and their current login status for admin management
    console.log("Opening admin users management panel...");
  }

  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    let browser = "Unknown";
    let os = "Unknown";

    // Detect browser
    if (userAgent.includes("Chrome")) browser = "Chrome";
    else if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Safari")) browser = "Safari";
    else if (userAgent.includes("Edge")) browser = "Edge";

    // Detect OS
    if (userAgent.includes("Windows")) os = "Windows";
    else if (userAgent.includes("Mac")) os = "macOS";
    else if (userAgent.includes("Linux")) os = "Linux";
    else if (userAgent.includes("Android")) os = "Android";
    else if (userAgent.includes("iOS")) os = "iOS";

    return `${browser} on ${os}`;
  }

  async getIPAddress() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("Error getting IP address:", error);
      return "Unknown";
    }
  }

  showError(message) {
    // Create a simple toast notification
    const toast = document.createElement("div");
    toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      document.body.removeChild(toast);
    }, 5000);
  }

  showNotification(message) {
    // Create a simple toast notification
    const toast = document.createElement("div");
    toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      document.body.removeChild(toast);
    }, 3000);
  }

  cleanup() {
    this.stopTimer();
    this.clearAutoLogout();
    this.currentSession = null;
    this.userProfile = null;
  }

  // Public method to get session history
  async getSessionHistory(limit = 10) {
    try {
      const sessions = await this.db
        .collection("loginSessions")
        .where("userId", "==", this.currentUser.uid)
        .orderBy("startTime", "desc")
        .limit(limit)
        .get();

      return sessions.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("Error getting session history:", error);
      return [];
    }
  }

  // Public method for admins to get all users' status
  async getAllUsersStatus() {
    if (!this.userProfile || this.userProfile.role !== "admin") {
      throw new Error("Admin access required");
    }

    try {
      const users = await this.db.collection("users").get();
      const usersWithStatus = [];

      for (const userDoc of users.docs) {
        const userData = userDoc.data();

        // Get latest session for each user
        const latestSession = await this.db
          .collection("loginSessions")
          .where("userId", "==", userDoc.id)
          .orderBy("startTime", "desc")
          .limit(1)
          .get();

        usersWithStatus.push({
          id: userDoc.id,
          ...userData,
          latestSession: latestSession.empty
            ? null
            : latestSession.docs[0].data(),
        });
      }

      return usersWithStatus;
    } catch (error) {
      console.error("Error getting all users status:", error);
      return [];
    }
  }
}

// Initialize the Login Hours Manager
let loginHoursManager;

// Add event listener to the toggle
const toggle = document.getElementById("loginToggle");
if (toggle && !toggle.dataset.bound) {
  toggle.addEventListener("change", function () {
    loginHoursManager.toggleSession();
  });
  toggle.dataset.bound = "true"; // ✅ Prevent multiple bindings
}

// Add event listener to the logout button
const logoutButton = document.getElementById("logoutButton");
if (logoutButton && !logoutButton.dataset.bound) {
  logoutButton.addEventListener("click", function () {
    loginHoursManager.logout();
  });
  logoutButton.dataset.bound = "true"; // ✅ Prevent multiple bindings
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = LoginHoursManager;
}
window.addEventListener("DOMContentLoaded", () => {
  window.loginHoursManager = new LoginHoursManager();
});
export { LoginHoursManager };
