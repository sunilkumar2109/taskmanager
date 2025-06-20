import { auth, db } from './firebase-config.js';  
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  setDoc,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

  // AUTH STATE LISTENER
  onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
      console.log("User is signed in and verified:", user.email);
      // You can add additional logic here for auto-redirect if needed
    } else if (user && !user.emailVerified) {
      console.log("User is signed in but email not verified");
    } else {
      console.log("User is signed out");
    }
  });

  function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function showSignupModal() {
    document.getElementById('signupModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function showActivationModal(email) {
    document.getElementById('activationEmail').textContent = email;
    document.getElementById('activationModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    startResendTimer();
  }

  function showActivationSuccessModal() {
    document.getElementById('activationSuccessModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function showActivationErrorModal(message) {
    if (message) {
      document.getElementById('activationErrorMessage').textContent = message;
    }
    document.getElementById('activationErrorModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    document.body.style.overflow = ''; // Restore scrolling
    const errorElement = document.getElementById(modalId).querySelector('.error-message');
    if (errorElement) {
      errorElement.style.display = 'none';
      errorElement.textContent = '';
    }
  }

  function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.style.display = 'block';
    }
  }

  // Timer for resend activation email
  let resendTimer;
  let timeLeft = 60; // 60 seconds

  function startResendTimer() {
    const resendLink = document.getElementById('resendLink');
    const resendTimerDisplay = document.getElementById('resendTimer');

    if (resendLink && resendTimerDisplay) {
      resendLink.style.display = 'none';
      resendTimerDisplay.style.display = 'inline';
      resendTimerDisplay.textContent = ` (${timeLeft}s)`;

      timeLeft = 60; // Reset timer
      clearInterval(resendTimer); // Clear any existing timer

      resendTimer = setInterval(() => {
        timeLeft--;
        resendTimerDisplay.textContent = ` (${timeLeft}s)`;
        if (timeLeft <= 0) {
          clearInterval(resendTimer);
          resendLink.style.display = 'inline';
          resendTimerDisplay.style.display = 'none';
        }
      }, 1000);
    }
  }

  async function checkEmailVerificationStatus() {
    const user = auth.currentUser;
    if (user) {
      await user.reload(); // Reload user to get the latest email verification status
      return user.emailVerified;
    }
    return false;
  }

  async function resendActivationEmail() {
    const user = auth.currentUser;
    if (user) {
      try {
        await sendEmailVerification(user);
        showCustomAlert('Verification Email Sent', 'A new verification email has been sent to your inbox. Please check your email.');
        startResendTimer(); // Restart timer
      } catch (error) {
        showCustomAlert('Error', `Failed to resend verification email: ${error.message}`);
      }
    } else {
      showCustomAlert('Error', 'No user logged in to resend email.');
    }
  }

  // Custom alert modal functions
  function showCustomAlert(title, message) {
    document.getElementById('customAlertTitle').textContent = title;
    document.getElementById('customAlertMessage').textContent = message;
    document.getElementById('customAlertModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeCustomAlert() {
    document.getElementById('customAlertModal').style.display = 'none';
    document.body.style.overflow = '';
  }

  // Attach event listener to the custom alert close button
  const customAlertCloseBtn = document.getElementById('customAlertCloseBtn');
  if (customAlertCloseBtn) {
    customAlertCloseBtn.addEventListener('click', closeCustomAlert);
  }

  const customAlertOKBtn = document.getElementById('customAlertOKBtn');
  if (customAlertOKBtn) {
    customAlertOKBtn.addEventListener('click', closeCustomAlert);
  }

  // Event Listeners for Authentication
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = loginForm.loginEmail.value;
      const password = loginForm.loginPassword.value;
      const selectedRole = document.querySelector('input[name="loginRole"]:checked').value;
      const loginError = document.getElementById('loginError');
      const loginButton = loginForm.querySelector('button[type="submit"]'); // Get the login button

      // Show loading state
      if (loginButton) {
        loginButton.textContent = 'Logging in...';
        loginButton.disabled = true;
      }
      showError('loginError', ''); // Clear previous errors

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          await sendEmailVerification(user);
          closeModal('loginModal');
          showActivationModal(email);
          return;
        }

        // Fetch user's role from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const storedRole = userData.role;
          
          // Store username in localStorage after successful login
          if (userData.username) {
            localStorage.setItem("username", userData.username);
          }

          if (storedRole === selectedRole) {
            console.log("Logged in successfully as:", storedRole);
            // Redirect based on role
            if (storedRole === 'admin') {
              window.location.href = 'newadmin.html'; // Redirect to admin dashboard
            } else {
              window.location.href = 'index.html'; // Redirect to user dashboard
            }
          } else {
            showError('loginError', `You are trying to log in as ${selectedRole}, but your account is registered as ${storedRole}.`);
            await signOut(auth); // Sign out the user if role mismatch
          }
        } else {
          showError('loginError', 'User data not found. Please contact support.');
          await signOut(auth); // Sign out the user if no user data
        }
      } catch (error) {
        let errorMessage = "An unknown error occurred.";
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential': // More generic for invalid email/password
            errorMessage = "Invalid email or password. Please try again.";
            break;
          case 'auth/too-many-requests':
            errorMessage = "Too many failed login attempts. Please try again later.";
            break;
          default:
            errorMessage = error.message;
            break;
        }
        showError('loginError', errorMessage);
      } finally {
        // Reset loading state
        if (loginButton) {
          loginButton.textContent = 'Sign In'; // Or whatever the original text was
          loginButton.disabled = false;
        }
      }
    });
  }

  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const username = signupForm.signupUsername.value;
      const email = signupForm.signupEmail.value;
      const password = signupForm.signupPassword.value;
      const selectedRole = document.querySelector('input[name="role"]:checked').value; // Get selected role
      const signupButton = signupForm.querySelector('button[type="submit"]');

      // Show loading state
      if (signupButton) {
        signupButton.textContent = 'Signing up...';
        signupButton.disabled = true;
      }
      showError('signupError', ''); // Clear previous errors

      try {
        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Send email verification
        await sendEmailVerification(user);

        // Store user data in Firestore, including the selected role and username
        await setDoc(doc(db, "users", user.uid), {
          username: username, // Store the username
          email: email,
          role: selectedRole // Store the selected role
        });

        closeModal('signupModal');

        // Show activation modal
        document.getElementById('activationEmail').textContent = email;
        document.getElementById('activationModal').style.display = 'block';

      } catch (error) {
        showError('signupError', error.message);
      } finally {
        // Reset loading state
        if (signupButton) {
          signupButton.textContent = 'Sign Up'; // Or whatever the original text was
          signupButton.disabled = false;
        }
      }
    });
  }

  // Close modals when clicking outside
  window.addEventListener('click', function (event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (event.target === modal) {
        closeModal(modal.id);
      }
    });
  });

  // Function to switch from login to signup modal
  window.switchToSignup = function () {
    closeModal('loginModal');
    showSignupModal();
  };

  // Function to switch from signup to login modal
  window.switchToLogin = function () {
    closeModal('signupModal');
    showLoginModal();
  };

  // Quick Access Button handlers (for testing and direct access)
  window.showLoginModal = showLoginModal;
  window.showSignupModal = showSignupModal;

  const loginBtn = document.querySelector('.btn-secondary[onclick="showLoginModal()"]');
  const signupBtn = document.querySelector('.btn-primary[onclick="showSignupModal()"]');
  const logoutBtn = document.getElementById('logoutBtn'); // Assuming you have a logout button

  if (loginBtn) {
    loginBtn.addEventListener('click', showLoginModal);
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', showSignupModal);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  // Close button event listeners for modals
  const closeButtons = document.querySelectorAll('.close, .modal-close');
  closeButtons.forEach(button => {
    button.addEventListener('click', function () {
      const modal = this.closest('.modal');
      if (modal) {
        closeModal(modal.id);
      }
    });
  });

  // Handle activation success modal continue button
  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', function () {
      closeModal('activationSuccessModal');
      showLoginModal();
    });
  }

  // Handle resend activation email link
  const resendLink = document.getElementById('resendLink');
  if (resendLink) {
    resendLink.addEventListener('click', function (e) {
      e.preventDefault();
      resendActivationEmail();
    });
  }

  // Handle check verification status button
  const checkVerificationBtn = document.getElementById('checkVerificationBtn');
  if (checkVerificationBtn) {
    checkVerificationBtn.addEventListener('click', async function () {
      const isVerified = await checkEmailVerificationStatus();
      if (isVerified) {
        showCustomAlert("Email Verified", "Your email has been successfully verified!");
      } else {
        showCustomAlert("Email Not Verified", "Your email is not yet verified. Please check your email and click the verification link.");
      }
    });
  }

  console.log("Firebase authentication script loaded successfully");
});

// Animation on scroll
function animateOnScroll() {
  const elements = document.querySelectorAll('.animate-on-scroll');
  elements.forEach(element => {
    const elementTop = element.getBoundingClientRect().top;
    const elementVisible = 150;

    if (elementTop < window.innerHeight - elementVisible) {
      element.classList.add('active');
    }
  });
}

window.addEventListener('scroll', animateOnScroll);

// Initialize animations on page load
document.addEventListener('DOMContentLoaded', function () {
  animateOnScroll();
});

// Function to log out (add this to your existing Landingscript.js)
async function logout() {
  try {
    await signOut(auth);
    console.log("User signed out successfully.");
    // Redirect to the landing page or home page after logout
    window.location.href = 'LandingPage.html';
  } catch (error) {
    console.error("Error signing out:", error);
    showCustomAlert('Logout Error', `Failed to log out: ${error.message}`);
  }
}
