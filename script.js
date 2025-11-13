// === UPDATED FIREBASE IMPORTS ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    sendPasswordResetEmail // <-- NEW IMPORT
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, serverTimestamp, 
    getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Provide firebase config from environment (same pattern as before)
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let app, auth, db;

// Initialize Firebase only if config is valid
if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        // === UPDATED AUTH STATE LISTENER (THE 'BRAIN' OF THE APP) ===
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is signed in
                currentUserId = user.uid;
                currentEmail = user.email || null;
                
                // Update UI for logged-in state
                navDashboard.classList.remove('hidden');
                showLoginBtn.classList.add('hidden');
                signOutBtn.classList.remove('hidden');
                if (currentEmail) {
                    userEmail.textContent = currentEmail;
                    userEmail.classList.remove('hidden');
                }
                
                // Hide modal and reset auth forms
                authModal.classList.add('hidden');
                showLoginView(); // Reset modal to login view for next time
                
                // Load user's data
                loadHealthDashboard();
            } else {
                // User is signed out
                currentUserId = null;
                currentEmail = null;
                
                // Update UI for logged-out state
                navDashboard.classList.add('hidden');
                showLoginBtn.classList.remove('hidden');
                signOutBtn.classList.add('hidden');
                userEmail.classList.add('hidden');
                
                // Reset dashboard
                recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Please log in to view your dashboard.</p>';
                
                // Go back to calculator view
                showCalculatorView();
            }
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        auth = null;
        db = null;
    }
} else {
    console.warn("Firebase config is missing or empty. Database features will be disabled.");
    auth = null;
    db = null;
}


let currentUserId = null;
let currentEmail = null;


// Save health data helper (Unchanged)
async function saveHealthData(dataToSave) {
    if (!db || !currentUserId) {
        console.log("Database not initialized or user not logged in. Skipping save.");
        alert("You must be logged in to save your results.");
        return; 
    }
    
    try {
        const userRecordsCollection = collection(db, 'artifacts', appId, 'users', currentUserId, 'healthRecords');
        await addDoc(userRecordsCollection, { ...dataToSave, createdAt: serverTimestamp() });
        console.log('Saved record for user', currentUserId);
    } catch (e) {
        console.error('Error saving record:', e);
    }
}

// ---------- UI & Calculator Logic ----------

const form = document.getElementById('healthForm');
const resultDiv = document.getElementById('result');
const riskScoreSpan = document.getElementById('riskScore');
const riskLevelEl = document.getElementById('riskLevel');
const riskMessageEl = document.getElementById('riskMessage');
const precautionsList = document.getElementById('precautionsList');
const meterFill = document.getElementById('meterFill');
const aiPredictionEl = document.getElementById('aiPrediction');
const clearFormBtn = document.getElementById('clearFormBtn');

// --- NAVIGATION & DASHBOARD ELEMENTS ---
const navCalculator = document.getElementById('navCalculator');
const navDashboard = document.getElementById('navDashboard');
const formContainer = document.getElementById('formContainer');
const dashboardPage = document.getElementById('dashboardPage');
const recordsContainer = document.getElementById('recordsContainer');

// --- AUTH MODAL ELEMENTS ---
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userEmail = document.getElementById('userEmail');

// Modal Content
const authContent = document.getElementById('authContent');
const resetContent = document.getElementById('resetContent');

// Modal Tabs
const loginTab = document.getElementById('loginTab');
const signUpTab = document.getElementById('signUpTab');

// Modal Forms
const loginForm = document.getElementById('loginForm');
const signUpForm = document.getElementById('signUpForm');
const resetForm = document.getElementById('resetForm');
const googleSignInBtn = document.getElementById('googleSignInBtn');

// Modal Buttons
const showResetBtn = document.getElementById('showResetBtn');
const showLoginFromReset = document.getElementById('showLoginFromReset');

// Modal Error/Message
const loginError = document.getElementById('loginError');
const signUpError = document.getElementById('signUpError');
const resetError = document.getElementById('resetError');
const resetMessage = document.getElementById('resetMessage');


