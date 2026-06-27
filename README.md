# 🛡️ FraudGuard AI — Enterprise Transaction Risk Engine

FraudGuard AI is a state-of-the-art, responsive web application designed to help merchants, security analysts, and compliance officers identify credit card transaction fraud instantly and access actionable mitigations. It combines real-time Machine Learning prediction with SHAP (SHapley Additive exPlanations) attribution, a live simulated traffic monitor, secure server-side user credentials, and detailed PDF audit compliance report exports.

---

## 🚀 Live Links
* **Production Console & API URL:** [https://fraudguard-ai-iyvm.onrender.com/](https://fraudguard-ai-iyvm.onrender.com/)
*(Served as a unified deployment hosting both the FastAPI backend routes and static HTML/CSS/JS frontend files)*

---

## ✨ Features

### 1. 💳 Real-time Transaction Simulator
* **Parameter Controls:** Input transaction amounts, times of day, and custom parameters to calculate probability threat scores.
* **Quick Presets:** Select preset buttons to instantly load legitimate or fraudulent swiping signatures for evaluation.
* **Guide Box:** Features a collapsible simulator guide explaining metadata matching against baseline profiles.

### 2. 📊 Risk Scorecard & Gauge
* **Centered Metrics:** Displays risk classification verdicts (Approved, Suspicious, Declined) and score probabilities.
* **Responsive Doughnut Chart:** Centers values inside a custom Chart.js doughnut ring that dynamically re-skins colors based on light/dark mode theme configurations.

### 3. 🧬 SHAP Heuristics Diagnostic Grid
* **Influence Labeling:** Maps raw attribution impact to qualitative weights (*Critical Signal*, *High Influence*, *Moderate Weight*).
* **Interactive Sparklines:** Explores values on symptom timelines showing where the current parameter sits compared to legitimate and fraudulent baseline thresholds.
* **Tooltip Guides:** Hover question mark tags to view physiological descriptions of SHAP features.

### 4. 🚦 Real-time Traffic Feed
* **Live Monitor:** Toggles a live background transaction throughput stream.
* **Live Pill Status:** Highlights connection statuses (*Engine online* / *Local sandbox*) dynamically with pulsing indicators.

### 5. 🔐 Access Control & Session Management
* **Secure Database:** Persists corporate user accounts in a backend JSON file (`users.json`) secured with SHA-256 password hashing.
* **Eye Visibility Toggle:** Protects password typing with a custom show/hide toggler.
* **Hash-Based Router:** Deep-link directly into tab views (`#/analyse`, `#/history`, `#/developer`) on page loads or refreshes.

### 6. 📋 Filterable Activity Log
* **Search & Filters:** Filter logs by transaction ID reference, status, risk level, or amount.
* **Persistent Storage:** History stays saved for specific logged-in users even across restarts.

### 7. 📝 Styled PDF Audit Reports
* **Custom Signatures:** Generated documents contain Lead Security Analyst and Chief Compliance Officer signatures.
* **Diagnostic Charts:** Draws SHAP impact bars directly on the PDF canvas using custom RGB color translations.

### 8. 🔑 Developer Sandbox Portal
* **Authorization Headers:** Showcases REST API documentation with sandbox key generators (with eye visibility controls) and implementation snippets for Python, Node.js, and cURL.

---

## 🛠️ Technology Stack

* **Frontend:** HTML5, Vanilla CSS3 (Custom design system), ES6 JavaScript, Chart.js, jsPDF.
* **Backend:** FastAPI (Python), Joblib, Pandas, SHAP, Scikit-learn, Uvicorn.
* **Models:** Pre-trained Random Forest/XGBoost classifier (`model.pkl`) and scaler (`scaler.pkl`) running under 100MB RAM.

---

## 📦 Local Setup Instructions

### 1. Prerequisites
* Python 3.9 - 3.11

### 2. Backend & Frontend Setup
Navigate to the project root folder:
```bash
cd FraudGuardAI
```

Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Start the FastAPI development server:
```bash
python3 main.py
```
*The server will start on `http://localhost:8000/`. You can access both the web UI and REST endpoints on this port.*

---

## 🚀 Deployment Guide

The app is pre-configured for one-click deployment on **Render.com** or **Railway.app**:

* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `python3 main.py` or `uvicorn main:app --host 0.0.0.0 --port $PORT`
* **Environment Variables:** Set `PORT` = `8000`.

---

## 👨‍💻 Made By
* **Aniket Kumar Singh**
* BTech CSE
* VIT Bhopal University (2024-2028)
