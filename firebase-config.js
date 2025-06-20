// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCYF8V_BDf34UjEYAyDLLFs9cgb7IEjO7I", // Replace with your Firebase API Key
    authDomain: "taskmanager-b93e4.firebaseapp.com",
    projectId: "taskmanager-b93e4",
    storageBucket: "taskmanager-b93e4.firebasestorage.app",
    messagingSenderId: "613129920368",
    appId: "1:613129920368:web:6077e6ae85031c29f4b9b5",
    measurementId: "G-W5C4YSJSDZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
