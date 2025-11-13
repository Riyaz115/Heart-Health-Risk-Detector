// === FIREBASE IMPORTS ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    sendPasswordResetEmail,
    deleteUser
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp, 
    getDocs, 
    query, 
    orderBy, 
    limit,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// === CONFIGURATION ===
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let app, auth, db;

// === STATE VARIABLES ===
let currentUserId = null;
let currentEmail = null;
let hasAcceptedDisclaimer = localStorage.getItem('disclaimerAccepted') === 'true';
let recordsLimit = 10;
let allRecords = [];

// === UTILITY FUNCTIONS ===

// Debounce function for auto-save
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Sanitize input to prevent XSS
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

// Validate numeric input
function validateNumericInput(value, min, max, fieldName) {
    const num = parseFloat(value);
    if (isNaN(num)) {
        throw new Error(`${fieldName} must be a valid number`);
    }
    if (num < min || num > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return num;
}

// === DRAFT MANAGEMENT ===

function saveDraft() {
    if (!form) return;
    
    const formData = new FormData(form);
    const draft = {};
    
    for (let [key, value] of formData.entries()) {
        draft[key] = value;
    }
    
    // Also save checkbox states
    draft.highBp = document.getElementById('highBp').checked;
    draft.diabetes = document.getElementById('diabetes').checked;
    
    localStorage.setItem('healthFormDraft', JSON.stringify(draft));
    console.log('Draft saved');
}

function loadDraft() {
    const draftStr = localStorage.getItem('healthFormDraft');
    if (!draftStr) return false;
    
    try {
        const draft = JSON.parse(draftStr);
        
        // Populate form fields
        Object.keys(draft).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = draft[key];
                } else {
                    element.value = draft[key];
                }
            }
        });
        
        return true;
    } catch (e) {
        console.error('Error loading draft:', e);
        return false;
    }
}

function clearDraft() {
    localStorage.removeItem('healthFormDraft');
}

// === FORM PROGRESS TRACKING ===

function updateFormProgress() {
    const inputs = form.querySelectorAll('input[required], select[required]');
    let filled = 0;
    
    inputs.forEach(input => {
        if (input.value && input.value.trim() !== '') {
            filled++;
        }
    });
    
    const percentage = (filled / inputs.length) * 100;
    formProgress.style.width = `${percentage}%`;
}

// === RISK CALCULATION MODULES ===