// --- Form Listeners (Unchanged) ---
form.addEventListener('submit', handleFormSubmit);
clearFormBtn.addEventListener('click', clearForm);

// === NAVIGATION LOGIC ===
navCalculator.addEventListener('click', showCalculatorView);
navDashboard.addEventListener('click', showDashboardView);

function showCalculatorView() {
    formContainer.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
    navCalculator.classList.add('text-red-600', 'border-red-600');
    navCalculator.classList.remove('text-gray-500');
    navDashboard.classList.add('text-gray-500');
    navDashboard.classList.remove('text-red-600', 'border-red-600');
}

function showDashboardView() {
    formContainer.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    navDashboard.classList.add('text-red-600', 'border-red-600');
    navDashboard.classList.remove('text-gray-500');
    navCalculator.classList.add('text-gray-500');
    navCalculator.classList.remove('text-red-600', 'border-red-600');
    loadHealthDashboard(); 
}

// === AUTH MODAL LOGIC ===

// Show/Hide Modal
showLoginBtn.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    showLoginView(); // Default to login view
});
closeModalBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

// Tab Switching
loginTab.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    signUpForm.classList.add('hidden');
    loginTab.classList.add('text-red-600', 'border-red-600');
    signUpTab.classList.remove('text-red-600', 'border-red-600');
    signUpTab.classList.add('text-gray-500');
});
signUpTab.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    signUpForm.classList.remove('hidden');
    signUpTab.classList.add('text-red-600', 'border-red-600');
    loginTab.classList.remove('text-red-600', 'border-red-600');
    loginTab.classList.add('text-gray-500');
});

// --- NEW: View switching for Reset Password ---
showResetBtn.addEventListener('click', () => {
    authContent.classList.add('hidden');
    resetContent.classList.remove('hidden');
});
showLoginFromReset.addEventListener('click', showLoginView);

function showLoginView() {
    authContent.classList.remove('hidden');
    resetContent.classList.add('hidden');
    // Ensure login tab is active
    loginTab.click(); 
    // Clear any messages
    resetMessage.classList.add('hidden');
    resetError.classList.add('hidden');
    loginError.classList.add('hidden');
    signUpError.classList.add('hidden');
}

// Form Handlers
signUpForm.addEventListener('submit', handleSignUp);
loginForm.addEventListener('submit', handleLogin);
resetForm.addEventListener('submit', handlePasswordReset); // <-- NEW
googleSignInBtn.addEventListener('click', handleGoogleSignIn);
signOutBtn.addEventListener('click', handleSignOut);


