import os
import joblib
import json
import hashlib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI(title="FraudGuard AI", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load artifacts ────────────────────────────────────────────────────────────
BASE        = os.path.dirname(__file__)
model       = joblib.load(os.path.join(BASE, "model.pkl"))
scaler      = joblib.load(os.path.join(BASE, "scaler.pkl"))
feature_cols= joblib.load(os.path.join(BASE, "feature_cols.pkl"))
explainer   = shap.TreeExplainer(model)

# ── Load transaction lookup table ─────────────────────────────────────────────
TX_PATH = os.path.join(BASE, "transactions.csv")
df_tx   = pd.read_csv(TX_PATH)
print(f"✅ Loaded {len(df_tx):,} transactions for lookup")
print(f"✅ Model, scaler, and SHAP explainer loaded.")

# ── Schemas ───────────────────────────────────────────────────────────────────
class SimpleTransactionInput(BaseModel):
    amount: float
    time:   Optional[float] = 0.0

class PredictionResult(BaseModel):
    is_fraud:          bool
    fraud_probability: float
    risk_level:        str
    top_features:      List[dict]
    matched_amount:    float
    actual_label:      int

class StatsResult(BaseModel):
    total_transactions: int
    fraud_cases:        int
    fraud_rate:         float
    model_name:         str
    roc_auc:            float

class AuthInput(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    success: bool
    message: str

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_risk_level(prob: float) -> str:
    if prob >= 0.80: return "HIGH"
    if prob >= 0.50: return "MEDIUM"
    if prob >= 0.20: return "LOW"
    return "SAFE"

def find_nearest_transaction(amount: float, time: float) -> pd.Series:
    """Find the real transaction in the dataset closest to given amount & time."""
    df = df_tx.copy()
    # Score by proximity — amount weighted more than time
    df['score'] = (
        ((df['Amount'] - amount) / (df['Amount'].std() + 1e-9)) ** 2 +
        0.3 * ((df['Time'] - time) / (df['Time'].std() + 1e-9)) ** 2
    )
    return df.loc[df['score'].idxmin()]

def build_input_df(row: pd.Series) -> pd.DataFrame:
    v_cols = [f'V{i}' for i in range(1, 29)]
    data = {col: row[col] for col in v_cols}
    df = pd.DataFrame([data])
    df['scaled_Amount'] = (row['Amount'] - df_tx['Amount'].mean()) / df_tx['Amount'].std()
    df['scaled_Time']   = (row['Time']   - df_tx['Time'].mean())   / df_tx['Time'].std()
    return df[feature_cols]

def get_shap_top_features(df_input: pd.DataFrame, n: int = 8) -> List[dict]:
    sv = explainer.shap_values(df_input)
    if isinstance(sv, list):
        sv_fraud = sv[1]
    elif hasattr(sv, 'ndim') and sv.ndim == 3:
        sv_fraud = sv[:, :, 1]
    else:
        sv_fraud = sv
    impacts = pd.Series(sv_fraud[0], index=df_input.columns).abs().sort_values(ascending=False)
    return [{"feature": k, "impact": round(float(v), 4)} for k, v in impacts.head(n).items()]

# ── Auth Helpers ──────────────────────────────────────────────────────────────
USERS_FILE = os.path.join(BASE, "users.json")

def load_users():
    if not os.path.exists(USERS_FILE):
        default_pwd_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        users = {'admin@company.com': default_pwd_hash}
        with open(USERS_FILE, 'w') as f:
            json.dump(users, f)
        return users
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/register", response_model=AuthResponse)
def register_user(auth: AuthInput):
    email = auth.email.strip().lower()
    password = auth.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    
    users = load_users()
    if email in users:
        raise HTTPException(status_code=400, detail="This email is already registered")
    
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    users[email] = pwd_hash
    save_users(users)
    return AuthResponse(success=True, message="User registered successfully")

@app.post("/login", response_model=AuthResponse)
def login_user(auth: AuthInput):
    email = auth.email.strip().lower()
    password = auth.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    
    users = load_users()
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    if email in users and users[email] == pwd_hash:
        return AuthResponse(success=True, message="Authentication successful")
    
    raise HTTPException(status_code=401, detail="Invalid corporate email or security password")

@app.get("/health")
def health():
    return {"status": "ok", "model": "RandomForest", "version": "2.0.0"}

@app.get("/stats", response_model=StatsResult)
def stats():
    return StatsResult(
        total_transactions=284807,
        fraud_cases=492,
        fraud_rate=0.172,
        model_name="Random Forest",
        roc_auc=0.9800,
    )

@app.post("/predict", response_model=PredictionResult)
def predict(tx: SimpleTransactionInput):
    try:
        row      = find_nearest_transaction(tx.amount, tx.time or 0.0)
        df_input = build_input_df(row)
        prob     = float(model.predict_proba(df_input)[0][1])
        features = get_shap_top_features(df_input)
        return PredictionResult(
            is_fraud          = prob >= 0.5,
            fraud_probability = round(prob, 4),
            risk_level        = get_risk_level(prob),
            top_features      = features,
            matched_amount    = round(float(row['Amount']), 2),
            actual_label      = int(row['Class']),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/random_transaction")
def random_transaction(fraud: bool = False):
    """Return a random real transaction for demo purposes."""
    subset = df_tx[df_tx['Class'] == (1 if fraud else 0)]
    row    = subset.sample(1).iloc[0]
    return {
        "amount": round(float(row['Amount']), 2),
        "time":   round(float(row['Time']), 0),
        "actual_label": int(row['Class']),
    }

# ── Serve frontend ────────────────────────────────────────────────────────────
frontend_path = os.path.join(BASE, "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

    @app.get("/")
    def root():
        return FileResponse(os.path.join(frontend_path, "index.html"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)