const riskFactors = {
    calculateAgeRisk(age) {
        if (age <= 30) return { score: 0, message: null };
        const score = Math.floor((age - 30) / 5);
        const message = age > 45 ? "Regular check-ups are crucial given your age." : null;
        return { score, message };
    },
    
    calculateBMIRisk(bmi, gender) {
        if (bmi < 18.5) {
            return { 
                score: 2, 
                message: "Your BMI is in the underweight range. Consult a doctor about healthy weight gain." 
            };
        } else if (bmi >= 30) {
            return { 
                score: 10, 
                message: "Your BMI is in the obese range. This is a significant risk factor. Please consult a doctor for a weight management plan." 
            };
        } else if (bmi >= 25) {
            return { 
                score: 5, 
                message: "Your BMI is in the overweight range. Focus on portion control and moderate exercise." 
            };
        }
        return { score: 0, message: null };
    },
    
    calculateWaistRisk(waist, gender) {
        const threshold = gender === 'Male' ? 102 : 88;
        if (waist > threshold) {
            return {
                score: 7,
                message: "Your waist circumference is high, indicating increased risk. Focus on reducing abdominal fat through diet and exercise."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateSmokingRisk(smoking) {
        if (smoking === 1) {
            return {
                score: 10,
                message: "Smoking is a major risk factor. Quitting is the single best thing you can do for your heart health."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateExerciseRisk(exercise, steps) {
        let score = 0;
        let messages = [];
        
        if (exercise < 2.5) {
            score += 5;
            messages.push("Aim for at least 150 minutes of moderate exercise (like brisk walking) per week.");
        }
        
        if (steps < 5000) {
            score += 3;
            if (!messages.length) {
                messages.push("Your daily step count is low. Try to gradually increase your daily walking.");
            }
        }
        
        return { score, message: messages.join(' ') || null };
    },
    
    calculateDietRisk(junkFood) {
        if (junkFood > 3) {
            return {
                score: 4,
                message: "High intake of junk food is detrimental. Focus on whole foods, fruits, and vegetables."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateAlcoholRisk(alcohol, gender) {
        const threshold = gender === 'Male' ? 14 : 7;
        if (alcohol > threshold) {
            return {
                score: 3,
                message: "Your alcohol consumption is high. Please consider reducing it to recommended limits (or less)."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateSleepRisk(sleep) {
        if (sleep < 6 || sleep > 9) {
            return {
                score: 2,
                message: "Aim for 7-8 hours of quality sleep per night, as poor sleep affects heart health."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateStressRisk(stress) {
        if (stress === 3) {
            return {
                score: 3,
                message: "High stress levels contribute to heart risk. Explore stress-management techniques like mindfulness, yoga, or hobbies."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateFamilyHistoryRisk(familyHistory) {
        if (familyHistory === 1) {
            return {
                score: 5,
                message: "You have a family history of heart disease, making proactive care very important."
            };
        }
        return { score: 0, message: null };
    },
    
    calculateMedicalConditionRisk(highBp, diabetes) {
        let score = 0;
        let messages = [];
        
        if (highBp) {
            score += 8;
            messages.push("Managing your high blood pressure is critical. Follow your doctor's advice carefully.");
        }
        
        if (diabetes) {
            score += 8;
            messages.push("Diabetes significantly increases heart risk. Diligent blood sugar control is essential.");
        }
        
        return { score, message: messages.join(' ') || null };
    },
    
    calculateCholesterolRisk(cholesterol) {
        if (cholesterol) {
            if (cholesterol > 240) {
                return {
                    score: 8,
                    message: "Your cholesterol is very high. Discuss dietary changes and potential treatment with your doctor immediately."
                };
            } else if (cholesterol > 200) {
                return {
                    score: 4,
                    message: "Your cholesterol is elevated. Discuss dietary changes and potential treatment with your doctor."
                };
            }
        }
        return { score: 0, message: null };
    }
};

// === FIREBASE INITIALIZATION ===

if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        // Auth state listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                currentEmail = user.email || null;
                
                // Update UI
                navDashboard.classList.remove('hidden');
                navSettings.classList.remove('hidden');
                showLoginBtn.classList.add('hidden');
                signOutBtn.classList.remove('hidden');
                
                if (currentEmail) {
                    userEmail.textContent = currentEmail;
                    userEmail.classList.remove('hidden');
                }
                
                // Update settings page
                if (settingsEmail) settingsEmail.textContent = currentEmail || 'N/A';
                if (settingsUserId) settingsUserId.textContent = currentUserId || 'N/A';
                
                authModal.classList.add('hidden');
                showLoginView();
                
                // Load dashboard if we're on it
                if (!dashboardPage.classList.contains('hidden')) {
                    loadHealthDashboard();
                }
            } else {
                currentUserId = null;
                currentEmail = null;
                
                // Update UI
                navDashboard.classList.add('hidden');
                navSettings.classList.add('hidden');
                showLoginBtn.classList.remove('hidden');
                signOutBtn.classList.add('hidden');
                userEmail.classList.add('hidden');
                
                recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Please log in to view your dashboard.</p>';
                showCalculatorView();
            }
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        alert("Database connection failed. Some features may not work.");
        auth = null;
        db = null;
    }
} else {
    console.warn("Firebase config is missing. Database features will be disabled.");
    auth = null;
    db = null;
}

// === DOM ELEMENTS ===

const form = document.getElementById('healthForm');
const resultDiv = document.getElementById('result');
const riskScoreSpan = document.getElementById('riskScore');
const riskLevelEl = document.getElementById('riskLevel');
const riskMessageEl = document.getElementById('riskMessage');
const precautionsList = document.getElementById('precautionsList');
const meterFill = document.getElementById('meterFill');
const aiPredictionEl = document.getElementById('aiPrediction');
const clearFormBtn = document.getElementById('clearFormBtn');
const submitBtn = document.getElementById('submitBtn');
const formProgress = document.getElementById('formProgress');

// Navigation
const navCalculator = document.getElementById('navCalculator');
const navDashboard = document.getElementById('navDashboard');
const navSettings = document.getElementById('navSettings');
const formContainer = document.getElementById('formContainer');
const dashboardPage = document.getElementById('dashboardPage');
const settingsPage = document.getElementById('settingsPage');
const recordsContainer = document.getElementById('recordsContainer');
const trendSummary = document.getElementById('trendSummary');
const trendContent = document.getElementById('trendContent');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// Auth Modal
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userEmail = document.getElementById('userEmail');
const authContent = document.getElementById('authContent');
const resetContent = document.getElementById('resetContent');
const loginTab = document.getElementById('loginTab');
const signUpTab = document.getElementById('signUpTab');
const loginForm = document.getElementById('loginForm');
const signUpForm = document.getElementById('signUpForm');
const resetForm = document.getElementById('resetForm');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const showResetBtn = document.getElementById('showResetBtn');
const showLoginFromReset = document.getElementById('showLoginFromReset');
const loginError = document.getElementById('loginError');
const signUpError = document.getElementById('signUpError');
const resetError = document.getElementById('resetError');
const resetMessage = document.getElementById('resetMessage');

// Draft elements
const draftNotification = document.getElementById('draftNotification');
const loadDraftBtn = document.getElementById('loadDraftBtn');
const dismissDraftBtn = document.getElementById('dismissDraftBtn');

// Settings elements
const settingsEmail = document.getElementById('settingsEmail');
const settingsUserId = document.getElementById('settingsUserId');
const exportDataBtn = document.getElementById('exportDataBtn');
const exportAllDataBtn = document.getElementById('exportAllDataBtn');
const deleteAllRecordsBtn = document.getElementById('deleteAllRecordsBtn');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');

// Disclaimer modal
const disclaimerModal = document.getElementById('disclaimerModal');
const disclaimerAccept = document.getElementById('disclaimerAccept');
const disclaimerDecline = document.getElementById('disclaimerDecline');

// === EVENT LISTENERS ===

// Form events
form.addEventListener('submit', handleFormSubmit);
form.addEventListener('input', debounce(saveDraft, 2000));
form.addEventListener('input', updateFormProgress);
clearFormBtn.addEventListener('click', clearForm);

// Navigation
navCalculator.addEventListener('click', showCalculatorView);
navDashboard.addEventListener('click', showDashboardView);
navSettings.addEventListener('click', showSettingsView);

// Auth modal
showLoginBtn.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    showLoginView();
});
closeModalBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

// Auth tabs
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

// Password reset
showResetBtn.addEventListener('click', () => {
    authContent.classList.add('hidden');
    resetContent.classList.remove('hidden');
});
showLoginFromReset.addEventListener('click', showLoginView);

// Auth handlers
signUpForm.addEventListener('submit', handleSignUp);
loginForm.addEventListener('submit', handleLogin);
resetForm.addEventListener('submit', handlePasswordReset);
googleSignInBtn.addEventListener('click', handleGoogleSignIn);
signOutBtn.addEventListener('click', handleSignOut);

// Draft handlers
loadDraftBtn.addEventListener('click', () => {
    loadDraft();
    draftNotification.classList.add('hidden');
    updateFormProgress();
});

dismissDraftBtn.addEventListener('click', () => {
    clearDraft();
    draftNotification.classList.add('hidden');
});

// Settings handlers
exportDataBtn.addEventListener('click', exportHealthData);
exportAllDataBtn.addEventListener('click', exportHealthData);
deleteAllRecordsBtn.addEventListener('click', deleteAllRecords);
deleteAccountBtn.addEventListener('click', deleteUserAccount);
loadMoreBtn.addEventListener('click', loadMoreRecords);

// Disclaimer
disclaimerAccept.addEventListener('click', () => {
    localStorage.setItem('disclaimerAccepted', 'true');
    hasAcceptedDisclaimer = true;
    disclaimerModal.classList.add('hidden');
});

disclaimerDecline.addEventListener('click', () => {
    disclaimerModal.classList.add('hidden');
    alert('You must accept the disclaimer to use this tool.');
});

// === INITIALIZATION ===

// Check for draft on load
window.addEventListener('DOMContentLoaded', () => {
    const hasDraft = localStorage.getItem('healthFormDraft');
    if (hasDraft) {
        draftNotification.classList.remove('hidden');
    }
    
    updateFormProgress();
});

// === NAVIGATION FUNCTIONS ===

function showCalculatorView() {
    formContainer.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
    settingsPage.classList.add('hidden');
    
    navCalculator.classList.add('text-red-600');
    navCalculator.classList.remove('text-gray-500');
    navDashboard.classList.add('text-gray-500');
    navDashboard.classList.remove('text-red-600');
    navSettings.classList.add('text-gray-500');
    navSettings.classList.remove('text-red-600');
}

function showDashboardView() {
    formContainer.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    settingsPage.classList.add('hidden');
    
    navDashboard.classList.add('text-red-600');
    navDashboard.classList.remove('text-gray-500');
    navCalculator.classList.add('text-gray-500');
    navCalculator.classList.remove('text-red-600');
    navSettings.classList.add('text-gray-500');
    navSettings.classList.remove('text-red-600');
    
    loadHealthDashboard();
}

function showSettingsView() {
    formContainer.classList.add('hidden');
    dashboardPage.classList.add('hidden');
    settingsPage.classList.remove('hidden');
    
    navSettings.classList.add('text-red-600');
    navSettings.classList.remove('text-gray-500');
    navCalculator.classList.add('text-gray-500');
    navCalculator.classList.remove('text-red-600');
    navDashboard.classList.add('text-gray-500');
    navDashboard.classList.remove('text-red-600');
}

function showLoginView() {
    authContent.classList.remove('hidden');
    resetContent.classList.add('hidden');
    loginTab.click();
    resetMessage.classList.add('hidden');
    resetError.classList.add('hidden');
    loginError.classList.add('hidden');
    signUpError.classList.add('hidden');
}

// === FORM HANDLERS ===

function clearForm() {
    form.reset();
    resultDiv.classList.add('hidden');
    riskScoreSpan.textContent = '--';
    meterFill.style.width = '0%';
    resultDiv.classList.remove('bg-green-50', 'bg-yellow-50');
    resultDiv.classList.add('bg-red-50');
    clearDraft();
    updateFormProgress();
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Show disclaimer if not accepted
    if (!hasAcceptedDisclaimer) {
        disclaimerModal.classList.remove('hidden');
        return;
    }
    
    // Disable submit button
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Calculating...';
    
    try {
        // Collect and validate inputs
        const name = sanitizeInput(document.getElementById('name').value);
        if (!name || name.trim() === '') {
            throw new Error('Name is required');
        }
        const age = validateNumericInput(document.getElementById('age').value, 1, 120, 'Age');
        const weight = validateNumericInput(document.getElementById('weight').value, 1, 500, 'Weight');
        const heightCm = validateNumericInput(document.getElementById('height').value, 100, 250, 'Height');
        const waist = validateNumericInput(document.getElementById('waist').value, 1, 200, 'Waist');
        
        const heightM = heightCm / 100;
        const bmi = weight / (heightM * heightM);
        
        const gender = sanitizeInput(document.getElementById('gender').value);
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
        
        const cholesterol = document.getElementById('cholesterol').value ? 
            parseInt(document.getElementById('cholesterol').value) : null;
        const rbc = document.getElementById('rbc').value ? 
            parseFloat(document.getElementById('rbc').value) : null;
        const wbc = document.getElementById('wbc').value ? 
            parseFloat(document.getElementById('wbc').value) : null;
        
        // Calculate risk using modular functions
        let totalScore = 0;
        let precautions = [];
        
        const risks = [
            riskFactors.calculateAgeRisk(age),
            riskFactors.calculateBMIRisk(bmi, gender),
            riskFactors.calculateWaistRisk(waist, gender),
            riskFactors.calculateSmokingRisk(smoking),
            riskFactors.calculateExerciseRisk(exercise, steps),
            riskFactors.calculateDietRisk(junkFood),
            riskFactors.calculateAlcoholRisk(alcohol, gender),
            riskFactors.calculateSleepRisk(sleep),
            riskFactors.calculateStressRisk(stress),
            riskFactors.calculateFamilyHistoryRisk(familyHistory),
            riskFactors.calculateMedicalConditionRisk(highBp, diabetes),
            riskFactors.calculateCholesterolRisk(cholesterol)
        ];
        
        risks.forEach(risk => {
            totalScore += risk.score;
            if (risk.message) {
                precautions.push(risk.message);
            }
        });
        
        // Cap score
        totalScore = Math.max(0, Math.min(60, totalScore));
        
        // Display results
        resultDiv.classList.remove('hidden');
        resultDiv.scrollIntoView({ behavior: 'smooth' });
        
        riskScoreSpan.textContent = totalScore;
        setTimeout(() => {
            meterFill.style.width = `${(totalScore / 60) * 100}%`;
        }, 100);
        
        let level = 'Low';
        let levelColor = 'text-green-600';
        
        if (totalScore >= 40) {
            level = 'High';
            levelColor = 'text-red-600';
        } else if (totalScore >= 20) {
            level = 'Moderate';
            levelColor = 'text-yellow-600';
        }
        
        resultDiv.classList.remove('bg-red-50', 'bg-yellow-50', 'bg-green-50');
        if (level === 'Low') {
            resultDiv.classList.add('bg-green-50');
        } else if (level === 'Moderate') {
            resultDiv.classList.add('bg-yellow-50');
        } else {
            resultDiv.classList.add('bg-red-50');
        }
        
        riskLevelEl.textContent = level;
        riskLevelEl.className = `text-xl font-extrabold ${levelColor}`;
        riskMessageEl.textContent = `Your calculated BMI is ${bmi.toFixed(1)}. Based on your inputs, your risk level is ${level}.`;
        
        // Simulate AI prediction
        const baseRisk = (totalScore / 60) * 50;
        const noise = (Math.random() - 0.5) * 5;
        const aiRisk = Math.max(1, Math.min(95, baseRisk + noise + (age / 10)));
        aiPredictionEl.textContent = `${aiRisk.toFixed(1)}% 10-year risk (simulated)`;
        
        // Add general advice
        if (precautions.length === 0) {
            precautions.push("You're doing great! Keep up the healthy habits.");
        }
        precautions.push("Always consult a medical professional for personalized advice.");
        
        precautionsList.innerHTML = precautions.map(p => `<li>${sanitizeInput(p)}</li>`).join('');
        
        // Save data
        const dataToSave = {
            name,
            age, gender, weight, heightCm, waist,
            bmi: parseFloat(bmi.toFixed(2)),
            steps, junkFood, exercise, alcohol, smoking, sleep, stress,
            familyHistory, highBp, diabetes,
            cholesterol, rbc, wbc,
            score: totalScore,
            level,
            timestamp: new Date().toISOString()
        };
        
        await saveHealthData(dataToSave);
        
        // Clear draft after successful submission
        clearDraft();
        
    } catch (error) {
        console.error('Calculation error:', error);
        alert(`Error: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

// === DATABASE FUNCTIONS ===

async function saveHealthData(dataToSave) {
    if (!db || !currentUserId) {
        console.log("User not logged in. Results not saved.");
        return;
    }
    
    try {
        const userRecordsCollection = collection(
            db, 'artifacts', appId, 'users', currentUserId, 'healthRecords'
        );
        await addDoc(userRecordsCollection, {
            ...dataToSave,
            createdAt: serverTimestamp()
        });
        console.log('Record saved successfully');
    } catch (e) {
        console.error('Error saving record:', e);
        alert('Failed to save your results. Please try again.');
    }
}

async function loadHealthDashboard() {
    if (!db || !currentUserId) {
        recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Please log in to view your records.</p>';
        return;
    }
    
    recordsContainer.innerHTML = '<p class="text-sm text-gray-500">Loading your health records...</p>';
    
    try {
        const userRecordsCollection = collection(
            db, 'artifacts', appId, 'users', currentUserId, 'healthRecords'
        );
        const q = query(userRecordsCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            recordsContainer.innerHTML = '<p class="text-sm text-gray-500">No records found. Calculate your score to see it here!</p>';
            trendSummary.classList.add('hidden');
            loadMoreContainer.classList.add('hidden');
            return;
        }
        
        // Store all records
        allRecords = [];
        querySnapshot.forEach((doc) => {
            allRecords.push({ id: doc.id, ...doc.data() });
        });
        
        // Render trend if we have multiple records
        if (allRecords.length >= 2) {
            renderTrendAnalysis(allRecords);
        } else {
            trendSummary.classList.add('hidden');
        }
        
        // Render initial batch
        renderRecords(allRecords.slice(0, recordsLimit));
        
        // Show load more button if needed
        if (allRecords.length > recordsLimit) {
            loadMoreContainer.classList.remove('hidden');
        } else {
            loadMoreContainer.classList.add('hidden');
        }
        
    } catch (e) {
        console.error("Error loading records:", e);
        recordsContainer.innerHTML = '<p class="text-red-500">There was an error loading your records.</p>';
    }
}

function renderTrendAnalysis(records) {
    const latestScore = records[0].score;
    const previousScore = records[1].score;
    const trend = latestScore - previousScore;
    
    let trendIcon, trendText, trendColor;
    
    if (trend > 0) {
        trendIcon = '📈';
        trendText = 'Risk increasing';
        trendColor = 'text-red-600';
    } else if (trend < 0) {
        trendIcon = '📉';
        trendText = 'Risk decreasing';
        trendColor = 'text-green-600';
    } else {
        trendIcon = '➡️';
        trendText = 'Risk stable';
        trendColor = 'text-gray-600';
    }
    
    trendContent.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-2xl">${trendIcon}</span>
            <span class="font-semibold">${trendText}</span>
            <span class="${trendColor} font-bold">${Math.abs(trend)} points</span>
            <span class="text-gray-600">since last check</span>
        </div>
    `;
    
    trendSummary.classList.remove('hidden');
}

function renderRecords(records) {
    let recordsHtml = '';
    
    records.forEach((record) => {
        const recordDate = record.createdAt?.toDate ? 
            record.createdAt.toDate().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 
            new Date(record.timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        
        let levelColor = 'text-gray-700';
        if (record.level === 'High') levelColor = 'text-red-600';
        if (record.level === 'Moderate') levelColor = 'text-yellow-600';
        if (record.level === 'Low') levelColor = 'text-green-600';
        
        recordsHtml += `
            <div class="p-4 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <p class="font-bold text-lg text-gray-800">${recordDate}</p>
                    <p class="font-bold text-xl ${levelColor}">${record.score} 
                        <span class="text-sm font-medium">(${record.level})</span>
                    </p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
                    <p><span class="text-gray-500">BMI:</span> 
                        <span class="font-semibold">${record.bmi}</span>
                    </p>
                    <p><span class="text-gray-500">Steps:</span> 
                        <span class="font-semibold">${record.steps}</span>
                    </p>
                    <p><span class="text-gray-500">Exercise:</span> 
                        <span class="font-semibold">${record.exercise}h</span>
                    </p>
                    <p><span class="text-gray-500">Smoking:</span> 
                        <span class="font-semibold">${record.smoking === 1 ? 'Yes' : 'No'}</span>
                    </p>
                </div>
            </div>
        `;
    });
    
    recordsContainer.innerHTML = recordsHtml;
}

function loadMoreRecords() {
    recordsLimit += 10;
    renderRecords(allRecords.slice(0, recordsLimit));
    
    if (recordsLimit >= allRecords.length) {
        loadMoreContainer.classList.add('hidden');
    }
}

async function exportHealthData() {
    if (!db || !currentUserId) {
        alert('Please log in to export your data.');
        return;
    }
    
    try {
        const userRecordsCollection = collection(
            db, 'artifacts', appId, 'users', currentUserId, 'healthRecords'
        );
        const q = query(userRecordsCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const records = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            records.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate ? 
                    data.createdAt.toDate().toISOString() : 
                    data.timestamp
            });
        });
        
        const exportData = {
            exportDate: new Date().toISOString(),
            userEmail: currentEmail,
            userId: currentUserId,
            recordCount: records.length,
            records: records
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heart-health-data-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`Successfully exported ${records.length} records!`);
    } catch (e) {
        console.error('Export error:', e);
        alert('Failed to export data. Please try again.');
    }
}

async function deleteAllRecords() {
    if (!db || !currentUserId) {
        alert('Please log in to delete records.');
        return;
    }
    
    const confirmMsg = 'Are you sure you want to delete ALL your health records? This action cannot be undone!\n\nType "DELETE" to confirm.';
    const userInput = prompt(confirmMsg);
    
    if (userInput !== 'DELETE') {
        alert('Deletion cancelled.');
        return;
    }
    
    try {
        const userRecordsCollection = collection(
            db, 'artifacts', appId, 'users', currentUserId, 'healthRecords'
        );
        const querySnapshot = await getDocs(userRecordsCollection);
        
        const deletePromises = [];
        querySnapshot.forEach((document) => {
            deletePromises.push(deleteDoc(document.ref));
        });
        
        await Promise.all(deletePromises);
        
        alert(`Successfully deleted ${deletePromises.length} records.`);
        
        // Reload dashboard
        if (!dashboardPage.classList.contains('hidden')) {
            loadHealthDashboard();
        }
    } catch (e) {
        console.error('Delete error:', e);
        alert('Failed to delete records. Please try again.');
    }
}

async function deleteUserAccount() {
    if (!auth || !currentUserId) {
        alert('Please log in to delete your account.');
        return;
    }
    
    const confirmMsg = 'WARNING: This will permanently delete your account and ALL your data!\n\nThis action CANNOT be undone.\n\nType "DELETE MY ACCOUNT" to confirm.';
    const userInput = prompt(confirmMsg);
    
    if (userInput !== 'DELETE MY ACCOUNT') {
        alert('Account deletion cancelled.');
        return;
    }
    
    try {
        // First delete all health records
        const userRecordsCollection = collection(
            db, 'artifacts', appId, 'users', currentUserId, 'healthRecords'
        );
        const querySnapshot = await getDocs(userRecordsCollection);
        
        const deletePromises = [];
        querySnapshot.forEach((document) => {
            deletePromises.push(deleteDoc(document.ref));
        });
        
        await Promise.all(deletePromises);
        
        // Then delete the auth account
        const user = auth.currentUser;
        await deleteUser(user);
        
        alert('Your account and all data have been permanently deleted.');
        
        // Redirect to calculator
        showCalculatorView();
        
    } catch (e) {
        console.error('Account deletion error:', e);
        if (e.code === 'auth/requires-recent-login') {
            alert('For security, please log out and log back in, then try deleting your account again.');
        } else {
            alert('Failed to delete account. Please try again or contact support.');
        }
    }
}

// === AUTH HANDLERS ===

async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signUpEmail').value;
    const password = document.getElementById('signUpPassword').value;
    
    signUpError.classList.add('hidden');
    
    if (password.length < 6) {
        signUpError.textContent = 'Password must be at least 6 characters long.';
        signUpError.classList.remove('hidden');
        return;
    }
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // Auth state listener will handle UI updates
    } catch (error) {
        console.error("Sign up error:", error);
        let errorMessage = error.message;
        
        // Provide user-friendly error messages
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please log in instead.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Use at least 6 characters.';
        }
        
        signUpError.textContent = errorMessage;
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
        // Auth state listener will handle UI updates
    } catch (error) {
        console.error("Login error:", error);
        let errorMessage = error.message;
        
        // Provide user-friendly error messages
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password. Please try again.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later.';
        }
        
        loginError.textContent = errorMessage;
        loginError.classList.remove('hidden');
    }
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    
    loginError.classList.add('hidden');
    signUpError.classList.add('hidden');
    
    try {
        await signInWithPopup(auth, provider);
        // Auth state listener will handle UI updates
    } catch (error) {
        console.error("Google sign in error:", error);
        let errorMessage = error.message;
        
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign-in cancelled. Please try again.';
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = 'Pop-up blocked by browser. Please allow pop-ups and try again.';
        }
        
        loginError.textContent = errorMessage;
        loginError.classList.remove('hidden');
    }
}

async function handleSignOut() {
    try {
        await signOut(auth);
        // Auth state listener will handle UI updates
    } catch (error) {
        console.error("Sign out error:", error);
        alert('Failed to sign out. Please try again.');
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    
    resetError.classList.add('hidden');
    resetMessage.classList.add('hidden');
    
    if (!email) {
        resetError.textContent = 'Please enter your email address.';
        resetError.classList.remove('hidden');
        return;
    }
    
    try {
        await sendPasswordResetEmail(auth, email);
        resetMessage.textContent = 'Success! Check your email for a password reset link.';
        resetMessage.classList.remove('hidden');
        
        // Clear the form
        document.getElementById('resetEmail').value = '';
    } catch (error) {
        console.error("Password reset error:", error);
        let errorMessage = error.message;
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email address.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Please enter a valid email address.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many requests. Please try again later.';
        }
        
        resetError.textContent = errorMessage;
        resetError.classList.remove('hidden');
    }
}