// --- Calculator Logic (Unchanged) ---
function clearForm() {
    // ... (This function is unchanged)
    form.reset();
    resultDiv.classList.add('hidden');
    riskScoreSpan.textContent = '--';
    meterFill.style.width = '0%';
    resultDiv.classList.remove('bg-green-50', 'bg-yellow-50');
    resultDiv.classList.add('bg-red-50');
}
async function handleFormSubmit(e) {
    e.preventDefault();
    // ... (All calculator scoring logic is unchanged)
    // ...
    const age = parseInt(document.getElementById('age').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const heightCm = parseFloat(document.getElementById('height').value);
    const waist = parseFloat(document.getElementById('waist').value);
    if (isNaN(age) || isNaN(weight) || isNaN(heightCm) || isNaN(waist)) {
        riskLevelEl.textContent = 'Validation Error';
        riskMessageEl.textContent = 'Please fill Age, Weight, Height, and Waist.';
        precautionsList.innerHTML = '<li>Please correct the errors above.</li>';
        aiPredictionEl.textContent = 'N/A';
        resultDiv.classList.remove('hidden');
        resultDiv.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);
    const gender = document.getElementById('gender').value;
    const steps = parseInt(document.getElementById('steps').value) || 0;
    const junkFood = parseInt(document.getElementById('junkFood').value) || 0;
    const exercise = parseFloat(document.getElementById('exercise').value) || 0;
    const alcohol = parseInt(document.getElementById('alcohol').value) || 0;
    const smoking = parseInt(document.getElementById('smoking').value) || 0;
    const sleep = parseFloat(document.getElementById('sleep').value) || 0;
    const stress = parseInt(document.getElementById('stress').value) || 1;
    const familyHistory = parseInt(document.getElementById('familyHistory').value) || 0;
    const highBp = document.getElementById('highBp').checked;
    const diabetes = document.getElementById('diabetes').checked;
    const cholesterol = parseInt(document.getElementById('cholesterol').value) || null;
    const rbc = parseFloat(document.getElementById('rbc').value) || null;
    const wbc = parseFloat(document.getElementById('wbc').value) || null;
    let score = 0;
    let precautions = [];
    if (age > 30) { score += Math.floor((age - 30) / 5); if (age > 45) precautions.push("Regular check-ups are crucial given your age."); }
    if (bmi < 18.5) { score += 2; precautions.push("Your BMI is in the underweight range. Consult a doctor about healthy weight gain."); } else if (bmi >= 25 && bmi < 30) { score += 5; precautions.push("Your BMI is in the overweight range. Focus on portion control and moderate exercise."); } else if (bmi >= 30) { score += 10; precautions.push("Your BMI is in the obese range. This is a significant risk factor. Please consult a doctor for a weight management plan."); }
    if ((gender === 'Male' && waist > 102) || (gender === 'Female' && waist > 88)) { score += 7; precautions.push("Your waist circumference is high, indicating increased risk. Focus on reducing abdominal fat through diet and exercise."); }
    if (smoking === 1) { score += 10; precautions.push("Smoking is a major risk factor. Quitting is the single best thing you can do for your heart health."); }
    if (exercise < 2.5) { score += 5; precautions.push("Aim for at least 150 minutes of moderate exercise (like brisk walking) per week."); }
    if (steps < 5000) { score += 3; if (exercise < 2.5) precautions.pop(); precautions.push("Your daily step count is low. Try to gradually increase your daily walking."); }
    if (junkFood > 3) { score += 4; precautions.push("High intake of junk food is detrimental. Focus on whole foods, fruits, and vegetables."); }
    if ((gender === 'Male' && alcohol > 14) || (gender === 'Female' && alcohol > 7)) { score += 3; precautions.push("Your alcohol consumption is high. Please consider reducing it to recommended limits (or less)."); }
    if (sleep < 6 || sleep > 9) { score += 2; precautions.push("Aim for 7-8 hours of quality sleep per night, as poor sleep affects heart health."); }
    if (stress === 3) { score += 3; precautions.push("High stress levels contribute to heart risk. Explore stress-management techniques like mindfulness, yoga, or hobbies."); }
    if (familyHistory === 1) { score += 5; precautions.push("You have a family history of heart disease, making proactive care very important."); }
    if (highBp) { score += 8; precautions.push("Managing your high blood pressure is critical. Follow your doctor's advice carefully."); }
    if (diabetes) { score += 8; precautions.push("Diabetes significantly increases heart risk. Diligent blood sugar control is essential."); }
    if (cholesterol && cholesterol > 200) { score += (cholesterol > 240) ? 8 : 4; precautions.push("Your cholesterol is high. Discuss dietary changes and potential treatment with your doctor."); }
    score = Math.max(0, Math.min(60, score));
    resultDiv.classList.remove('hidden');
    resultDiv.scrollIntoView({ behavior: 'smooth' });
    riskScoreSpan.textContent = score;
    setTimeout(() => { meterFill.style.width = `${(score / 60) * 100}%`; }, 100);
    let level = 'Low'; let levelColor = 'text-green-600';
    if (score >= 40) { level = 'High'; levelColor = 'text-red-600'; } else if (score >= 20) { level = 'Moderate'; levelColor = 'text-yellow-600'; }
    resultDiv.classList.remove('bg-red-50', 'bg-yellow-50', 'bg-green-50');
    if (level === 'Low') { resultDiv.classList.add('bg-green-50'); } else if (level === 'Moderate') { resultDiv.classList.add('bg-yellow-50'); } else { resultDiv.classList.add('bg-red-50'); }
    riskLevelEl.textContent = level; riskLevelEl.className = `text-xl font-extrabold ${levelColor}`;
    riskMessageEl.textContent = `Your calculated BMI is ${bmi.toFixed(1)}. Based on your inputs, your risk level is ${level}.`;
    const baseRisk = (score / 60) * 50; const noise = (Math.random() - 0.5) * 5;
    const aiRisk = Math.max(1, Math.min(95, baseRisk + noise + (age / 10)));
    aiPredictionEl.textContent = `${aiRisk.toFixed(1)}% 10-year risk (simulated)`;
    if (precautions.length === 0) { precautions.push("You're doing great! Keep up the healthy habits."); }
    precautions.push("Always consult a medical professional for personalized advice.");
    precautionsList.innerHTML = precautions.map(p => `<li>${p}</li>`).join('');
    const dataToSave = { age, gender, weight, heightCm, waist, bmi: bmi.toFixed(2), steps, junkFood, exercise, alcohol, smoking, sleep, stress, familyHistory, highBp, diabetes, cholesterol, rbc, wbc, score, level, createdAt: new Date().toISOString() };
    saveHealthData(dataToSave); 
}

// --- Dashboard Loader (Unchanged) ---
async function loadHealthDashboard() {
    // ... (This function is unchanged)
    if (!db || !currentUserId) { recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Please log in to view your records.</p>'; return; }
    recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Loading your health records...</p>';
    try {
        const userRecordsCollection = collection(db, 'artifacts', appId, 'users', currentUserId, 'healthRecords');
        const q = query(userRecordsCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { recordsContainer.innerHTML = '<p class="text-sm text-gray-500">No records found. Calculate your score to see it here!</p>'; return; }
        let recordsHtml = '';
        querySnapshot.forEach((doc) => {
            const record = doc.data();
            const recordDate = record.createdAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', });
            let levelColor = 'text-gray-700';
            if (record.level === 'High') levelColor = 'text-red-600';
            if (record.level === 'Moderate') levelColor = 'text-yellow-600';
            if (record.level === 'Low') levelColor = 'text-green-600';
            recordsHtml += `
                <div class="p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                    <div class="flex justify-between items-center mb-2"><p class="font-bold text-lg text-gray-800">${recordDate}</p><p class="font-bold text-xl ${levelColor}">${record.score} <span class="text-sm font-medium">(${record.level})</span></p></div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <p><span class="text-gray-500">BMI:</span> <span class="font-semibold">${record.bmi}</span></p>
                        <p><span class="text-gray-500">Steps:</span> <span class="font-semibold">${record.steps}</span></p>
                        <p><span class="text-gray-500">Exercise:</span> <span class="font-semibold">${record.exercise}h</span></p>
                        <p><span class="text-gray-500">Smoking:</span> <span class="font-semibold">${record.smoking === 1 ? 'Yes' : 'No'}</span></p>
                    </div>
                </div>`;
        });
        recordsContainer.innerHTML = recordsHtml;
    } catch (e) { console.error("Error loading records: ", e); recordsContainer.innerHTML = '<p class="text-red-500">There was an error loading your records.</p>'; }
}


// === AUTH HANDLER FUNCTIONS ===

async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signUpEmail').value;
    const password = document.getElementById('signUpPassword').value;
    signUpError.classList.add('hidden');
    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Sign up error:", error);
        signUpError.textContent = error.message;
        signUpError.classList.remove('hidden');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    loginError.classList.add('hidden');
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login error:", error);
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    }
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Google sign in error:", error);
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Sign out error:", error);
    }
}

// === NEW PASSWORD RESET FUNCTION ===
async function handlePasswordReset(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    resetError.classList.add('hidden');
    resetMessage.classList.add('hidden');

    try {
        await sendPasswordResetEmail(auth, email);
        // Show a success message
        resetMessage.textContent = "Success! Check your email for a password reset link.";
        resetMessage.classList.remove('hidden');
    } catch (error) {
        console.error("Password reset error:", error);
        resetError.textContent = error.message;
        resetError.classList.remove('hidden');
    }
}