# 🛡️ FraudGuard AI — Enterprise Transaction Risk Engine

FraudGuard AI is a real-time payment risk assessment engine designed to detect credit card transaction fraud. It integrates a trained Machine Learning classifier, SHAP (SHapley Additive exPlanations) feature attributions, and a dynamic simulator to evaluate transaction threats in under 15ms.

The portal features a premium, responsive layout with a dark theme, custom interactive telemetry widgets, and deep-linkable hash navigation.

---

## 🚀 Key Features

* **💳 Transaction Risk Simulator:** Simulate payment card swipes by entering amounts, time of day, and custom parameters to calculate probability scores.
* **📊 Risk Scorecard:** View transaction verdict states (Passed, Suspicious, Threat) and score probabilities represented on a centered Doughnut Gauge.
* **🧬 SHAP Risk Contribution:** View the localized SHAP impact value breakdown and feature description with interactive sparklines comparing current transaction parameters to legitimate/fraudulent baselines.
* **🔑 Persistent User Access:** Register and login across different devices and reloads using a secure server-side credentials database (`users.json`) protected by SHA-256 password hashing.
* **🔗 Deep-Linkable Hash Routing:** Direct-link or reload tabs naturally (`#/analyse`, `#/history`, `#/developer`) utilizing window hashchange event routing.
* **💻 Developer Portal:** View Sandbox API keys (with an eye hide/show toggle) and access ready-to-use backend SDK implementation snippets (cURL, Python, Node.js).
* **📋 Activity Log:** Keep track of evaluated records with a persistent, filterable audit history complete with PDF report downloads containing dynamic recommendation lists, officer signatures, and diagnostic graphs.

---

## 🛠️ Technology Stack

* **Backend:** FastAPI (Python), Uvicorn, Pandas, Scikit-Learn, Joblib, SHAP
* **Frontend:** Vanilla HTML5, Vanilla CSS3 (Custom design system), Vanilla ES6 JavaScript, Chart.js, jsPDF

---

## 💻 Local Setup & Installation

### 1. Clone the repository and navigate to the directory:
```bash
git clone <your-repository-url>
cd FraudGuardAI
```

### 2. Install dependencies:
```bash
pip install -r requirements.txt
```

### 3. Run the FastAPI development server:
```bash
python3 main.py
```
*The server will start on `http://localhost:8000/`.*

### 4. Open in browser:
Open **[http://localhost:8000/](http://localhost:8000/)** to access the dashboard console.

---

## ☁️ Production Deployment

The project is pre-configured for one-click deployment on **Render.com** or **Railway.app**:

1. **GitHub Upload:** Push your local repository to a new GitHub repository.
2. **PaaS Configuration:** Connect your repository to Render/Railway as a **Web Service**.
3. **Build settings:**
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python3 main.py`
4. **Environment Variables:** Define the environment variable `PORT` = `8000`.

---

## 🔒 Security Best Practices

1. **Pre-Seeded Credentials:** The default admin username is `admin@company.com` with password `admin123`. For production deployments, register your own administrator account and delete/overwrite the default credentials inside `users.json`.
2. **Uvicorn Reloading:** In live environments, start the service without the reload command to improve processing throughput and memory footprints:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
