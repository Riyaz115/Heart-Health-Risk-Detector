// Firebase SDKs kept intact so you can add auth/dashboard later if you want.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
        
        // Silent anonymous sign-in if no other auth is provided
        (async () => {
            try {
                await signInAnonymously(auth);
            } catch (err) {
                console.warn("Anonymous sign-in failed (ok if you have another auth flow):", err);
            }
        })();

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                currentEmail = user.email || null;
            } else {
                currentUserId = null;
                currentEmail = null;
            }
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        // Handle cases where Firebase can't init
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


// Save health data helper (keeps behaviour from your original script)
async function saveHealthData(dataToSave) {
    // Guard clauses: exit if db isn't ready or no user
    if (!db || !currentUserId) {
        console.log("Database not initialized or user not logged in. Skipping save.");
        return; 
    }
    
    // Example path: artifacts/{appId}/users/{currentUserId}/healthRecords
    try {
        const userRecordsCollection = collection(db, 'artifacts', appId, 'users', currentUserId, 'healthRecords');
        await addDoc(userRecordsCollection, { ...dataToSave, createdAt: serverTimestamp() });
        console.log('Saved record for user', currentUserId);
    } catch (e) {
        console.error('Error saving record:', e);
    }
}

// ---------- UI & Calculator Logic (kept and slightly trimmed) ----------
// Mobile menu logic removed as menu is gone

const form = document.getElementById('healthForm');
const resultDiv = document.getElementById('result');
const riskScoreSpan = document.getElementById('riskScore');
const riskLevelEl = document.getElementById('riskLevel');
const riskMessageEl = document.getElementById('riskMessage');
const precautionsList = document.getElementById('precautionsList');
const meterFill = document.getElementById('meterFill');
const aiPredictionEl = document.getElementById('aiPrediction');
const clearFormBtn = document.getElementById('clearFormBtn');

form.addEventListener('submit', handleFormSubmit);
clearFormBtn.addEventListener('click', clearForm);

function clearForm() {
    form.reset();
    resultDiv.classList.add('hidden');
    riskScoreSpan.textContent = '--';
    meterFill.style.width = '0%';

    // --- NEW CODE ---
    // Reset background color on clear
    resultDiv.classList.remove('bg-green-50', 'bg-yellow-50');
    resultDiv.classList.add('bg-red-50');
    // --- END NEW CODE ---
}

async function handleFormSubmit(e) {
    e.preventDefault();
    // gather inputs
    const age = parseInt(document.getElementById('age').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const heightCm = parseFloat(document.getElementById('height').value);
    const waist = parseFloat(document.getElementById('waist').value);

    if (isNaN(age) || isNaN(weight) || isNaN(heightCm) || isNaN(waist)) {
        riskLevelEl.textContent = 'Validation Error';
        riskMessageEl.textContent = 'Please fill Age, Weight, Height, and Waist.';
        precautionsList.innerHTML = '<li>Please correct the errors above.</li>'; // Clear precautions
        aiPredictionEl.textContent = 'N/A'; // Clear AI prediction
        resultDiv.classList.remove('hidden');
        resultDiv.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);
    
    // --- Get all other values for scoring and saving ---
    const gender = document.getElementById('gender').value;
    const steps = parseInt(document.getElementById('steps').value) || 0;
    const junkFood = parseInt(document.getElementById('junkFood').value) || 0;
    const exercise = parseFloat(document.getElementById('exercise').value) || 0;
    const alcohol = parseInt(document.getElementById('alcohol').value) || 0;
    const smoking = parseInt(document.getElementById('smoking').value) || 0; // 0 or 1
    const sleep = parseFloat(document.getElementById('sleep').value) || 0;
    const stress = parseInt(document.getElementById('stress').value) || 1; // 1, 2, or 3
    const familyHistory = parseInt(document.getElementById('familyHistory').value) || 0; // 0 or 1
    const highBp = document.getElementById('highBp').checked; // true/false
    const diabetes = document.getElementById('diabetes').checked; // true/false
    
    // Optional fields
    const cholesterol = parseInt(document.getElementById('cholesterol').value) || null;
    const rbc = parseFloat(document.getElementById('rbc').value) || null;
    const wbc = parseFloat(document.getElementById('wbc').value) || null;


    // --- Refined Demo Scoring Logic ---
    let score = 0;
    let precautions = [];

    // Age: +1 point per 5 years over 30
    if (age > 30) {
        score += Math.floor((age - 30) / 5);
        if (age > 45) precautions.push("Regular check-ups are crucial given your age.");
    }

    // BMI:
    if (bmi < 18.5) {
        score += 2; // Underweight can also have risks
        precautions.push("Your BMI is in the underweight range. Consult a doctor about healthy weight gain.");
    } else if (bmi >= 25 && bmi < 30) {
        score += 5; // Overweight
        precautions.push("Your BMI is in the overweight range. Focus on portion control and moderate exercise.");
    } else if (bmi >= 30) {
        score += 10; // Obese
        precautions.push("Your BMI is in the obese range. This is a significant risk factor. Please consult a doctor for a weight management plan.");
    }

    // Waist Circumference (Central Obesity)
    if ((gender === 'Male' && waist > 102) || (gender === 'Female' && waist > 88)) {
        score += 7;
        precautions.push("Your waist circumference is high, indicating increased risk. Focus on reducing abdominal fat through diet and exercise.");
    }

    // Smoking:
    if (smoking === 1) {
        score += 10;
        precautions.push("Smoking is a major risk factor. Quitting is the single best thing you can do for your heart health.");
    }

    // Exercise:
    if (exercise < 2.5) { // Less than 2.5 hours/week
        score += 5;
        precautions.push("Aim for at least 150 minutes of moderate exercise (like brisk walking) per week.");
    }
    
    // Steps:
    if (steps < 5000) {
        score += 3;
        if (exercise < 2.5) precautions.pop(); // Avoid redundant message
        precautions.push("Your daily step count is low. Try to gradually increase your daily walking.");
    }
    
    // Diet:
    if (junkFood > 3) {
        score += 4;
        precautions.push("High intake of junk food is detrimental. Focus on whole foods, fruits, and vegetables.");
    }
    
    // Alcohol:
    if ((gender === 'Male' && alcohol > 14) || (gender === 'Female' && alcohol > 7)) {
         score += 3;
         precautions.push("Your alcohol consumption is high. Please consider reducing it to recommended limits (or less).");
    }
    
    // Sleep:
    if (sleep < 6 || sleep > 9) {
         score += 2;
         precautions.push("Aim for 7-8 hours of quality sleep per night, as poor sleep affects heart health.");
    }
    
    // Stress:
    if (stress === 3) { // High stress
        score += 3;
        precautions.push("High stress levels contribute to heart risk. Explore stress-management techniques like mindfulness, yoga, or hobbies.");
    }
    
    // Medical Conditions:
    if (familyHistory === 1) {
        score += 5;
        precautions.push("You have a family history of heart disease, making proactive care very important.");
    }
    if (highBp) {
        score += 8;
        precautions.push("Managing your high blood pressure is critical. Follow your doctor's advice carefully.");
    }
    if (diabetes) {
        score += 8;
        precautions.push("Diabetes significantly increases heart risk. Diligent blood sugar control is essential.");
    }

    // Blood Tests (if provided)
    if (cholesterol && cholesterol > 200) {
        score += (cholesterol > 240) ? 8 : 4;
        precautions.push("Your cholesterol is high. Discuss dietary changes and potential treatment with your doctor.");
    }

    // --- Final Score & UI Update ---
    score = Math.max(0, Math.min(60, score)); // Cap score at 60

    resultDiv.classList.remove('hidden');
    resultDiv.scrollIntoView({ behavior: 'smooth' });
    riskScoreSpan.textContent = score;
    
    // Animate meter fill
    setTimeout(() => {
        meterFill.style.width = `${(score / 60) * 100}%`;
    }, 100); // Small delay to ensure transition happens

    let level = 'Low';
    let levelColor = 'text-green-600';
    if (score >= 40) {
        level = 'High';
        levelColor = 'text-red-600';
    } else if (score >= 20) {
        level = 'Moderate';
        levelColor = 'text-yellow-600';
    }

    // --- NEW CODE ---
    // Update Result Box Background Color based on level
    resultDiv.classList.remove('bg-red-50', 'bg-yellow-50', 'bg-green-50');

    if (level === 'Low') {
        resultDiv.classList.add('bg-green-50'); // Tailwind class for light green
    } else if (level === 'Moderate') {
        resultDiv.classList.add('bg-yellow-50'); // Tailwind class for light yellow
    } else { // High
        resultDiv.classList.add('bg-red-50'); // The default, but good to be explicit
    }
    // --- END NEW CODE ---

    riskLevelEl.textContent = level;
    riskLevelEl.className = `text-xl font-extrabold ${levelColor}`;
    riskMessageEl.textContent = `Your calculated BMI is ${bmi.toFixed(1)}. Based on your inputs, your risk level is ${level}.`;

    // Simulated AI prediction (demo)
    // Make prediction more "real" by adding some noise and basing it on score
    const baseRisk = (score / 60) * 50; // Base risk %
    const noise = (Math.random() - 0.5) * 5; // Add/subtract 2.5%
    const aiRisk = Math.max(1, Math.min(95, baseRisk + noise + (age / 10)));
    aiPredictionEl.textContent = `${aiRisk.toFixed(1)}% 10-year risk (simulated)`;

    // Update Precautions
    if (precautions.length === 0) {
         precautions.push("You're doing great! Keep up the healthy habits.");
    }
    precautions.push("Always consult a medical professional for personalized advice.");
    precautionsList.innerHTML = precautions.map(p => `<li>${p}</li>`).join('');


    // --- Save data ---
    const dataToSave = {
        age, gender, weight, heightCm, waist, bmi: bmi.toFixed(2),
        steps, junkFood, exercise, alcohol, smoking, sleep, stress,
        familyHistory, highBp, diabetes,
        cholesterol, rbc, wbc,
        score, level,
        createdAt: new Date().toISOString() // Use client time as fallback
    };
    
    // This function checks internally if db/auth is ready
    saveHealthData(dataToSave); 
}